const express = require('express');
const fs = require('fs');
const path = require('path');
const { validateScenario } = require('../scenario-schema');
const {
  getScenarioDirectory,
  loadScenarioFiles,
  writeScenarioFiles,
  scenarioExists,
  listScenarioDirectories,
  deleteScenarioFolder,
  buildDefaultRubric,
} = require('../scenario-store');

const router = express.Router();

const EXPERIMENTS_DIR = path.resolve(__dirname, '..', '..', 'experiments');

const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function sanitizeScenarioId(scenarioId) {
  return typeof scenarioId === 'string' ? scenarioId.trim() : '';
}

function readExperimentsReferenceFiles() {
  const files = [
    path.join(EXPERIMENTS_DIR, 'baseline-vs-final', 'results.json'),
    path.join(EXPERIMENTS_DIR, 'baseline-vs-final', '.batch-checkpoint.json'),
  ];

  return files.filter((file) => fs.existsSync(file));
}

function mergeCombinedScenario(files) {
  return {
    ...files.scenario,
    hiddenRequirements: files.hiddenRequirements,
    clientPersona: files.clientPersona,
    evaluationRubric: files.evaluationRubric,
  };
}

function isReferencedInExperiments(scenarioId) {
  const files = readExperimentsReferenceFiles();
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(scenarioId)) {
      return true;
    }
  }
  return false;
}

async function requireScenario(req, res) {
  const scenarioId = sanitizeScenarioId(req.params.id);
  if (!scenarioId) {
    res.status(400).json({ error: 'Scenario id is required.' });
    return null;
  }
  if (!SAFE_ID_PATTERN.test(scenarioId) || scenarioId.includes('..')) {
    res.status(400).json({ error: `Invalid scenario id: "${scenarioId}".` });
    return null;
  }
  if (!scenarioExists(scenarioId)) {
    res.status(404).json({ error: `Scenario "${scenarioId}" not found.` });
    return null;
  }
  return scenarioId;
}

router.get('/api/scenarios', (req, res) => {
  try {
    const ids = listScenarioDirectories();
    const scenarios = ids.map((id) => {
      let title = id;
      let description = '';
      let difficulty;
      let initialRequest = '';
      try {
        const { scenario } = loadScenarioFiles(id);
        title = scenario.title || id;
        description = scenario.description || '';
        if (scenario.difficulty !== undefined) {
          difficulty = scenario.difficulty;
        }
        initialRequest = scenario.initialRequest || '';
      } catch {
        // Skip unreadable scenarios from list but still include basic info.
      }
      return { id, title, description, ...(difficulty !== undefined ? { difficulty } : {}), initialRequest };
    });

    return res.json({ scenarios });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to list scenarios.', details: error.message });
  }
});

router.get('/api/scenarios/:id', (req, res) => {
  try {
    const scenarioId = sanitizeScenarioId(req.params.id);
    if (!scenarioId) {
      return res.status(400).json({ error: 'Scenario id is required.' });
    }
    if (!SAFE_ID_PATTERN.test(scenarioId) || scenarioId.includes('..')) {
      return res.status(400).json({ error: `Invalid scenario id: "${scenarioId}".` });
    }
    if (!scenarioExists(scenarioId)) {
      return res.status(404).json({ error: `Scenario "${scenarioId}" not found.` });
    }

    const files = loadScenarioFiles(scenarioId);
    const combined = mergeCombinedScenario(files);
    return res.json(combined);
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load scenario.', details: error.message });
  }
});

function normalizeCreatePayload(body) {
  const id = sanitizeScenarioId(body?.id);
  return {
    id,
    title: typeof body?.title === 'string' ? body.title.trim() : '',
    description: typeof body?.description === 'string' ? body.description.trim() : '',
    initialRequest: typeof body?.initialRequest === 'string' ? body.initialRequest.trim() : '',
    difficulty: body?.difficulty,
    hiddenRequirements: Array.isArray(body?.hiddenRequirements) ? body.hiddenRequirements : [],
    clientPersona: body?.clientPersona || {},
    evaluationRubric: body?.evaluationRubric || null,
  };
}

