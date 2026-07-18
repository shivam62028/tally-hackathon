import { Router } from 'express';
import { PasskeyService } from '../services/passkey.service.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register/options', authenticate, async (req, res, next) => {
  try {
    const passkeyService = new PasskeyService(req.prisma);
    const options = await passkeyService.generateRegistrationOptions(req.userId);

    res.json(options);
  } catch (err) {
    next(err);
  }
});

router.post('/register/verify', authenticate, async (req, res, next) => {
  try {
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({ error: 'Registration response required' });
    }

    const passkeyService = new PasskeyService(req.prisma);
    const result = await passkeyService.verifyRegistration(req.userId, response);

    res.json(result);
  } catch (err) {
    if (err.message.includes('verification failed') || err.message.includes('expired')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/authenticate/options', async (req, res, next) => {
  try {
    const { email } = req.body;

    const passkeyService = new PasskeyService(req.prisma);
    const options = await passkeyService.generateAuthenticationOptions(email);

    res.json(options);
  } catch (err) {
    next(err);
  }
});

router.post('/authenticate/verify', async (req, res, next) => {
  try {
    const { response, email } = req.body;

    if (!response) {
      return res.status(400).json({ error: 'Authentication response required' });
    }

    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      ...req.body.deviceInfo
    };
    const ipAddress = req.ip || req.connection?.remoteAddress;

    const passkeyService = new PasskeyService(req.prisma);
    const result = await passkeyService.verifyAuthentication(response, email, deviceInfo, ipAddress);

    res.json(result);
  } catch (err) {
    if (err.message.includes('failed') || err.message.includes('not found') || err.message.includes('expired')) {
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/list', authenticate, async (req, res, next) => {
  try {
    const passkeyService = new PasskeyService(req.prisma);
    const passkeys = await passkeyService.listPasskeys(req.userId);

    res.json({ passkeys });
  } catch (err) {
    next(err);
  }
});

router.delete('/:passkeyId', authenticate, async (req, res, next) => {
  try {
    const passkeyService = new PasskeyService(req.prisma);
    const result = await passkeyService.deletePasskey(req.userId, req.params.passkeyId);

    res.json(result);
  } catch (err) {
    if (err.message === 'Passkey not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
