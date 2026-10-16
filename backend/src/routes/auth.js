const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../services/db');
const { ObjectId } = require('mongodb');
const authMiddleware = require('../middleware/auth');

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string' && ObjectId.isValid(id) && id.length === 24) {
    try {
      return new ObjectId(id);
    } catch (e) {
      return id;
    }
  }
  return id;
}

/**
 * POST /api/auth/register
 * Регистрация нового пользователя
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, password, name, avatar } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }

    if (String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    const db = getDB();
    const existing = await db.collection('users').findOne({ username: cleanUsername });
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      username: cleanUsername,
      name: name ? String(name).trim() : cleanUsername,
      avatar: avatar || null,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('users').insertOne(newUser);
    const userId = String(result.insertedId);

    const secret = process.env.JWT_SECRET || 'secret';
    const token = jwt.sign(
      {
        userId,
        username: newUser.username,
        name: newUser.name,
      },
      secret,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      status: 'ok',
      token,
      user: {
        id: userId,
        username: newUser.username,
        name: newUser.name,
        avatar: newUser.avatar,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Авторизация пользователя
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const db = getDB();
    const user = await db.collection('users').findOne({ username: cleanUsername });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const userId = String(user._id);
    const secret = process.env.JWT_SECRET || 'secret';
    const token = jwt.sign(
      {
        userId,
        username: user.username,
        name: user.name || user.username,
      },
      secret,
      { expiresIn: '30d' }
    );

    res.status(200).json({
      status: 'ok',
      token,
      user: {
        id: userId,
        username: user.username,
        name: user.name || user.username,
        avatar: user.avatar || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Получение профиля текущего авторизованного пользователя
 */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const db = getDB();
    const user = await db.collection('users').findOne({
      $or: [{ _id: toObjectId(userId) }, { _id: String(userId) }],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      status: 'ok',
      user: {
        id: String(user._id),
        username: user.username,
        name: user.name || user.username,
        avatar: user.avatar || null,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/users
 * Поиск и список пользователей (для быстрого создания диалогов)
 */
router.get('/users', authMiddleware, async (req, res, next) => {
  try {
    const currentUserId = String(req.user.userId || req.user.id || req.user._id);
    const search = req.query.q || req.query.search || '';
    const db = getDB();

    const query = {
      _id: { $ne: toObjectId(currentUserId) },
    };

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ username: regex }, { name: regex }];
    }

    const users = await db
      .collection('users')
      .find(query)
      .limit(30)
      .toArray();

    const formatted = users.map((u) => ({
      id: String(u._id),
      username: u.username,
      name: u.name || u.username,
      avatar: u.avatar || null,
    }));

    res.status(200).json({
      status: 'ok',
      count: formatted.length,
      users: formatted,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
