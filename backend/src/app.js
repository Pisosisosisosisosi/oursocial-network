const express = require('express');
const cors = require('cors');

function createApp() {
  const app = express();

  app.use(cors({ origin: '*' }));
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'node-backend' });
  });

  return app;
}

module.exports = createApp;