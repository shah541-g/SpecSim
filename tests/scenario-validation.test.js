const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadScenario, listScenarios } = require('../server/scenario-loader');
const { createLLMProvider, getLLMConfig } = require('../server/llm/llm-provider');

const scenarioId = 'pharmacy-management-system';
const scenarioDir = path.join(__dirname, '..', 'server', 'scenarios', scenarioId);

test('scenario directory exists', () => {
  assert.equal(fs.existsSync(scenarioDir), true);
  assert.ok(listScenarios().includes(scenarioId));
});

test('scenario loads and validates successfully', () => {
  const scenario = loadScenario(scenarioId);

  assert.equal(scenario.id, scenarioId);
  assert.equal(typeof scenario.initialRequest, 'string');
  assert.equal(Array.isArray(scenario.hiddenRequirements), true);
  assert.ok(scenario.hiddenRequirements.length >= 8 && scenario.hiddenRequirements.length <= 10);
  assert.equal(typeof scenario.clientPersona.role, 'string');
  assert.equal(Array.isArray(scenario.evaluationRubric.criteria), true);
});

test('all hidden requirements contain required fields', () => {
  const scenario = loadScenario(scenarioId);

  for (const requirement of scenario.hiddenRequirements) {
    assert.ok(requirement.id);
    assert.ok(requirement.name);
    assert.ok(requirement.description);
    assert.ok(requirement.category);
    assert.ok(['low', 'medium', 'high', 'critical'].includes(requirement.priority));
    assert.ok(Array.isArray(requirement.evidenceCriteria));
    assert.ok(requirement.evidenceCriteria.length > 0);
  }
});

test('LLM config is environment-driven and configurable', () => {
  process.env.LLM_PROVIDER = 'mock';
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'test-model';
  process.env.LLM_BASE_URL = 'https://example.test';

  const config = getLLMConfig();
  assert.equal(config.provider, 'mock');
  assert.equal(config.apiKey, 'test-key');
  assert.equal(config.model, 'test-model');
  assert.equal(config.baseUrl, 'https://example.test');

  const provider = createLLMProvider();
  assert.ok(provider);
  assert.equal(typeof provider.generateText, 'function');
  assert.equal(typeof provider.generateStructuredOutput, 'function');
});
