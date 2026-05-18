/**
 * Single-org MVP: every row lives under one hardcoded org. The column exists
 * (and RLS policies key off it via `is_same_org`) so converting to multi-org
 * later is a data migration, not a schema migration.
 *
 * Must match the DEFAULT in supabase/migrations/0001_init.sql.
 */
export const ORG_ID = "00000000-0000-0000-0000-000000000001";
