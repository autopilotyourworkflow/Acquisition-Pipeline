# Phase 4a — AI prompt-builder questionnaire

Paste into a fresh Claude Code chat.

---

I'm continuing the Hotel Plus take-home. Phases 1, 2, 3 done; pre-Phase-4 conflict detection shipped. AGENTS.md is autoloaded — **trust it as the source of truth; do not re-read it for context.**

## Do NOT do these things
- Don't re-read `cowork-log.md`, `lib/anthropic/client.ts`, `lib/audit/wrap.ts`, or any existing files for "understanding" — AGENTS.md has the contracts.
- Don't spawn Explore agents for codebase shape.
- Don't audit directory structure — AGENTS.md has the inventory.
- Don't deliberate on the contracts below — they're locked.
- **Don't build this as multi-turn chat.** Questionnaire form, one Claude call. The earlier draft of this prompt proposed a chat; that was changed deliberately.

## Goal
When the user creates or edits a JD, offer an AI-assisted button that opens a **questionnaire dialog** (NOT a chat). User answers 5 structured questions + 3 free-text prompts, hits Generate, Haiku 4.5 returns a tailored scoring persona. User edits, then saves to `scoring_persona_override` on the JD. Turns the per-JD override (Phase 2 feature) from a power-user knob into something anyone can use well.

## Pre-decided contracts
- **Form shape, not chat.** Five dropdowns + three textareas + a Generate button. One Claude call on submit. No SSE, no multi-turn state.
- **Model:** `claude-haiku-4-5`. ~$0.005 per generation. Use `callWithTool` from `lib/anthropic/client.ts`.
- **Persona inheritance:** the generated persona inherits the structure of the global active prompt (rubric + anti-bias framing + tool-only output requirement). Use `loadActiveScoringPrompt()` to fetch the global default and include it as **structural reference** in the interviewer's system prompt — instruct the model to keep the rubric and anti-bias scaffolding, only customize the role-specific layer.
- **Output via tool-use forcing.** Tool returns `{ persona_text: string; summary: string }`. `persona_text` drops directly into `scoring_persona_override`; `summary` is a one-paragraph rationale shown to the user for confidence-building.
- **Audit:** the final save (writing `persona_text` to the JD row) goes through the existing `updateJd` server action, which already wraps `withAudit`. The Generate call itself is read-only — no audit wrap.

## Form fields

**Dropdowns (5):**
1. **Seniority** — entry / mid / senior / principal / executive
2. **Top quality wanted** — tech depth / shipping speed / collaboration / business acumen / creative judgment / domain expertise
3. **Years of experience** — 0–2 / 3–5 / 5–10 / 10+
4. **Team size they'll work in** — solo / small (2–5) / mid (5–15) / large (15+)
5. **Hiring urgency** — exploratory / soon / urgent (affects how harshly to flag near-misses)

**Textareas (3):**
1. **A 9/10 candidate looks like…** — placeholder: "e.g. shipped a B2B product end-to-end, comfortable with ambiguity, can read SQL"
2. **A 3/10 candidate looks like…** — placeholder: "e.g. only tutorial-grade portfolio, vague impact stories, no production exposure"
3. **Anti-bias considerations** — placeholder: "e.g. don't penalize CVs without CS coursework for design roles; weight outcomes over titles"

## Files to create
1. `lib/anthropic/prompts/persona-questionnaire.ts` — exports `buildPersonaPrompt(answers, globalActivePersona)`:
   - System message: instructs the model to act as a "scoring-persona drafter" that takes the structured answers and produces a persona text. References the global active persona by name and instructs the model to inherit its rubric/anti-bias scaffolding. Caps `persona_text` length (~800 words).
   - User message: a clean JSON/labeled-list dump of the user's answers.
   - Returns `{ system: CacheableTextBlock[]; messages: [user] }` for `callWithTool`.
2. `lib/anthropic/tools/propose_scoring_persona.ts` — zod tool def. Output schema: `{ persona_text: z.string().min(200).max(8000); summary: z.string().min(50).max(800) }`.
3. `app/api/jds/propose-prompt/route.ts` — POST. Body: `{ jdContext?: { title, body, mustHave }; answers: {...} }`. Server: auth-gates, calls `loadActiveScoringPrompt()`, calls `callWithTool` with the questionnaire prompt + tool, returns `{ ok: true, data: { persona_text, summary } }` or `{ ok: false, error }`. Returns the response JSON directly (no SSE).
4. `components/jds/PersonaQuestionnaire.client.tsx` — dialog component (uses `components/ui/dialog.tsx`).
   - State: form values + loading state + result.
   - On Submit: POST to `/api/jds/propose-prompt`, show spinner ~3–5s, then render the proposed persona in an editable textarea + the summary as a smaller paragraph.
   - Footer buttons: "Cancel" (closes) and "Use for this JD" (calls `updateJd({ jdId, patch: { scoring_persona_override: editedText } })` server action, then closes + toasts success).
5. JD editor wiring: in `app/(dashboard)/jds/jd-editor.client.tsx`, add an **"AI-assisted: help me write this"** button next to the existing "Advanced — custom scoring persona" section. Click → opens the dialog.

## Out of scope (do NOT build)
- Multi-turn chat refinement (the earlier draft of this prompt suggested this — we chose questionnaire instead)
- A "persona library" of saved templates
- Version history of generated personas (existing prompt versioning at `scoring_prompts` covers global; JD-level override doesn't need its own version history for the take-home)
- Voice / image input on the form
- Streaming the persona text token-by-token (just drop in the final string when Generate completes)

## Smoke tests
- [ ] Open a JD in `/jds/[id]` → click "AI-assisted: help me write this" → dialog opens with the form
- [ ] Fill out the form (try a Senior + Tech depth + 5–10yrs + small team + urgent combo) → Generate → spinner → ~3–5s later, persona appears in editable textarea + summary visible
- [ ] Edit one sentence in the textarea → click "Use for this JD" → toast confirms save
- [ ] Re-open the JD editor → "Advanced — custom scoring persona" textarea is populated with the edited text
- [ ] Re-score a candidate against this JD → the ScoreCard reflects the new persona's style
- [ ] Activity log on `/activity` shows the JD update entry
- [ ] Submit empty form → field-level required errors (don't call the API with empty answers)

## First action
Confirm with Ben that the cost ceiling (~$0.005/generation) is acceptable, then build straight through. No proposal phase — the contracts above are locked.

## Last action (mandatory)
Emit the **Session-done report** described in AGENTS.md → Session-done reporting. Then STOP.
