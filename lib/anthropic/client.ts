import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  RawMessageStreamEvent,
  TextBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

/**
 * The one place all Claude calls flow through. Every feature talks to Claude
 * through `callWithTool` / `streamWithTool`. No `@anthropic-ai/sdk` imports
 * anywhere else in the codebase — keeps retry, telemetry, and prompt caching
 * uniform across surfaces.
 */

export type ModelId = "claude-opus-4-7" | "claude-haiku-4-5";

/**
 * Anthropic published $/M token rates per model class. Cache-read is 10% of
 * input cost (standard discount). Cache-write is 1.25x input cost (5-minute
 * cache). Update when the rate card changes.
 */
const PRICING: Record<ModelId, {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}> = {
  "claude-opus-4-7": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-haiku-4-5": {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
};

/**
 * A piece of system content that may be marked as cacheable. We use this for
 * stable, large content (JD body) that we re-send across many calls — the
 * Anthropic prompt cache lets repeat calls reuse the prefix.
 */
export type CacheableTextBlock = {
  type: "text";
  text: string;
  cache?: boolean; // → cache_control: { type: "ephemeral" }
};

/**
 * A tool definition. Validation is part of the contract: the validator is
 * zod-backed in lib/anthropic/tools/* so the call site gets a typed value
 * (not `unknown`) back.
 */
export type ToolDefinition<T> = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  validate: (raw: unknown) => T;
};

export type ClaudeTelemetry = {
  model: ModelId;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
  retries: number;
  duration_ms: number;
};

export type ToolCallResult<T> = {
  value: T;
  telemetry: ClaudeTelemetry;
};

export type StreamingToolCall<T> = {
  /** Live stream of MessageStreamEvent — pipe to SSE for the ScoreCard UI. */
  stream: AsyncIterable<RawMessageStreamEvent>;
  /** Resolves when the stream closes, with validated tool input + telemetry. */
  result: Promise<ToolCallResult<T>>;
};

export class ClaudeToolMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeToolMissingError";
  }
}

export class ClaudeCallError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ClaudeCallError";
  }
}

/**
 * Validation failure on the tool input. Wraps a ZodError but ALSO carries the
 * telemetry from the underlying API call — so the UI can show the user that
 * tokens were spent even on a failed score.
 */
export class ClaudeValidationError extends Error {
  constructor(
    message: string,
    public readonly telemetry: ClaudeTelemetry,
    public readonly issues: unknown,
    public readonly rawInput: unknown,
  ) {
    super(message);
    this.name = "ClaudeValidationError";
  }
}

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 8000;
const RETRY_JITTER = 0.25;
const DEFAULT_MAX_TOKENS = 4096;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeCallError(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local before calling Claude.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

function toSystemBlocks(system: CacheableTextBlock[]): TextBlockParam[] {
  return system.map((b) => {
    const block: TextBlockParam = { type: "text", text: b.text };
    if (b.cache) {
      block.cache_control = { type: "ephemeral" };
    }
    return block;
  });
}

function computeCost(
  model: ModelId,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  },
): number {
  const rates = PRICING[model];
  const millions = 1_000_000;
  return (
    (usage.input_tokens * rates.input) / millions +
    (usage.output_tokens * rates.output) / millions +
    (usage.cache_creation_input_tokens * rates.cacheWrite) / millions +
    (usage.cache_read_input_tokens * rates.cacheRead) / millions
  );
}

/**
 * Build the params object for messages.create / messages.stream, omitting
 * `temperature` when the model rejects it. Claude Opus 4.7 deprecated the
 * `temperature` parameter (the API returns 400 if it's set, regardless of
 * value). For Haiku and earlier Opus we still pass `args.temperature ?? 0`
 * so existing scoring + team-mode behavior is preserved.
 */
type BaseParams = Omit<
  Parameters<Anthropic["messages"]["create"]>[0],
  "stream"
>;
function buildMessageParams<T>(args: {
  model: ModelId;
  system: CacheableTextBlock[];
  messages: MessageParam[];
  tool: ToolDefinition<T>;
  maxTokens?: number;
  temperature?: number;
}): BaseParams {
  const params: BaseParams = {
    model: args.model,
    max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: toSystemBlocks(args.system),
    messages: args.messages,
    tools: [
      {
        name: args.tool.name,
        description: args.tool.description,
        input_schema:
          args.tool.input_schema as Anthropic.Messages.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: args.tool.name },
  };
  if (args.model !== "claude-opus-4-7") {
    params.temperature = args.temperature ?? 0;
  }
  return params;
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) return true;
    if (error.status !== undefined && error.status >= 500) return true;
  }
  return false;
}

