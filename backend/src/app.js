const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const errorMiddleware = require('./middleware/errors');

function createApp() {
  const app = express();

  // 1. CORS — чтобы React-фронтенд мог обращаться к API
  app.use(cors({ origin: '*' }));

  // 2. JSON-парсер — чтобы принимать JSON в теле запросов
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 3. Health-check эндпоинт /health (проверка, что сервер жив)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'node-backend' });
  });

  // 4. Подключение маршрутов авторизации
  app.use('/api/auth', authRoutes);

  // 5. 404-обработчик для несуществующих путей
  app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // 6. Middleware обработки ошибок — идёт последним
  app.use(errorMiddleware);

  return app;
}

module.exports = createApp;