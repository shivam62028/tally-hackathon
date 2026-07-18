import { Router } from 'express';
import { AuthService } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const authService = new AuthService(req.prisma);
    const user = await authService.register(email, password);

    res.status(201).json({ user });
  } catch (err) {
    if (err.message === 'Email already registered') {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      ...req.body.deviceInfo
    };
    const ipAddress = req.ip || req.connection?.remoteAddress;

    const authService = new AuthService(req.prisma);
    const result = await authService.loginWithPassword(email, password, deviceInfo, ipAddress);

    if (result.requiresTOTP) {
      return res.json({
        requiresTOTP: true,
        pendingToken: result.pendingToken,
        message: 'Please enter your TOTP code'
      });
    }

    res.json(result);
  } catch (err) {
    if (err.message === 'Invalid credentials') {
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/verify-totp', async (req, res, next) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ error: 'User ID and TOTP code required' });
    }

    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      ...req.body.deviceInfo
    };
    const ipAddress = req.ip || req.connection?.remoteAddress;

    const authService = new AuthService(req.prisma);
    const result = await authService.verifyTOTP(userId, code, deviceInfo, ipAddress);

    res.json(result);
  } catch (err) {
    if (err.message === 'Invalid TOTP code') {
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const ipAddress = req.ip || req.connection?.remoteAddress;

    const authService = new AuthService(req.prisma);
    const result = await authService.refreshSession(refreshToken, ipAddress);

    res.json(result);
  } catch (err) {
    if (err.message.includes('Invalid') || err.message.includes('expired')) {
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.substring(7);

    const authService = new AuthService(req.prisma);
    await authService.logout(req.userId, token);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    const authService = new AuthService(req.prisma);
    await authService.logoutAll(req.userId);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const authService = new AuthService(req.prisma);
    const user = await authService.getUser(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/totp/setup', authenticate, async (req, res, next) => {
  try {
    const authService = new AuthService(req.prisma);
    const result = await authService.setupTOTP(req.userId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/totp/enable', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'TOTP code required' });
    }

    const authService = new AuthService(req.prisma);
    const result = await authService.enableTOTP(req.userId, code);

    res.json(result);
  } catch (err) {
    if (err.message === 'Invalid TOTP code') {
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/totp/disable', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'TOTP code required' });
    }

    const authService = new AuthService(req.prisma);
    const result = await authService.disableTOTP(req.userId, code);

    res.json(result);
  } catch (err) {
    if (err.message === 'Invalid TOTP code') {
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/devices/:deviceId/trust', authenticate, async (req, res, next) => {
  try {
    const authService = new AuthService(req.prisma);
    const result = await authService.trustDevice(req.userId, req.params.deviceId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/devices/:deviceId', authenticate, async (req, res, next) => {
  try {
    const authService = new AuthService(req.prisma);
    const result = await authService.revokeDevice(req.userId, req.params.deviceId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