function retryDelay(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (!Number.isNaN(secs) && secs > 0) {
      return Math.min(secs * 1000, RETRY_MAX_DELAY_MS);
    }
  }
  const base = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** attempt,
    RETRY_MAX_DELAY_MS,
  );
  const jitter = base * RETRY_JITTER * (Math.random() * 2 - 1);
  return Math.max(0, base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  op: (attempt: number) => Promise<T>,
): Promise<{ value: T; retries: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const value = await op(attempt);
      return { value, retries: attempt };
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err) || attempt === RETRY_MAX_ATTEMPTS - 1) {
        break;
      }
      const retryAfter =
        err instanceof Anthropic.APIError
          ? (err.headers?.["retry-after"] ?? null)
          : null;
      await sleep(retryDelay(attempt, retryAfter));
    }
  }
  if (lastErr instanceof Anthropic.APIError) {
    throw new ClaudeCallError(
      `Anthropic API error (status ${lastErr.status}): ${lastErr.message}`,
      lastErr.status,
      lastErr,
    );
  }
  throw lastErr;
}

function extractToolInput(message: Message, toolName: string): unknown {
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === toolName) {
      return (block as ToolUseBlock).input;
    }
  }
  throw new ClaudeToolMissingError(
    `Expected tool_use block for tool '${toolName}' but found none. ` +
      `stop_reason=${message.stop_reason}`,
  );
}

/**
 * One-shot Claude call with structured output via tool-use forcing.
 * The model is required to call `args.tool` — its response is validated
 * by the tool's zod parser and returned alongside cost telemetry.
 *
 * `temperature` defaults to 0 for maximum determinism — we want the same
 * inputs to produce the same outputs as much as the model allows. Callers
 * can override per-call if they need creative diversity.
 */
export async function callWithTool<T>(args: {
  model: ModelId;
  system: CacheableTextBlock[];
  messages: MessageParam[];
  tool: ToolDefinition<T>;
  maxTokens?: number;
  temperature?: number;
}): Promise<ToolCallResult<T>> {
  const client = getClient();
  const started = Date.now();

  const { value: message, retries } = await withRetry((_attempt) =>
    client.messages.create(buildMessageParams(args)),
  );

  const usage = {
    input_tokens: message.usage?.input_tokens ?? 0,
    output_tokens: message.usage?.output_tokens ?? 0,
    cache_creation_input_tokens:
      message.usage?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: message.usage?.cache_read_input_tokens ?? 0,
  };

  const telemetry: ClaudeTelemetry = {
    model: args.model,
    ...usage,
    cost_usd: computeCost(args.model, usage),
    retries,
    duration_ms: Date.now() - started,
  };

  const rawInput = extractToolInput(message, args.tool.name);
  let value: T;
  try {
    value = args.tool.validate(rawInput);
  } catch (err) {
    // Tokens were spent even though the validation failed — carry the
    // telemetry through so the UI can surface the cost honestly.
    throw new ClaudeValidationError(
      err instanceof Error ? err.message : "Validation failed",
      telemetry,
      err,
      rawInput,
    );
  }

  return { value, telemetry };
}

/**
 * Streaming variant. Returns a live event stream (for SSE → UI) and a Promise
 * that resolves with the validated final tool input + telemetry once the
 * stream closes. Retry policy is the same — we retry the WHOLE stream from
 * the start, not mid-stream.
 *
 * Useful for the ScoreCard, where we want to show the user that Claude is
 * working in real time rather than hiding behind a spinner.
 */
export function streamWithTool<T>(args: {
  model: ModelId;
  system: CacheableTextBlock[];
  messages: MessageParam[];
  tool: ToolDefinition<T>;
  maxTokens?: number;
  temperature?: number;
}): StreamingToolCall<T> {
  const client = getClient();
  const started = Date.now();

  let resolveResult: (r: ToolCallResult<T>) => void;
  let rejectResult: (err: unknown) => void;
  const resultPromise = new Promise<ToolCallResult<T>>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  async function* run(): AsyncIterable<RawMessageStreamEvent> {
    try {
      const { value: stream, retries } = await withRetry(async () =>
        client.messages.stream(buildMessageParams(args)),
      );

      for await (const event of stream) {
        yield event;
      }

      const finalMessage = await stream.finalMessage();
      const usage = {
        input_tokens: finalMessage.usage?.input_tokens ?? 0,
        output_tokens: finalMessage.usage?.output_tokens ?? 0,
        cache_creation_input_tokens:
          finalMessage.usage?.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: finalMessage.usage?.cache_read_input_tokens ?? 0,
      };
      const telemetry: ClaudeTelemetry = {
        model: args.model,
        ...usage,
        cost_usd: computeCost(args.model, usage),
        retries,
        duration_ms: Date.now() - started,
      };

      const rawInput = extractToolInput(finalMessage, args.tool.name);
      let value: T;
      try {
        value = args.tool.validate(rawInput);
      } catch (err) {
        rejectResult(
          new ClaudeValidationError(
            err instanceof Error ? err.message : "Validation failed",
            telemetry,
            err,
            rawInput,
          ),
        );
        return;
      }

      resolveResult({ value, telemetry });
    } catch (err) {
      rejectResult(err);
      throw err;
    }
  }

  return { stream: run(), result: resultPromise };
}
