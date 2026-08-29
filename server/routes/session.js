const express = require('express');
const { loadScenario } = require('../scenario-loader');
const { clientAgent } = require('../services/client-agent');

const router = express.Router();

router.post('/api/session/start', (req, res) => {
  try {
    const scenario = loadScenario('pharmacy-management-system');
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
