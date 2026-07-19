import { Router } from 'express';
import { ApiKeyService } from '../services/apikey.service.js';
import { RiskService } from '../services/risk.service.js';
import { authenticate, authenticateApiKey, requirePermission } from '../middleware/auth.js';

const router = Router();

router.post('/api-keys', authenticate, async (req, res, next) => {
  try {
    const { name, permissions = ['read'], expiresInDays } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'API key name is required' });
    }

    const apiKeyService = new ApiKeyService(req.prisma);
    const result = await apiKeyService.createApiKey(name, permissions, req.userId, expiresInDays);

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/api-keys', authenticate, async (req, res, next) => {
  try {
    const apiKeyService = new ApiKeyService(req.prisma);
    const keys = await apiKeyService.listApiKeys(req.userId);

    res.json({ apiKeys: keys });
  } catch (err) {
    next(err);
  }
});

router.delete('/api-keys/:keyId', authenticate, async (req, res, next) => {
  try {
    const apiKeyService = new ApiKeyService(req.prisma);
    const result = await apiKeyService.revokeApiKey(req.params.keyId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/verify', authenticateApiKey, async (req, res) => {
  res.json({
    valid: true,
    keyName: req.apiKeyName,
    permissions: req.apiKeyPermissions,
    userId: req.userId
  });
});

router.post('/assess-risk', authenticateApiKey, requirePermission('risk', 'admin'), async (req, res, next) => {
  try {
    const { userId, actionType, actionPayload, deviceInfo, ipAddress } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: 'actionType is required' });
    }

    const riskService = new RiskService(req.prisma);
    const assessment = await riskService.assessActionRisk(
      userId,
      actionType,
      actionPayload || {},
      deviceInfo || {},
      ipAddress || req.ip
    );

    res.json({
      assessment,
      recommendation: assessment.decision,
      shouldProceed: ['allow', 'allow_notify'].includes(assessment.decision),
      requiresApproval: assessment.requiresApproval
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:userId', authenticateApiKey, requirePermission('read', 'admin'), async (req, res, next) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        email: true,
        totpEnabled: true,
        createdAt: true,
        _count: {
          select: {
            passkeys: true,
            devices: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/validate-session', authenticateApiKey, requirePermission('read', 'admin'), async (req, res, next) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken is required' });
    }

    const session = await req.prisma.session.findUnique({
      where: { token: accessToken },
      include: {
        user: {
          select: { id: true, email: true }
        }
      }
    });

    if (!session || session.isRevoked) {
      return res.json({ valid: false, reason: 'Session not found or revoked' });
    }

    if (new Date() > session.expiresAt) {
      return res.json({ valid: false, reason: 'Session expired' });
    }

    res.json({
      valid: true,
      userId: session.userId,
      userEmail: session.user.email,
      deviceId: session.deviceId,
      createdAt: session.createdAt
    });
  } catch (err) {
    next(err);
  }
});

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'auth-platform-integration-api',
    timestamp: new Date().toISOString()
  });
});

export default router;
