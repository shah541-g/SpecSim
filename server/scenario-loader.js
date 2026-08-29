const fs = require('fs');
const path = require('path');
const { validateScenario } = require('./scenario-schema');

function getScenarioDirectory(scenarioId) {
  return path.join(__dirname, 'scenarios', scenarioId);
}

function loadJsonFile(filePath) {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContents);
}

function loadScenario(scenarioId = 'pharmacy-management-system') {
  const scenarioDirectory = getScenarioDirectory(scenarioId);

  const scenarioData = loadJsonFile(path.join(scenarioDirectory, 'scenario.json'));
  const hiddenRequirements = loadJsonFile(path.join(scenarioDirectory, 'hidden-requirements.json'));
  const clientPersona = loadJsonFile(path.join(scenarioDirectory, 'client-persona.json'));
  const evaluationRubric = loadJsonFile(path.join(scenarioDirectory, 'evaluation-rubric.json'));

  const combinedScenario = {
    ...scenarioData,
    clientPersona,
    hiddenRequirements,
    evaluationRubric,
  };

  const validationError = validateScenario(combinedScenario);
  if (validationError) {
    throw new Error(`Invalid scenario ${scenarioId}: ${validationError}`);
  }

  return combinedScenario;
}

function listScenarios() {
  const scenariosRoot = path.join(__dirname, 'scenarios');
  const directories = fs.existsSync(scenariosRoot)
    ? fs.readdirSync(scenariosRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  return directories;
}

module.exports = {
  loadScenario,
  listScenarios,
  getScenarioDirectory,
};
