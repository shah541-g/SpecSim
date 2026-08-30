const express = require('express');
const { loadScenario } = require('../scenario-loader');
const { scenarioExists } = require('../scenario-store');
const { clientAgent } = require('../services/client-agent');

const router = express.Router();

const DEFAULT_SCENARIO_ID = 'pharmacy-management-system';

router.post('/api/session/start', (req, res) => {
  try {
    const requestedId = (req.body && typeof req.body.scenarioId === 'string')
      ? req.body.scenarioId.trim()
      : '';

    let scenarioId = requestedId || DEFAULT_SCENARIO_ID;

    if (requestedId && !scenarioExists(scenarioId)) {
      return res.status(400).json({ error: `Scenario "${requestedId}" not found.` });
    }

    const scenario = loadScenario(scenarioId);
    const session = clientAgent.createSession(scenario);

    res.json({
      sessionId: session.sessionId,
      scenarioId: session.scenarioId,
      initialRequest: session.initialRequest,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to start session',
      details: error.message,
    });
  }
});

module.exports = router;
