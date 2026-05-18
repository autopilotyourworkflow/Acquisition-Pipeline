import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditAction } from "@/lib/db/enums";

/**
 * Audit wrapper — every mutation flows through this so the activity log and
 * the per-user undo backbone capture every change.
 *
 * Design contract (locked in plan-acquisition-pipeline-toasty-quail.md):
 *  - The mutation runs on whatever Supabase client the caller closes over
 *    (user-scoped, RLS-enforced). The audit-log insert is the ONLY thing that
 *    uses the service-role client, because the `activity_log` table has only a
 *    SELECT policy — direct INSERTs from a user-scoped client would be denied.
 *  - Hash of the after-state is stored on the audit row AND (where the table
 *    supports it) on the row itself, via `computeRowHash` called inside the
 *    mutation. The hash is what Undo uses to detect concurrent edits.
 *  - On audit-insert failure after a successful mutation we throw an
 *    `AuditWriteFailedError`. The mutation has already committed at that point,
 *    so the user sees an error against a successful side effect. Acceptable for
 *    this take-home; a production version would wrap both writes in a Postgres
 *    rpc() for atomicity.
 */

export class AuditWriteFailedError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = "AuditWriteFailedError";
  }
}

export type WithAuditInput<T extends Record<string, unknown>> = {
  actorId: string;
  orgId: string;
  action: AuditAction;
  table: string;
  targetId: string;
  before: Record<string, unknown> | null;
  mutate: () => Promise<T | null>;
};

export type WithAuditResult<T extends Record<string, unknown>> = {
  after: T | null;
  logId: string;
  afterHash: string | null;
};

export async function withAudit<T extends Record<string, unknown>>(
  input: WithAuditInput<T>,
): Promise<WithAuditResult<T>> {
  const after = await input.mutate();

  const afterHash = after ? sha256Hex(canonicalJSON(after)) : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activity_log")
    .insert({
      org_id: input.orgId,
      actor_id: input.actorId,
      action: input.action,
      target_table: input.table,
      target_id: input.targetId,
      before: input.before,
      after: after ?? null,
      after_hash: afterHash,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[withAudit] activity_log insert failed", {
      table: input.table,
      targetId: input.targetId,
      error,
    });
    throw new AuditWriteFailedError(
      `Failed to write activity_log entry for ${input.action} on ${input.table}:${input.targetId}`,
      error,
    );
  }

  return { after, logId: data.id, afterHash };
}

/**
 * RFC-8785-ish canonical JSON: keys sorted at every level, no whitespace,
 * undefined omitted, Date → ISO string. Deterministic enough for hashing —
 * the only requirement is that two structurally-equal rows produce the same
 * string on the same Node version.
 */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      sorted[key] = canonicalize(v);
    }
    return sorted;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute the row_hash for a row. The row_hash column lives on tables that
 * Undo cares about (candidates) so the conflict check can compare a single
 * value rather than re-canonicalizing the whole row at undo time.
 *
 * We exclude `row_hash` and the timestamps from the hash itself — otherwise
 * the hash would be self-referential and `updated_at` churn would invalidate
 * comparisons that didn't actually change anything semantic.
 */
export function computeRowHash<T extends Record<string, unknown>>(row: T): string {
  const { row_hash: _omit_hash, updated_at: _omit_updated, ...rest } = row as Record<
    string,
    unknown
  >;
  void _omit_hash;
  void _omit_updated;
  return sha256Hex(canonicalJSON(rest));
}
