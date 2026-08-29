const express = require('express');
const { loadScenario } = require('../scenario-loader');
const { clientAgent } = require('../services/client-agent');
const { evaluatorAgent } = require('../services/evaluator-agent');

const router = express.Router();

router.post('/api/evaluate', async (req, res) => {
  try {
    const { sessionId } = req.body || {};

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      return res.status(400).json({ error: 'sessionId is required.' });
    }

    const session = clientAgent.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const scenario = loadScenario(session.scenarioId);
    const evaluation = await evaluatorAgent.evaluateSession(sessionId, scenario);

    return res.json(evaluation);
  } catch (error) {
    return res.status(500).json({
      error: 'Unable to evaluate transcript',
      details: error.message,
    });
  }
});

module.exports = router;
