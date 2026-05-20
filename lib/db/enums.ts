/**
 * String-union mirrors of the Postgres enums defined in
 * `supabase/migrations/0001_init.sql`. Keep these in lockstep with the SQL —
 * the database is the source of truth, these are just type-safety surfaces.
 */

export const CANDIDATE_STAGES = [
  "applied",
  "screening",
  "prescreen_call",
  "first_interview",
  "offer",
  "hired",
  "rejected",
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const CANDIDATE_SOURCES = [
  "linkedin",
  "jobsdb",
  "referral",
  "paste",
  "pdf",
  "screenshot",
  "thirdparty_api",
  "extension",
  "manual",
  "outbound_sourced",
] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const INTERVIEW_STATUSES = [
  "scheduled",
  "rescheduled",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const AUDIT_ACTIONS = ["insert", "update", "delete"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const INVITE_STATUSES = [
  "pending",
  "accepted",
  "expired",
  "revoked",
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const APP_ROLES = ["owner", "member"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ATTACHMENT_KINDS = ["cv_pdf", "screenshot", "other"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const EMAIL_DRAFT_STATUSES = ["drafted", "sent", "discarded"] as const;
export type EmailDraftStatus = (typeof EMAIL_DRAFT_STATUSES)[number];

/**
 * Human-readable labels for stages — used by Kanban column headers and
 * the candidate detail view. Kept here next to the enum so renames stay
 * synchronized.
 */
export const STAGE_LABELS: Record<CandidateStage, string> = {
  applied: "Applied",
  screening: "Screening",
  prescreen_call: "Prescreen Call",
  first_interview: "First Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export const SOURCE_LABELS: Record<CandidateSource, string> = {
  linkedin: "LinkedIn",
  jobsdb: "JobsDB",
  referral: "Referral",
  paste: "Paste",
  pdf: "PDF",
  screenshot: "Screenshot",
  thirdparty_api: "Third-party API",
  extension: "Extension",
  manual: "Manual",
  outbound_sourced: "Outbound sourced",
};