function buildScenarioJson(payload, overrides = {}) {
  const scenario = {
    id: payload.id,
    title: payload.title,
    initialRequest: payload.initialRequest,
    description: payload.description,
    ...overrides,
  };
  if (payload.difficulty !== undefined && payload.difficulty !== null && payload.difficulty !== '') {
    scenario.difficulty = payload.difficulty;
  }
  scenario.version = '1.0.0';
  if (scenario.status === undefined) {
    scenario.status = 'draft';
  }
  return scenario;
}

router.post('/api/scenarios', (req, res) => {
  try {
    const payload = normalizeCreatePayload(req.body || {});

    if (!payload.id) {
      return res.status(400).json({ error: 'Scenario id is required.' });
    }
    if (!SAFE_ID_PATTERN.test(payload.id)) {
      return res.status(400).json({ error: 'Scenario id must be lowercase alphanumeric with dashes only.' });
    }
    if (scenarioExists(payload.id)) {
      return res.status(409).json({ error: `Scenario "${payload.id}" already exists.` });
    }

    const scenarioJson = buildScenarioJson(payload, { status: 'draft' });
    const rubric = payload.evaluationRubric || buildDefaultRubric(payload.title || payload.id);

    const combined = {
      ...scenarioJson,
      hiddenRequirements: payload.hiddenRequirements,
      clientPersona: payload.clientPersona,
      evaluationRubric: rubric,
    };

    const validationError = validateScenario(combined);
    if (validationError) {
      return res.status(400).json({ error: `Invalid scenario: ${validationError}` });
    }

    writeScenarioFiles(payload.id, {
      scenario: scenarioJson,
      hiddenRequirements: payload.hiddenRequirements,
      clientPersona: payload.clientPersona,
      evaluationRubric: rubric,
    });

    return res.status(201).json(mergeCombinedScenario(loadScenarioFiles(payload.id)));
  } catch (error) {
    return res.status(500).json({ error: 'Unable to create scenario.', details: error.message });
  }
});

router.put('/api/scenarios/:id', (req, res) => {
  try {
    const scenarioId = sanitizeScenarioId(req.params.id);
    if (!scenarioId) {
      return res.status(400).json({ error: 'Scenario id is required.' });
    }
    if (!SAFE_ID_PATTERN.test(scenarioId) || scenarioId.includes('..')) {
      return res.status(400).json({ error: `Invalid scenario id: "${scenarioId}".` });
    }
    if (!scenarioExists(scenarioId)) {
      return res.status(404).json({ error: `Scenario "${scenarioId}" not found.` });
    }

    const existing = loadScenarioFiles(scenarioId);
    const body = req.body || {};

    const nextScenario = {
      id: scenarioId,
      title: typeof body.title === 'string' ? body.title.trim() : existing.scenario.title,
      description: typeof body.description === 'string' ? body.description.trim() : existing.scenario.description,
      initialRequest: typeof body.initialRequest === 'string' ? body.initialRequest.trim() : existing.scenario.initialRequest,
      version: existing.scenario.version || '1.0.0',
      status: existing.scenario.status || 'draft',
    };
    const hasDifficulty = body.difficulty !== undefined && body.difficulty !== null && body.difficulty !== '';
    if (hasDifficulty) {
      nextScenario.difficulty = body.difficulty;
    } else if (existing.scenario.difficulty !== undefined) {
      nextScenario.difficulty = existing.scenario.difficulty;
    }

    const nextHiddenRequirements = Array.isArray(body.hiddenRequirements)
      ? body.hiddenRequirements
      : existing.hiddenRequirements;
    const nextClientPersona = body.clientPersona && typeof body.clientPersona === 'object' && Object.keys(body.clientPersona).length > 0
      ? body.clientPersona
      : existing.clientPersona;
    const nextEvaluationRubric = body.evaluationRubric && typeof body.evaluationRubric === 'object' && Object.keys(body.evaluationRubric).length > 0
      ? body.evaluationRubric
      : existing.evaluationRubric;

    const combined = {
      ...nextScenario,
      hiddenRequirements: nextHiddenRequirements,
      clientPersona: nextClientPersona,
      evaluationRubric: nextEvaluationRubric,
    };

    const validationError = validateScenario(combined);
    if (validationError) {
      return res.status(400).json({ error: `Invalid scenario: ${validationError}` });
    }

    writeScenarioFiles(scenarioId, {
      scenario: nextScenario,
      hiddenRequirements: nextHiddenRequirements,
      clientPersona: nextClientPersona,
      evaluationRubric: nextEvaluationRubric,
    });

    return res.json(mergeCombinedScenario(loadScenarioFiles(scenarioId)));
  } catch (error) {
    return res.status(500).json({ error: 'Unable to update scenario.', details: error.message });
  }
});

