const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScenario } = require('../server/scenario-loader');
const { ClientAgentService } = require('../server/services/client-agent');

const scenario = loadScenario('pharmacy-management-system');

function buildQuestions() {
  return [
    'Who is allowed to manage prescriptions and dispense medicines?',
    'Do you operate more than one pharmacy branch?',
    'How do you track stock levels and expiry dates?',
    'What happens when a prescription is refilled or needs review?',
    'How do customers pay and how do you reconcile sales at the end of the day?',
    'Do you need reporting for sales, inventory, or branch performance?',
    'What systems are you already using that we should integrate with?',
  ];
}

test('client agent creates a session with initial request and transcript', () => {
  const agent = new ClientAgentService();
  const session = agent.createSession(scenario);

  assert.equal(typeof session.sessionId, 'string');
  assert.equal(session.scenarioId, scenario.id);
  assert.equal(session.transcript.length, 1);
  assert.equal(session.initialRequest, scenario.initialRequest);
});

test('client agent system prompt includes scenario persona and hidden facts without exposing requirement IDs', () => {
  const agent = new ClientAgentService();
  const session = agent.createSession(scenario);
  const prompt = agent.buildSystemPrompt(session);

  assert.match(prompt, /Owner and operations lead/);
  assert.match(prompt, /The pharmacy has separate roles/);
  assert.doesNotMatch(prompt, /REQ-001|REQ-002|REQ-003|REQ-004|REQ-005|REQ-006|REQ-007|REQ-008|REQ-009/);
  assert.doesNotMatch(prompt, /hidden fact|hidden facts|evaluation rubric|evaluation|requirements/i);
});

test('client agent responds to varied questions without exposing hidden structure', async () => {
  const agent = new ClientAgentService();
  const session = agent.createSession(scenario);

  for (const question of buildQuestions()) {
    const response = await agent.respondToMessage(session.sessionId, question);
    assert.equal(typeof response.message, 'string');
    assert.ok(response.message.length > 0);
    assert.doesNotMatch(response.message, /REQ-00[1-9]/i);
    assert.doesNotMatch(response.message, /hidden facts|evaluation rubric|eval|requirements/i);
  }

  assert.equal(session.transcript.length, 15);
});

test('Groq provider falls back to mock when API key is missing', () => {
  const { createLLMProvider } = require('../server/llm/llm-provider');
  delete process.env.LLM_API_KEY;
  process.env.LLM_PROVIDER = 'groq';
  process.env.LLM_MODEL = 'llama-3.1-8b-instant';

  const provider = createLLMProvider();
  assert.equal(provider.constructor.name, 'MockLLMProvider');
});
