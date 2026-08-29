const express = require('express');
const { clientAgent } = require('../services/client-agent');

const router = express.Router();

router.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body || {};

    if (!sessionId || !message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'sessionId and message are required.' });
    }

    const response = await clientAgent.respondToMessage(sessionId, message);
    const session = clientAgent.getSession(sessionId);

    return res.json({
      sessionId,
      reply: response.message,
      transcript: session.transcript,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Unable to process chat message',
      details: error.message,
    });
  }
});

module.exports = router;
