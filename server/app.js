require('dotenv').config();

const express = require('express');
const sessionRoutes = require('./routes/session');
const chatRoutes = require('./routes/chat');
const evaluateRoutes = require('./routes/evaluate');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(sessionRoutes);
app.use(chatRoutes);
app.use(evaluateRoutes);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SpecSim server listening on port ${PORT}`);
  });
}

module.exports = app;
