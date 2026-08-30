# Improvement Changelog

This is the iteration-by-iteration history of SpecSim. Every number cited below
was read from `experiments/baseline-vs-final/results.json` or the raw transcript
files, not reconstructed from memory.

## Baseline
**What we tried:** A single general-purpose LLM prompt evaluates a
requirement-discovery conversation, given the same hidden requirement
matrix as ground truth but no specialized rubric or taxonomy.
**Why:** Establish a reasonable, minimal-effort reference point
(`scripts/run-baseline.js`).
**Result:** Baseline scores ranged 45-85 across scenarios
(pharmacy 67, restaurant-pos 75, gym 85, hospital 85, freelance-marketplace 45,
multi-branch-retail 70).
**Evidence:** `experiments/baseline-vs-final/results.json`.
**Decision:** Used as the fixed comparison point for every scenario.

## Iteration 1 - Client Agent: rule-based to LLM-powered
**What we tried:** Initial plan called for a scripted, deterministic
client persona (no external LLM) for speed and reproducibility.
**Why we changed course:** The hackathon explicitly rewards purposeful
agent design; a scripted persona would not be genuinely agentic.
**Result:** Replaced with a real LLM-powered Client Agent
(`server/services/client-agent.js`) that maintains conversation memory
(the full transcript is prepended to every reply) and reveals hidden
facts only when a question is genuinely on-topic.
**Decision:** Kept. This is the foundation of the whole system.

## Iteration 2 - Client Agent: response length and realism
**What we tried:** Early Client Agent responses were 200-300+ words,
formatted like documentation with bullet lists - not how a real
business owner talks.
**Why:** Long, structured answers also consumed the token budget fast
and triggered rate limits (visible in the raw transcripts in
`experiments/baseline-vs-final/transcripts/`, where some early pharmacy
client replies run to several sentences with full justification blocks).
**Result:** Added explicit brevity instructions to the system prompt and
capped output tokens at `maxTokens: 500`; responses became short,
natural, and conversational (1-4 sentences typically).
**Decision:** Kept.

## Iteration 3 - Evaluator: per-requirement calls to single call
**What we tried:** Initial Evaluator Agent made one LLM call per hidden
requirement plus separate calls for assumptions, question quality, and
feedback - around 12 calls per evaluation.
**Why we changed:** This caused rate-limit failures and, more
importantly, produced unfair MISSED verdicts: each isolated call lost
the broader conversation context (e.g. "second location" was not
recognized as evidence for "multi-branch operations" when judged in
isolation).
**Result:** Consolidated to one comprehensive LLM call returning the
full structured JSON (`evaluateTranscript` in
`server/services/evaluator-agent.js`), with explicit instructions to
credit evidence based on conversational meaning, not literal keyword
matches.
**Evidence:** the final results credit cross-turn evidence (e.g.
restaurant-pos REQ-002 "We currently have two locations running, and
we're looking to open a third" is credited as DISCOVERED for
multi-location operations).
**Decision:** Kept. This fixed both the reliability and fairness
problems simultaneously.

## Iteration 4 - Evaluator: removing a hybrid rule-based override
**What we tried:** A keyword-based "evidence guardrail" was temporarily
added that could override the LLM's own DISCOVERED / MISSED verdicts on
every evaluation.
**Why we removed it:** This reintroduced the same false-negative
problem iteration 3 fixed (penalizing valid evidence that did not
contain exact keywords), and undermined the "genuinely agentic"
architecture - the evaluator should reason over the transcript, not
keyword-match it.
**Result:** Removed from the normal success path entirely. The only
remaining deterministic logic is a fallback used exclusively when the
real LLM call fails after retries - never as a second scoring system
for successful calls.
**Decision:** Removed (for normal-path scoring); kept as failure-only
safety net.
**What it taught us:** Evaluator LLM calls, silently failing, are the
most dangerous failure mode in this architecture, because a
valid-looking fallback result can be mistaken for genuine agentic
output. This motivated the `evaluationMode` field added next.

## Iteration 5 - Truncation bugs and the evaluationMode flag
**What we tried:** After removing the hybrid override, a "strong
transcript" evaluation silently returned a fallback result
(suspiciously round 100% coverage, generic keyword-style evidence) with
no visible error.
**Root cause found:** The full prompt (transcript + complete
requirement matrix + rubric) was large enough that the model's response
was truncated mid-JSON, which the parser rejected, triggering silent
fallback.
**Result:** Added truncation detection with automatic retry at a larger
token budget (both in `evaluator-agent.js` and in the Gemini provider's
`generateText`, which retries `finish_reason === "length"` with
`maxTokens` up to 4000), and added an explicit
`evaluationMode: "llm" | "fallback"` field to every evaluation result.
**Decision:** Kept. This became a load-bearing safeguard for the rest
of the project; the full batch in `results.json` was checked against
this flag before being trusted.