router.delete('/api/scenarios/:id', (req, res) => {
  try {
    const scenarioId = sanitizeScenarioId(req.params.id);
    if (!scenarioId) {
      return res.status(400).json({ error: 'Scenario id is required.' });
    }
    if (!SAFE_ID_PATTERN.test(scenarioId) || scenarioId.includes('..')) {
      return res.status(400).json({ error: `Invalid scenario id: "${scenarioId}".` });
    }
    if (!scenarioExists(scenarioId)) {
      return res.status(404).json({ error: `Scenario "${scenarioId}" not found.` });
    }

    if (isReferencedInExperiments(scenarioId)) {
      return res.status(400).json({
        error: `Scenario "${scenarioId}" is referenced in experiment data (results.json or checkpoint) and cannot be deleted. Remove it from experiment data first to avoid breaking existing results.`,
      });
    }

    deleteScenarioFolder(scenarioId);
    return res.json({ success: true, deleted: scenarioId });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to delete scenario.', details: error.message });
  }
});

function tryCreateOne(payload) {
  const normalized = normalizeCreatePayload(payload || {});
  if (!normalized.id) {
    return { ok: false, id: normalized.id || '(no id)', reason: 'Scenario id is required.' };
  }
  if (!SAFE_ID_PATTERN.test(normalized.id)) {
    return { ok: false, id: normalized.id, reason: 'Scenario id must be lowercase alphanumeric with dashes only.' };
  }
  if (scenarioExists(normalized.id)) {
    return { ok: false, id: normalized.id, reason: `Scenario "${normalized.id}" already exists.` };
  }

  const scenarioJson = buildScenarioJson(normalized, { status: 'draft' });
  const rubric = normalized.evaluationRubric || buildDefaultRubric(normalized.title || normalized.id);
  const combined = {
    ...scenarioJson,
    hiddenRequirements: normalized.hiddenRequirements,
    clientPersona: normalized.clientPersona,
    evaluationRubric: rubric,
  };

  const validationError = validateScenario(combined);
  if (validationError) {
    return { ok: false, id: normalized.id, reason: `Invalid scenario: ${validationError}` };
  }

  try {
    writeScenarioFiles(normalized.id, {
      scenario: scenarioJson,
      hiddenRequirements: normalized.hiddenRequirements,
      clientPersona: normalized.clientPersona,
      evaluationRubric: rubric,
    });
  } catch (error) {
    return { ok: false, id: normalized.id, reason: error.message || 'Failed to write scenario files.' };
  }

  return { ok: true, id: normalized.id, title: normalized.title };
}

router.post('/api/scenarios/import', (req, res) => {
  try {
    const incoming = (req.body && Array.isArray(req.body.scenarios)) ? req.body.scenarios : [];
    if (incoming.length === 0) {
      return res.status(400).json({ error: 'Import requires a non-empty "scenarios" array.' });
    }

    const created = [];
    const skipped = [];
    let allOk = true;

    for (const payload of incoming) {
      const result = tryCreateOne(payload);
      if (result.ok) {
        created.push({ id: result.id, title: result.title });
      } else {
        allOk = false;
        skipped.push({ id: result.id, reason: result.reason });
      }
    }

    const summary = {
      total: incoming.length,
      created: created.length,
      skipped: skipped.length,
      createdItems: created,
      skippedItems: skipped,
    };

    if (allOk) {
      return res.status(201).json(summary);
    }
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ error: 'Unable to import scenarios.', details: error.message });
  }
});

module.exports = router;
