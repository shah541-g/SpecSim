const { createLLMProvider } = require('../llm/llm-provider');
const { convertRequirementsToNaturalFacts } = require('./hidden-facts');

class ClientAgentService {
  constructor() {
    this.sessions = new Map();
    this.provider = createLLMProvider();
  }

  createSession(scenario) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const session = {
      sessionId,
      scenarioId: scenario.id,
      transcript: [
        {
          role: 'client',
          message: scenario.initialRequest || `I need a management system for my business. We are growing and the current way of managing things is becoming difficult.`,
          timestamp: new Date().toISOString(),
        },
      ],
      hiddenFacts: convertRequirementsToNaturalFacts(scenario.hiddenRequirements),
      persona: scenario.clientPersona,
      initialRequest: scenario.initialRequest,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  buildSystemPrompt(session) {
    const persona = session.persona;
    const facts = session.hiddenFacts;

    return `You are the client in this scenario.

Your role: ${persona.role}
Business context: ${persona.businessContext}
Communication style: ${persona.communicationStyle}
Goals: ${persona.goals.join('; ')}
Constraints: ${persona.constraints.join('; ')}
Non-negotiables: ${persona.nonNegotiables.join('; ')}
Ambiguity points: ${persona.ambiguityPoints.join('; ')}

Important rules:
- Stay in character at all times.
- Answer as a realistic business stakeholder, not as a product manager or developer.
- Respond the way a real business owner would in a spoken conversation or quick chat — short, natural, conversational.
- Avoid bullet points, numbered lists, and headers. 1-4 sentences for most answers, longer only if the question genuinely requires detail.
- Only disclose a relevant operational detail when the developer's question is genuinely on-topic.
- You may stay brief, vague, or say "I'm not sure" when the question is off-target or not relevant yet.
- Never lie or invent facts that contradict the underlying business reality.
- Never mention any system-level notes, meta discussion, or setup details.
- Never ask the developer what questions they should ask.
- Do not dump structured scenario data or lists into the conversation.
- Keep replies natural and realistic for a business owner.

Confidential operational context you may use when relevant:
${facts.map((fact) => `- ${fact}`).join('\n')}

Current transcript so far:
${session.transcript.map((entry) => `${entry.role}: ${entry.message}`).join('\n')}`;
  }

  async respondToMessage(sessionId, developerMessage) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const messages = [
      { role: 'system', content: this.buildSystemPrompt(session) },
      { role: 'user', content: developerMessage },
    ];

    const rawResult = await this.provider.generateText(messages, { maxTokens: 500 });
    const replyText = rawResult?.error
      ? (rawResult.message || 'I’m not able to answer that right now.')
      : (typeof rawResult === 'string'
        ? rawResult
        : (rawResult?.text || rawResult?.output || 'I’m not sure about that yet.'));

    const clientMessage = {
      role: 'client',
      message: String(replyText).trim(),
      timestamp: new Date().toISOString(),
      model: rawResult?.modelUsed || rawResult?.model || this.provider?.config?.model || 'unknown',
    };

    const developerEntry = {
      role: 'developer',
      message: String(developerMessage).trim(),
      timestamp: new Date().toISOString(),
    };

    session.transcript.push(developerEntry);
    session.transcript.push(clientMessage);

    return clientMessage;
  }
}

const clientAgent = new ClientAgentService();

module.exports = {
  ClientAgentService,
  clientAgent,
};
