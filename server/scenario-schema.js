const SCENARIO_SCHEMA_VERSION = '1.0.0';

function validateRequirement(requirement) {
  if (!requirement || typeof requirement !== 'object') {
    return 'Requirement must be an object.';
  }

  const requiredFields = ['id', 'name', 'description', 'category', 'priority', 'evidenceCriteria'];
  for (const field of requiredFields) {
    if (!(field in requirement)) {
      return `Requirement is missing required field: ${field}`;
    }
  }

  if (typeof requirement.id !== 'string' || requirement.id.trim() === '') {
    return 'Requirement id must be a non-empty string.';
  }

  if (typeof requirement.name !== 'string' || requirement.name.trim() === '') {
    return 'Requirement name must be a non-empty string.';
  }

  if (Array.isArray(requirement.evidenceCriteria) === false || requirement.evidenceCriteria.length === 0) {
    return 'Requirement evidenceCriteria must be a non-empty array.';
  }

  if (!['low', 'medium', 'high', 'critical'].includes(requirement.priority)) {
    return 'Requirement priority must be one of: low, medium, high, critical.';
  }

  return null;
}

function validateScenario(scenario) {
  if (!scenario || typeof scenario !== 'object') {
    return 'Scenario must be an object.';
  }

  const requiredFields = ['id', 'title', 'initialRequest', 'description', 'clientPersona', 'hiddenRequirements', 'evaluationRubric'];
  for (const field of requiredFields) {
    if (!(field in scenario)) {
      return `Scenario is missing required field: ${field}`;
    }
  }

  if (typeof scenario.id !== 'string' || scenario.id.trim() === '') {
    return 'Scenario id must be a non-empty string.';
  }

  if (typeof scenario.title !== 'string' || scenario.title.trim() === '') {
    return 'Scenario title must be a non-empty string.';
  }

  if (typeof scenario.initialRequest !== 'string' || scenario.initialRequest.trim() === '') {
    return 'Scenario initialRequest must be a non-empty string.';
  }

  if (!Array.isArray(scenario.hiddenRequirements) || scenario.hiddenRequirements.length < 8 || scenario.hiddenRequirements.length > 10) {
    return 'Scenario hiddenRequirements must be an array with 8 to 10 entries.';
  }

  for (const requirement of scenario.hiddenRequirements) {
    const validationError = validateRequirement(requirement);
    if (validationError) {
      return validationError;
    }
  }

  if (!scenario.clientPersona || typeof scenario.clientPersona !== 'object') {
    return 'Scenario clientPersona must be an object.';
  }

  if (!scenario.evaluationRubric || typeof scenario.evaluationRubric !== 'object') {
    return 'Scenario evaluationRubric must be an object.';
  }

  return null;
}

module.exports = {
  SCENARIO_SCHEMA_VERSION,
  validateScenario,
  validateRequirement,
};
