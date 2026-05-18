import type {
  AttachmentKind,
  CandidateSource,
  CandidateStage,
} from "@/lib/db/enums";

/**
 * Row shapes that mirror the Postgres schema. Kept hand-written rather than
 * generated so the surface stays small. If we add more tables we should
 * switch to `supabase gen types`.
 */

export type CandidateRow = {
  id: string;
  org_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  current_title: string | null;
  location: string | null;
  linkedin_url: string | null;
  source: CandidateSource;
  source_url: string | null;
  stage: CandidateStage;
  jd_id: string | null;
  applied_at: string;
  raw_profile: Record<string, unknown> | null;
  notes: string | null;
  row_hash: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type JdRow = {
  id: string;
  org_id: string;
  title: string;
  department: string | null;
  location: string | null;
  body_markdown: string;
  must_have: string[];
  nice_to_have: string[];
  weights: { skills: number; experience: number; culture: number };
  threshold: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AttachmentRow = {
  id: string;
  org_id: string;
  candidate_id: string | null;
  kind: AttachmentKind;
  storage_path: string;
  mime_type: string | null;
  bytes: number | null;
  parsed_text: string | null;
  created_at: string;
};

export type ScoreRow = {
  id: string;
  org_id: string;
  candidate_id: string;
  jd_id: string;
  skills_score: number;
  experience_score: number;
  culture_score: number;
  weighted_total: number;
  reasoning: { skills: string; experience: string; culture: string };
  strengths: string[];
  gaps: string[];
  prep_questions: string[];
  hiring_report: string | null;
  model: string;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  created_by: string | null;
  created_at: string;
};
