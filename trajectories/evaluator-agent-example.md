# Evaluator Agent - Example Trajectory

Scenario: `pharmacy-management-system`
Transcript source: `experiments/baseline-vs-final/transcripts/pharmacy-6-question.json`
Evaluation source: `experiments/baseline-vs-final/results.json`, key
`pharmacy-management-system.final.rawResult`.
This is a **real run**. The evaluation JSON below is copied verbatim from that file.

## Agent instructions (summarized from the real system prompt)

`server/services/evaluator-agent.js` builds the prompt in
`buildEvaluationPrompt()`:

> You are an independent evaluator for the SpecSim scenario. Your job is to
> judge how well the developer clarified the hidden business requirements from
> the conversation transcript.
>
> Critical evaluation instructions:
> - Use the full hidden requirement matrix as the deterministic ground truth.
> - Use the full conversation transcript as your evidence source. Look across
>   the whole exchange, not isolated keyword matches.
> - Credit a requirement as DISCOVERED if the conversation reveals clear
>   evidence anywhere in the transcript, even if the developer's question did
>   not use the exact requirement wording.
> - Use PARTIALLY_DISCOVERED when the general topic was touched but a key
>   evidence detail from the requirement's evidence criteria is still missing.
> - Use MISSED only when the transcript truly contains no relevant evidence.
> - Do not reward vague or generic questions. Do not assume facts the client
>   never said.
>
> Hidden requirement matrix: <all requirements with id, name, description,
> category, priority, evidence criteria>
> Evaluation rubric: <full JSON rubric>
> Transcript: <full transcript>
>
> Return ONLY valid JSON that matches this schema exactly. rules: one entry per
> hidden requirement; status must be DISCOVERED, PARTIALLY_DISCOVERED, or
> MISSED; coverageScore; unsupportedAssumptions; questionQuality; feedback. No
> markdown fences, no commentary.

Settings: single call, `temperature: 0.1`, schema-validated, up to 2 attempts,
then deterministic fallback. The LLM call received the schema + prompt; the
output was validated by `validateStructuredResult()` and enriched by
`attachRequirementMeta()` with `requirementName`/`requirementDescription`.

## Input context for this run

- **Hidden requirement matrix** (9 requirements, from
  `server/scenarios/pharmacy-management-system/hidden-requirements.json`):
  role-based access (REQ-001), multi-branch operations (REQ-002), inventory /
  expiry / batch (REQ-003), prescription intake / repeat fills / restricted
  meds (REQ-004), payments + reimbursement + reconciliation (REQ-005),
  reporting / dashboards (REQ-006), supplier / purchase orders (REQ-007),
  patient / customer records (REQ-008), integrations + operational constraints
  (REQ-009).
- **Rubric** (`evaluation-rubric.json`): weighted criteria - coverage 0.35,
  missed requirements 0.2, unsupported assumptions 0.15, question quality 0.2,
  actionable feedback 0.1. Pass threshold 70.
- **Transcript**: the 6-question pharmacy conversation (the same one used for
  the Client Agent trajectory).
- **Ground truth NOT shared with the Client Agent**: the evaluator sees ids,
  categories, priorities, evidence criteria, and the rubric; the client never
  does.

## Step-by-step trajectory (how this evaluation actually ran)

1. **Assemble**: `evaluateTranscript` receives the 9-requirement matrix, the
   full 13-entry transcript (1 opening + 6 developer/client pairs), and the
   rubric as a single prompt.
2. **First (and only needed) LLM call** to the Gemini provider at
   `temperature: 0.1` with the schema hint appended. No truncation occurred
   this run, so no retry was needed.
3. **Parse + validate**: the raw model output was normalized (no markdown
   fences present) and parsed as JSON; `validateStructuredResult()` passed.
4. **Enrich**: `attachRequirementMeta()` merged `requirementName` /
   `requirementDescription` into each requirement entry.
5. **Tag + return**: `evaluationMode: "llm"`.

## Real evaluation output (verbatim from results.json)

```json
{
  "evaluationMode": "llm",
  "coverageScore": 72,
  "requirements": [
    { "id": "REQ-001", "status": "DISCOVERED",
      "evidence": "DEVELOPER: Who is allowed to manage prescriptions and dispense medicines?" },
    { "id": "REQ-002", "status": "DISCOVERED",
      "evidence": "DEVELOPER: Do you operate more than one pharmacy branch?" },
    { "id": "REQ-003", "status": "DISCOVERED",
      "evidence": "DEVELOPER: How do you track stock levels and expiry dates?" },
    { "id": "REQ-004", "status": "DISCOVERED",
      "evidence": "DEVELOPER: What happens when a prescription is refilled or needs review?" },
    { "id": "REQ-005", "status": "DISCOVERED",
      "evidence": "DEVELOPER: How do customers pay and how do you reconcile sales at the end of the day?" },
    { "id": "REQ-006", "status": "DISCOVERED",
      "evidence": "DEVELOPER: Do you need reporting for sales, inventory, or branch performance?" },
    { "id": "REQ-007", "status": "MISSED", "evidence": null },
    { "id": "REQ-008", "status": "PARTIALLY_DISCOVERED",
      "evidence": "CLIENT: ...checks the refill eligibility-expiry, remaining refills, any alerts for drug interactions or patient history." },
    { "id": "REQ-009", "status": "MISSED", "evidence": null }
  ],
  "unsupportedAssumptions": [],
  "questionQuality": {
    "score": 85,
    "notes": "The developer asked clear, highly targeted, domain-specific open questions that successfully uncovered role permissions, branch scaling, expiry tracking, prescription workflows, payments/reconciliation, and reporting needs."
  },
  "feedback": "Great job asking specific, high-value questions around core pharmacy workflows and role permissions. To achieve complete discovery, make sure to also ask about supplier procurement workflows, dedicated patient record/reminder management, and operational/technical constraints like legacy software integrations and hardware environment."
}
```

(For comparison: the same scenario's baseline scoring - a generic single-prompt
evaluator - returned a 67 with a separate `foundRequirements`/`missedRequirements`
shape and this feedback: "The developer did a solid job uncovering most of the
core needs... they didn't probe the prescription-specific details (refill rules,
controlled-substance handling), the supplier/purchasing workflow, or the
patient/customer record requirements.")

## Observed behavior notes

- **Independent judgment, not keyword matching.** The evaluator credited
  REQ-004 as DISCOVERED even though the developer's question
  ("What happens when a prescription is refilled or needs review?") mentions
  neither "prescription intake" nor "restricted meds" verbatim - it read the
  client's answer as evidence. REQ-008 (patient/customer records) got
  PARTIALLY_DISCOVERED because the client volunteered patient-history/refill
  data, but the "dedicated patient record management" criteria stayed untested.
- **Fair scoring.** MISSED was used exactly where the transcript had no relevant
  evidence (REQ-007 supplier workflows, REQ-009 integrations), which matches the
  transcript content - in 6 questions the developer never asked about suppliers
  or legacy tools.
- **No unsupported assumptions flagged** - the developer never asserted
  unconfirmed facts.

## Retries / failures

None in this run. For a real failure example of the evaluator path: during
Iteration 5 (CHANGELOG), a longer transcript produced a truncated model response
that failed JSON parsing and silently triggered the deterministic fallback -
this is what motivated the truncation-retry and the `evaluationMode` field. All
6 final evaluations in `results.json` report `evaluationMode: "llm"`.