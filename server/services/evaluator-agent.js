const { createLLMProvider } = require('../llm/llm-provider');
const { clientAgent } = require('./client-agent');

const VALID_STATUSES = new Set(['DISCOVERED', 'PARTIALLY_DISCOVERED', 'MISSED']);

function normalizeJsonText(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function parseJsonCandidate(value) {
  if (!value) {
    return null;
  }

  const rawText = typeof value === 'string' ? value : JSON.stringify(value);
  const cleaned = normalizeJsonText(rawText);
  const start = cleaned.indexOf('{');
  if (start === -1) {
    return null;
  }

  const end = cleaned.lastIndexOf('}');
  if (end <= start) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (error) {
    return null;
  }
}

class EvaluatorAgentService {
  constructor() {
    this.provider = createLLMProvider();
  }

  buildSchema() {
    return {
      type: 'object',
      properties: {
        evaluationMode: { type: 'string', enum: ['llm', 'fallback'] },
        coverageScore: { type: 'number' },
        requirements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              requirementName: { type: 'string' },
              status: { type: 'string', enum: ['DISCOVERED', 'PARTIALLY_DISCOVERED', 'MISSED'] },
              evidence: { type: ['string', 'null'] },
            },
            required: ['id', 'status', 'evidence'],
            additionalProperties: false,
          },
        },
        unsupportedAssumptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assumption: { type: 'string' },
              explanation: { type: 'string' },
            },
            required: ['assumption', 'explanation'],
            additionalProperties: false,
          },
        },
        questionQuality: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['score', 'notes'],
          additionalProperties: false,
        },
        feedback: { type: 'string' },
      },
      required: ['evaluationMode', 'coverageScore', 'requirements', 'unsupportedAssumptions', 'questionQuality', 'feedback'],
      additionalProperties: false,
    };
  }

  validateStructuredResult(result) {
    if (!result || typeof result !== 'object') {
      throw new Error('Evaluator output is not an object.');
    }

    if (!['llm', 'fallback'].includes(result.evaluationMode)) {
      throw new Error('evaluationMode must be either "llm" or "fallback".');
    }

    if (typeof result.coverageScore !== 'number' || Number.isNaN(result.coverageScore)) {
      throw new Error('coverageScore must be a number.');
    }

    if (!Array.isArray(result.requirements)) {
      throw new Error('requirements must be an array.');
    }

    if (result.requirements.length === 0) {
      throw new Error('requirements must not be empty.');
    }

    for (const requirement of result.requirements) {
      if (!requirement || typeof requirement !== 'object') {
        throw new Error('Each requirement must be an object.');
      }
      if (typeof requirement.id !== 'string' || requirement.id.trim() === '') {
        throw new Error('Each requirement id must be a non-empty string.');
      }
      if (!VALID_STATUSES.has(requirement.status)) {
        throw new Error(`Invalid status for ${requirement.id}: ${requirement.status}`);
      }
      if (requirement.evidence !== null && typeof requirement.evidence !== 'string') {
        throw new Error(`Evidence for ${requirement.id} must be a string or null.`);
      }
    }

    if (!Array.isArray(result.unsupportedAssumptions)) {
      throw new Error('unsupportedAssumptions must be an array.');
    }

    if (!result.questionQuality || typeof result.questionQuality !== 'object') {
      throw new Error('questionQuality must be an object.');
    }

    if (typeof result.questionQuality.score !== 'number' || Number.isNaN(result.questionQuality.score)) {
      throw new Error('questionQuality.score must be a number.');
    }

    if (typeof result.questionQuality.notes !== 'string') {
      throw new Error('questionQuality.notes must be a string.');
    }

    if (typeof result.feedback !== 'string') {
      throw new Error('feedback must be a string.');
    }

    return true;
  }

  buildEvaluationPrompt({ requirements, transcript, rubric }) {
    const requirementSummary = requirements.map((requirement) => `- ${requirement.id}: ${requirement.name}
  Description: ${requirement.description}
  Category: ${requirement.category}
  Priority: ${requirement.priority}
  Evidence criteria: ${requirement.evidenceCriteria.join('; ')}`).join('\n');

    const transcriptText = transcript
      .map((entry) => `${entry.role.toUpperCase()}: ${entry.message}`)
      .join('\n');

    return `You are an independent evaluator for the SpecSim scenario.

Your job is to judge how well the developer clarified the hidden business requirements from the conversation transcript.

Critical evaluation instructions:
- Use the full hidden requirement matrix as the deterministic ground truth.
- Use the full conversation transcript as your evidence source. Look across the whole exchange, not isolated keyword matches.
- Credit a requirement as DISCOVERED if the conversation reveals clear evidence anywhere in the transcript, even if the developer's question did not use the exact requirement wording.
- Example: if the client mentions opening a second location, same controls for multiple branches, or branch-level inventory, that counts as evidence for multi-branch operations even if the developer did not literally ask "How many branches?"
- Use PARTIALLY_DISCOVERED when the general topic was touched but a key evidence detail from the requirement's evidence criteria is still missing.
- Use MISSED only when the transcript truly contains no relevant evidence.
- Do not reward vague or generic questions.
- Do not assume facts the client never said.
- Unsupported assumptions must be based on what the developer appears to have assumed without client confirmation, not on what the product would logically need.

Hidden requirement matrix:
${requirementSummary}

Evaluation rubric:
${JSON.stringify(rubric, null, 2)}

Transcript:
${transcriptText}

Return ONLY valid JSON that matches this schema exactly:
{
  "coverageScore": 0,
  "requirements": [
    { "id": "REQ-001", "status": "DISCOVERED", "evidence": "short quote or paraphrase from transcript, or null" }
  ],
  "unsupportedAssumptions": [
    { "assumption": "string", "explanation": "string" }
  ],
  "questionQuality": { "score": 0, "notes": "string" },
  "feedback": "string"
}

Rules:
- requirements must include one entry for every hidden requirement in the matrix.
- status must be exactly DISCOVERED, PARTIALLY_DISCOVERED, or MISSED.
- coverageScore must be an integer from 0 to 100.
- unsupportedAssumptions should be a list of assumptions the developer seems to have made that were not validated by the client.
- questionQuality.score should be a 0-100 score for the quality of the developer's questions.
- feedback should be actionable and brief.
- Return valid JSON only. No markdown fences, no commentary, no prefixes, no extra text.`;
  }

  buildFallbackEvaluationResult({ transcript, requirements }) {
    const transcriptText = (transcript || [])
      .map((entry) => `${entry.role || 'unknown'} ${entry.message || ''}`)
      .join(' ')
      .toLowerCase();

    const genericWords = new Set([
      'system', 'business', 'need', 'needs', 'want', 'wants', 'look', 'like', 'simple', 'clean', 'dashboard',
      'management', 'pharmacy', 'current', 'growing', 'difficult', 'things', 'process', 'work', 'people',
      'users', 'roles', 'role', 'customer', 'customers', 'records', 'record', 'report', 'reports', 'reporting',
      'inventory', 'sales', 'stock', 'payment', 'payments', 'branch', 'branches', 'staff', 'operation', 'operations',
      'developer', 'client', 'with', 'without', 'about', 'asks', 'ask', 'asked', 'using', 'used', 'support', 'supports',
      'describe', 'describes', 'discussion', 'discusses', 'mentions', 'mention', 'inquires', 'inquire', 'details',
      'finding', 'findings', 'evidence', 'criteria', 'make', 'makes', 'needed', 'could', 'would', 'maybe', 'having',
      'there', 'their', 'them', 'these', 'those', 'good', 'nice', 'modern', 'design', 'workflow', 'workflows'
    ]);

    const requirementsResult = requirements.map((requirement) => {
      const extracted = (requirement.name + ' ' + requirement.description + ' ' + (requirement.evidenceCriteria || []).join(' '))
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => token.length > 3)
        .filter((token) => !genericWords.has(token));

      const matchedKeywords = [...new Set(extracted)].filter((token) => transcriptText.includes(token));
      const status = matchedKeywords.length >= 2 ? 'DISCOVERED' : (matchedKeywords.length === 1 ? 'PARTIALLY_DISCOVERED' : 'MISSED');
      const evidence = matchedKeywords.length > 0 ? `Relevant evidence found for ${matchedKeywords.slice(0, 3).join(', ')}.` : null;

      return { id: requirement.id, status, evidence };
    });

    const discoveredCount = requirementsResult.filter((entry) => entry.status === 'DISCOVERED').length;
    const partialCount = requirementsResult.filter((entry) => entry.status === 'PARTIALLY_DISCOVERED').length;
    const coverageScore = Math.round(((discoveredCount + partialCount) / Math.max(requirements.length, 1)) * 100);
    const developerQuestions = (transcript || []).filter((entry) => entry.role === 'developer').length;

    return {
      evaluationMode: 'fallback',
      coverageScore,
      requirements: requirementsResult,
      unsupportedAssumptions: [],
      questionQuality: {
        score: Math.min(100, Math.max(0, Math.round((developerQuestions / Math.max((transcript || []).length / 2, 1)) * 100))),
        notes: 'Fallback evaluation used due to model availability failure; transcript was assessed using deterministic transcript heuristics.',
      },
      feedback: 'The LLM evaluator was unavailable, so a deterministic fallback evaluation was used. Re-run the evaluation when the model service is available for a full assessment.',
    };
  }

  attachRequirementMeta(result, requirements) {
    const lookup = new Map((requirements || []).map((requirement) => [requirement.id, requirement]));
    const requirementsResult = (result.requirements || []).map((entry) => {
      const matched = lookup.get(entry.id);
      const requirementName = typeof entry.requirementName === 'string' && entry.requirementName.trim() !== ''
        ? entry.requirementName
        : (matched && matched.name) || entry.id;
      return {
        ...entry,
        requirementName,
        requirementDescription: (matched && matched.description) || entry.requirementDescription || '',
      };
    });
    return { ...result, requirements: requirementsResult };
  }

  async evaluateTranscript({ transcript, requirements, rubric }) {
    const prompt = this.buildEvaluationPrompt({ transcript, requirements, rubric });
    const schemaHint = `Return valid JSON only and match this schema exactly: ${JSON.stringify(this.buildSchema(), null, 2)}`;

    let lastError = 'Could not parse evaluator response.';
    let lastRawResponse = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentPrompt = attempt === 0
        ? `${prompt}\n\n${schemaHint}`
        : `${prompt}\n\nReturn valid JSON only. Do not include markdown or explanation.\n${schemaHint}`;

      try {
        const isGemini = this.provider.config?.provider === 'gemini';
        const maxTokens = isGemini ? 4000 : 3000;
        const generated = await this.provider.generateText(
          [{ role: 'user', content: currentPrompt }],
          { temperature: 0.1, maxTokens }
        );

        lastRawResponse = generated;
        const candidate = generated?.text || generated?.output || generated?.message || generated;
        const parsed = parseJsonCandidate(candidate);

        if (parsed) {
          try {
            this.validateStructuredResult(parsed);
            return this.attachRequirementMeta({ ...parsed, evaluationMode: 'llm' }, requirements);
          } catch (error) {
            lastError = error.message;
          }
        } else {
          lastError = generated?.message || 'Malformed JSON returned from model.';
        }
      } catch (error) {
        lastError = error?.message || 'Evaluator call failed.';
      }

      console.log(`[Evaluator] attempt ${attempt + 1} failed: ${lastError}`);
      if (lastRawResponse) {
        console.log('[Evaluator] raw failed response:', JSON.stringify(lastRawResponse, null, 2));
      }
    }

    const fallback = this.buildFallbackEvaluationResult({ transcript, requirements });
    return this.attachRequirementMeta({ ...fallback, evaluationMode: 'fallback' }, requirements);
  }

  async evaluateSession(sessionId, scenario = null) {
    const session = clientAgent.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const transcript = Array.isArray(session.transcript) ? session.transcript : [];
    const hiddenRequirements = Array.isArray((scenario || {}).hiddenRequirements)
      ? (scenario || {}).hiddenRequirements
      : (session.hiddenRequirements || []);
    const rubric = (scenario || {}).evaluationRubric || session.evaluationRubric || { criteria: [] };

    return this.evaluateTranscript({ transcript, requirements: hiddenRequirements, rubric });
  }
}

const evaluatorAgent = new EvaluatorAgentService();

module.exports = {
  EvaluatorAgentService,
  evaluatorAgent,
};
