const fs = require('fs');
const path = require('path');

const SCENARIOS_ROOT = path.join(__dirname, 'scenarios');
const SCHEMA_VERSION = '1.0.0';

function getScenarioDirectory(scenarioId) {
  return path.join(SCENARIOS_ROOT, scenarioId);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function scenarioExists(scenarioId) {
  return fs.existsSync(getScenarioDirectory(scenarioId));
}

function loadScenarioFiles(scenarioId) {
  const dir = getScenarioDirectory(scenarioId);
  return {
    scenario: readJsonFile(path.join(dir, 'scenario.json')),
    hiddenRequirements: readJsonFile(path.join(dir, 'hidden-requirements.json')),
    clientPersona: readJsonFile(path.join(dir, 'client-persona.json')),
    evaluationRubric: readJsonFile(path.join(dir, 'evaluation-rubric.json')),
  };
}

function writeScenarioFiles(scenarioId, { scenario, hiddenRequirements, clientPersona, evaluationRubric }) {
  const dir = getScenarioDirectory(scenarioId);
  writeJsonFile(path.join(dir, 'scenario.json'), scenario);
  writeJsonFile(path.join(dir, 'hidden-requirements.json'), hiddenRequirements);
  writeJsonFile(path.join(dir, 'client-persona.json'), clientPersona);
  writeJsonFile(path.join(dir, 'evaluation-rubric.json'), evaluationRubric);
}

function listScenarioDirectories() {
  return fs.existsSync(SCENARIOS_ROOT)
    ? fs
        .readdirSync(SCENARIOS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
}

function deleteScenarioFolder(scenarioId) {
  const dir = getScenarioDirectory(scenarioId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function buildDefaultRubric(title) {
  return {
    rubricVersion: SCHEMA_VERSION,
    title: `${title} Discovery Rubric`,
    purpose: 'Measure whether a developer surfaces critical business constraints and operating realities before proposing a solution.',
    criteria: [
      {
        id: 'coverage',
        name: 'Requirement coverage',
        weight: 0.35,
        description: 'How many hidden requirements were surfaced through relevant questions or clarifications?',
      },
      {
        id: 'missed-requirements',
        name: 'Missed requirements',
        weight: 0.2,
        description: 'Whether the conversation failed to surface important risks, workflows, or operating realities.',
      },
      {
        id: 'unsupported-assumptions',
        name: 'Unsupported assumptions',
        weight: 0.15,
        description: 'Whether the developer made assumptions without validating them with the client.',
      },
      {
        id: 'question-quality',
        name: 'Question quality',
        weight: 0.2,
        description: 'Whether the questions were specific, prioritized, and focused on business-critical unknowns.',
      },
      {
        id: 'actionable-feedback',
        name: 'Actionable feedback',
        weight: 0.1,
        description: 'Whether the final recommendations help the developer move toward a workable solution.',
      },
    ],
    scoring: {
      minimumScore: 0,
      maximumScore: 100,
      passThreshold: 70,
    },
    guidance: {
      highQualityQuestions: ['Questions that clarify workflows, roles, and operational constraints before proposing a solution.'],
      lowQualityQuestions: ['Generic questions about design or UI.', 'Questions that skip operational and domain constraints.'],
    },
  };
}

module.exports = {
  SCENARIOS_ROOT,
  getScenarioDirectory,
  readJsonFile,
  writeJsonFile,
  scenarioExists,
  loadScenarioFiles,
  writeScenarioFiles,
  listScenarioDirectories,
  deleteScenarioFolder,
  buildDefaultRubric,
};
