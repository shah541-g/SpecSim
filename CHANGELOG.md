# Improvement Changelog

## Baseline
**What we tried:** A single general-purpose LLM prompt evaluates a
requirement-discovery conversation, given the same hidden requirement
matrix as ground truth but no specialized rubric or taxonomy.
**Why:** Establish a reasonable, minimal-effort reference point.
**Result:** Baseline scores ranged 45–85 across scenarios (see
Results table in README).
**Decision:** Used as the fixed comparison point for every scenario.

## Iteration 1 — Client Agent: rule-based to LLM-powered
**What we tried:** Initial plan called for a scripted, deterministic
client persona (no external LLM) for speed and reproducibility.
**Why we changed course:** The hackathon explicitly rewards purposeful
agent design; a scripted persona would not be genuinely agentic.
**Result:** Replaced with a real LLM-powered Client Agent that
maintains conversation memory and reveals hidden facts only when
relevant.
**Decision:** Kept. This is the foundation of the whole system.

## Iteration 2 — Client Agent: response length and realism
**What we tried:** Early Client Agent responses were 200–300+ words,
formatted like documentation with bullet lists — not how a real
business owner talks.
**Why:** Long, structured answers also consumed the token budget fast
and triggered rate limits.
**Result:** Added explicit brevity instructions to the system prompt
and capped output tokens; responses became short, natural, and
conversational (1–4 sentences typically).
**Decision:** Kept.

## Iteration 3 — Evaluator: per-requirement calls to single call
**What we tried:** Initial Evaluator Agent made ~12 separate LLM calls
per evaluation (one per requirement, plus separate calls for
assumptions, question quality, and feedback).
**Why we changed:** This caused rate-limit failures and, more
importantly, produced unfair MISSED verdicts — each isolated call lost
the broader conversation context (e.g. "second location" wasn't
recognized as evidence for "multi-branch operations" when judged in
isolation).
**Result:** Consolidated to one comprehensive LLM call returning the
full structured JSON, with explicit instructions to credit evidence
based on conversational meaning, not literal keyword matches.
**Decision:** Kept. This fixed both the reliability and fairness
problems simultaneously.

## Iteration 4 — Evaluator: removing a hybrid rule-based override
**What we tried:** A keyword-based "evidence guardrail" was
temporarily added that could override the LLM's own DISCOVERED/MISSED
verdicts on every evaluation.
**Why we removed it:** This reintroduced the same false-negative
problem iteration 3 fixed (e.g. penalizing valid evidence that didn't
contain exact keywords), and undermined the "genuinely agentic"
architecture — the evaluator should reason over the transcript, not
keyword-match it.
**Result:** Removed from the normal success path entirely. The only
remaining deterministic logic is a fallback used exclusively when the
real LLM call fails after retries — never as a second scoring system
for successful calls.
**Decision:** Removed (for normal-path scoring); kept as failure-only
safety net.
**What it taught us:** Evaluator LLM calls, silently failing, are the
most dangerous failure mode in this architecture, because a valid-
looking fallback result can be mistaken for genuine agentic output.
This motivated the `evaluationMode` field added in the next iteration.

## Iteration 5 — Truncation bugs and the evaluationMode flag
**What we tried:** After removing the hybrid override, a "strong
transcript" evaluation silently returned a fallback result (suspiciously
round 100% coverage, generic keyword-style evidence text) without any
visible error.
**Root cause found:** The full prompt (transcript + complete
requirement matrix + rubric) was large enough that the model's
response was truncated mid-JSON, which the parser then rejected,
triggering silent fallback.
**Result:** Added truncation detection with automatic retry at a
larger token budget, and added an explicit `evaluationMode: "llm" |
"fallback"` field to every evaluation result so a degraded result can
never be mistaken for genuine agentic output again.
**Decision:** Kept. This became a load-bearing safeguard for the rest
of the project — every subsequent batch run was checked against this
flag before any result was trusted.

## Iteration 6 — Provider instability: Groq quota exhaustion
**What we tried:** Ran the full 10-scenario batch on Groq
(`openai/gpt-oss-20b`, later `qwen/qwen3.6-27b`).
**What happened:** The account-wide daily token quota (TPD) was
exhausted mid-batch, on the free tier — confirmed via real HTTP 429
responses. Batch and conversation-generation scripts initially
skipped this silently, producing results.json entries that
looked complete but actually contained transcripts full of
literal "All Groq models failed" text instead of client responses.
**Result:** This is the single closest call in the whole project — a
report was nearly generated from fully fabricated-looking data. We
caught it by manually reading raw transcript files before trusting
the aggregate report, not by any automated check.
**Decision:** Removed the free-tier Groq path for the full batch;
migrated to Google Gemini (`gemini-3.6-flash`) as the LLM provider,
kept the abstraction (`LLMProvider`) unchanged so no other code needed
to change. Also fixed the batch/resume logic to only skip a scenario
if both baseline and final have `evaluationMode: "llm"` — not merely
"exists" — and deleted and regenerated every transcript that was
contaminated by the Groq outage.
**What it taught us:** Automated "resume/skip if exists" logic is
dangerous in an agentic pipeline unless it explicitly checks for
success, not just presence. This is now the single most important
lesson in the project's Hot Take.

## Iteration 7 — Gemini token budget (hidden reasoning tokens)
**What we tried:** After switching to Gemini, calls returned HTTP 200
but with empty `message.content` — the visible token budget was
entirely consumed by hidden internal reasoning tokens before any
answer was generated.
**Result:** Increased max token budgets for Gemini calls (Client
Agent, Evaluator, and baseline) to accommodate the reasoning overhead,
and added detection for truncated/empty Gemini responses as a
retryable condition.
**Decision:** Kept.

## Final
The final pipeline combines: a deterministic hidden requirement
matrix as ground truth, an LLM-powered Client Agent with a
need-to-know view of that ground truth, an independent single-call
LLM Evaluator Agent scored against the full ground truth and an
explicit rubric, a fallback path used only on genuine model failure,
and an `evaluationMode` flag on every result so degraded output can
never be silently mistaken for genuine agentic evaluation.

**Main contribution:** the evaluator's structured, ground-truth-aware
scoring outperformed a generic single-prompt baseline in 5 of 6
scenarios, with the largest gains on operationally dense domains.

**Biggest removed experiment:** the per-requirement multi-call
evaluator design (iteration 3) and the hybrid keyword-override
guardrail (iteration 4) — both looked reasonable in isolation but
actively hurt fairness and reproducibility once tested against real
data.