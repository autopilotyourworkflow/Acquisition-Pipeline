/**
 * POST /api/source/run
 *
 * Body: {
 *   jdId: string,
 *   platforms: SourcingPlatform[],
 *   n: number (5..50)
 * }
 *
 * SSE events emitted: see lib/sourcing/types.ts → SourcingEvent.
 * The async generator in lib/sourcing/run.ts owns the actual flow; this
 * route just authenticates, validates, and bridges the generator to SSE.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSourcing } from "@/lib/sourcing/run";
import type { SourcingPlatform } from "@/lib/sourcing/types";
import { SOURCING_PLATFORMS } from "@/lib/sourcing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sourcing fans out several Proxycurl + scoring calls; bump the function
// budget for Vercel so it isn't killed mid-run.
export const maxDuration = 300;

type RequestBody = {
  jdId: string;
  platforms: SourcingPlatform[];
  n: number;
};

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  if (!body.jdId || typeof body.jdId !== "string") {
    return new Response(JSON.stringify({ error: "jdId is required" }), { status: 400 });
  }
  const platforms = (body.platforms ?? []).filter((p): p is SourcingPlatform =>
    SOURCING_PLATFORMS.includes(p),
  );
  if (platforms.length === 0) {
    return new Response(
      JSON.stringify({ error: "At least one platform is required" }),
      { status: 400 },
    );
  }
  const n = Math.max(1, Math.min(50, Math.floor(Number(body.n) || 0)));
  if (n < 1) {
    return new Response(JSON.stringify({ error: "n must be >= 1" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      try {
        for await (const ev of runSourcing({
          jdId: body.jdId,
          userId: user.id,
          platforms,
          n,
        })) {
          // SSE event name = our union's `type` discriminator.
          emit(ev.type, ev);
        }
      } catch (err) {
        emit("error", {
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