## Iteration 6 - Provider instability: Groq quota exhaustion
**What we tried:** Ran the full multi-scenario batch on Groq
(`openai/gpt-oss-20b`, later `qwen/qwen3.6-27b`; the pharmacy baseline
transcript in `experiments/baseline-vs-final/transcripts/pharmacy-management-system.json`
is tagged with those models).
**What happened:** The account-wide daily token quota (TPD) was
exhausted mid-batch, on the free tier - confirmed via real HTTP 429
responses. Batch and transcript-generation scripts initially skipped
this silently, producing `results.json` entries that looked complete but
actually held transcripts full of literal "All Groq models failed" text
instead of client responses (the exact string is the return value of
`GroqLLMProvider.generateText`).
**Result:** This is the single closest call in the whole project - a
report was nearly generated from fabricated-looking data. It was caught
by manually reading raw transcript files before trusting the aggregate
report, not by any automated check. The multi-branch-retail transcript
was regenerated and the contaminated one discarded.
**Decision:** Removed the free-tier Groq path for the full batch;
migrated to Google Gemini (`gemini-3.6-flash` and `gemini-3.5-flash-lite`
per the `modelUsed` fields in `results.json`) as the LLM provider, kept
the `LLMProvider` abstraction unchanged so no other code needed to
change. Fixed the batch/resume logic to only skip a scenario if both
baseline and final have `evaluationMode: "llm"` - not merely "exists".
**What it taught us:** Automated "resume/skip if exists" logic is
dangerous in an agentic pipeline unless it explicitly checks for
success, not just presence.

## Iteration 7 - Gemini token budget (hidden reasoning tokens)
**What we tried:** After switching to Gemini, calls returned HTTP 200
but with empty `message.content` - the visible token budget was entirely
consumed by hidden internal reasoning tokens before any answer was
generated.
**Result:** Increased max token budgets for Gemini calls (Client Agent,
Evaluator, and baseline) to accommodate the reasoning overhead, and
added detection for truncated/empty Gemini responses as a retryable
condition.
**Decision:** Kept.

## Iteration 8 - Scenario Management (CRUD + spreadsheet import)
**What we tried:** The 6 experiment scenarios plus the standalone
scenarios were originally produced by `scripts/generate-scenarios.js`
(a bulk generator writing files directly). The hackathon asks for
reproducibility and demonstration value, so we added a real management
layer on top: `server/routes/scenarios.js` exposing
GET list / GET detail / POST create / PUT update / DELETE, with
filesystem storage via `server/scenario-store.js` and schema validation
via `server/scenario-schema.js` (8-10 hidden requirements required).
**Design decisions:** DELETE returns 400 when a scenario id appears in
`experiments/baseline-vs-final/results.json` or `.batch-checkpoint.json`
so experiment data cannot be silently invalidated. The frontend gets an
Angular management screen (`frontend/src/app/scenario-manager.*`) and,
later, a spreadsheet import path (`POST /api/scenarios/import`) using a
generated .xlsx template (one row per hidden requirement, grouped by
`scenario_id`) with the SheetJS library loaded as a lazy chunk to keep
the main bundle under the 500 KB budget.
**Evidence:** CRUD was tested in-session against the live API: a
`pet-clinic` test scenario was created and deleted, and a two-item import
was verified (one created, one skipped for "already exists").
**Decision:** Kept, with an honest caveat: the `hidden-facts.js` natural
fact mapping is pharmacy-specific (see README Limitations), so CRUD
scenarios outside the original batch inherit facts that may not match
their domain unless that map is made scenario-aware.

## Final
The final pipeline combines: a deterministic hidden requirement matrix
as ground truth, an LLM-powered Client Agent with a need-to-know view of
that ground truth, an independent single-call LLM Evaluator Agent scored
against the full ground truth and an explicit rubric, a fallback path
used only on genuine model failure, and an `evaluationMode` flag on
every result so degraded output can never be silently mistaken for
genuine agentic evaluation.

**Main contribution:** the evaluator's structured, ground-truth-aware
scoring outperformed a generic single-prompt baseline in 5 of 6
scenarios, with the largest gains on operationally dense domains
(gym-management +15, restaurant-pos +14, multi-branch-retail +10).

**Biggest removed/failed experiment:** the per-requirement multi-call
evaluator design (iteration 3) and the hybrid keyword-override guardrail
(iteration 4) - both looked reasonable in isolation but actively hurt
fairness and reproducibility once tested against real data. The
freelance-marketplace -12 regression (final 33 vs baseline 45) is the
lasting audit trail of what a scripted, domain-agnostic question set
does to a trust/reputation-driven domain.