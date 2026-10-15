const express = require('express');
const router = express.Router();

/**
 * POST /register
 * Заглушка регистрации: возвращает 501 «coming soon»
 */
router.post('/register', (req, res) => {
  res.status(501).json({ error: 'Register: coming soon' });
});

/**
 * POST /login
 * Заглушка логина: возвращает 501 «coming soon»
 */
router.post('/login', (req, res) => {
  res.status(501).json({ error: 'Login: coming soon' });
});

/**
 * GET /me
 * Заглушка профиля: возвращает 501 «coming soon»
 */
router.get('/me', (req, res) => {
  res.status(501).json({ error: 'Me: coming soon' });
});

module.exports = router;
