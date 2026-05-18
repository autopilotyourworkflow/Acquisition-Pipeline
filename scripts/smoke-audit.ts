/**
 * Smoke test: run a `withAudit`-wrapped update against the seed JD and
 * confirm an activity_log entry appears. Mutates+reverts the title so the
 * row ends in its original state.
 *
 * Run: node --env-file=.env.local --import tsx scripts/smoke-audit.ts
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { withAudit, computeRowHash } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";

async function main() {
  const admin = createAdminClient();

  // Pick any owner/member user as the actor.
  const { data: actor, error: actorErr } = await admin
    .from("users")
    .select("id, email")
    .limit(1)
    .single();
  if (actorErr || !actor) throw new Error(`No user found: ${actorErr?.message}`);
  console.log(`Using actor: ${actor.email} (${actor.id})`);

  // Fetch the seed JD.
  const { data: jd, error: jdErr } = await admin
    .from("job_descriptions")
    .select("*")
    .eq("title", "Full Stack Developer")
    .limit(1)
    .single();
  if (jdErr || !jd) throw new Error(`Seed JD not found: ${jdErr?.message}`);
  console.log(`Found JD: ${jd.id} — "${jd.title}"`);

  const originalTitle = jd.title;
  const probeTitle = `${originalTitle} (smoke ${Date.now()})`;

  // Mutate via withAudit
  const result = await withAudit({
    actorId: actor.id,
    orgId: ORG_ID,
    action: "update",
    table: "job_descriptions",
    targetId: jd.id,
    before: jd,
    mutate: async () => {
      const { data, error } = await admin
        .from("job_descriptions")
        .update({ title: probeTitle })
        .eq("id", jd.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });

  console.log(`withAudit returned logId=${result.logId} afterHash=${result.afterHash?.slice(0, 16)}…`);

  // Verify the audit row exists.
  const { data: logRow, error: logErr } = await admin
    .from("activity_log")
    .select("*")
    .eq("id", result.logId)
    .single();
  if (logErr || !logRow) throw new Error(`Audit row not found: ${logErr?.message}`);

  console.log(`activity_log row: action=${logRow.action} target_table=${logRow.target_table} actor=${logRow.actor_id}`);
  console.log(`  before.title=${(logRow.before as { title?: string })?.title}`);
  console.log(`  after.title=${(logRow.after as { title?: string })?.title}`);
  console.log(`  after_hash matches: ${logRow.after_hash === result.afterHash}`);

  // Revert the title (also via withAudit so we leave a clean undo trail).
  const revert = await withAudit({
    actorId: actor.id,
    orgId: ORG_ID,
    action: "update",
    table: "job_descriptions",
    targetId: jd.id,
    before: result.after,
    mutate: async () => {
      const { data, error } = await admin
        .from("job_descriptions")
        .update({ title: originalTitle })
        .eq("id", jd.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });
  console.log(`Reverted title — logId=${revert.logId}`);

  // computeRowHash check
  const synthetic = { title: "x", foo: "y", row_hash: "ignored", updated_at: new Date() };
  const hashA = computeRowHash(synthetic);
  const hashB = computeRowHash({ ...synthetic, row_hash: "changed", updated_at: new Date() });
  console.log(`computeRowHash stable under row_hash + updated_at churn: ${hashA === hashB}`);

  console.log("\n✅ withAudit smoke test passed.");
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
