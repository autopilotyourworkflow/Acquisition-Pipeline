# Phase 4a — AI prompt-builder interview

I'm continuing the Hotel Plus take-home. Phases 1, 2, 3 done. AGENTS.md is autoloaded — **trust it as the source of truth; do not re-read it for context.**

## Do NOT do these things
- Don't re-read `cowork-log.md`, `lib/anthropic/client.ts`, `lib/audit/wrap.ts`, or any existing files for "understanding" — AGENTS.md has the contracts.
- Don't spawn Explore agents for "what does this codebase look like" questions.
- Don't audit directory structure — AGENTS.md has the inventory.
- Don't load `PROJECT_MASTER.md` or the original plan.
- Don't deliberate on the contracts below — they're locked.

## Goal
When a user creates or edits a JD, offer an AI-driven chat that asks 4–6 focused questions about the role and drafts a tailored scoring persona. Output gets saved as the JD's `scoring_persona_override`. Turns a power-user feature into something anyone can use well.

## Pre-decided contracts
- **Model:** `claude-haiku-4-5`. Multi-turn conversation, low stakes. ~$0.005-0.01 per full interview.
- **Multi-turn shape:** client manages the message array. POSTs `{ messages: [...] }` per turn to `/api/jds/propose-prompt` (SSE). The route appends the model's response, streams it back. Tool-use forcing only on the final turn (when the model decides it has enough info and calls `propose_scoring_persona`).
- **Persona structure:** the proposed persona inherits the active global prompt's structure (rubric + anti-bias framing) and customizes the role-specific layer. Use `loadActiveScoringPrompt()` to fetch the global default and reference it in the interviewer's system prompt.
- **Safety net:** cap conversations at 10 turns. If the model hasn't called the tool by turn 10, force the tool call with a directive.

## Files to create
1. `lib/anthropic/prompts/persona-interview.ts` — interviewer system prompt. Question topics: seniority, single most-important quality, anti-bias considerations, "9/10 candidate" picture, "3/10 candidate" picture, domain signals. Conversation strategy: 1–2 questions per turn, free-text answers, allow "skip — smart default" on any question.
2. `lib/anthropic/tools/propose_scoring_persona.ts` — zod tool definition. Returns `{ persona_text: string; summary: string }`. `persona_text` is the full persona ready to drop into `scoring_persona_override`; `summary` is a one-paragraph rationale shown to the user for confidence.
3. `app/api/jds/propose-prompt/route.ts` — SSE endpoint. POST `{ messages: [...] }` per turn. Streams model output. Final turn calls the tool and returns `{ persona_text, summary }` in a `complete` event. Auth-gated like all our APIs.
4. `components/jds/PromptInterview.client.tsx` — chat UI. Message bubbles, input box, send button, "skip" quick action. On `complete` event, renders a pre-filled textarea with the proposed persona + summary, plus a "Use for this JD" button that calls a server action.
5. JD editor wiring: add an "AI-assisted: help me write this" button next to the "Advanced — custom scoring persona" section in `app/(dashboard)/jds/jd-editor.client.tsx`.

## Out of scope (do NOT build)
- Voice input / image input on the chat
- A "persona library" of saved templates
- Version history of generated personas (existing prompt versioning covers JD-level)
- Multi-language UI on the interview
- Streaming the persona text token-by-token in the textarea (just drop in the final string)

## Smoke tests
- [ ] Click "AI-assisted" on JD editor → dialog opens with a first question from the model
- [ ] Answer 4-6 questions → at some point, the model proposes a persona via the tool
- [ ] Proposed persona renders in an editable textarea + summary paragraph visible
- [ ] Edit a sentence → click "Use for this JD" → JD's `scoring_persona_override` updates (verify via SQL)
- [ ] Re-score a candidate against this JD → ScoreCard reflects the new persona's style
- [ ] Force the safety net: send a non-substantive message 10 times → tool gets called anyway

## First action
Confirm with Ben that the Haiku 4.5 cost ceiling (~$0.01/interview) is acceptable, then build straight through. No proposal phase.

## Last action (mandatory)
Emit the **Session-done report** described in `AGENTS.md → Session-done reporting`. Then STOP.
