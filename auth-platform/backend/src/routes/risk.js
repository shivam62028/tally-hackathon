import { Router } from 'express';
import { RiskService } from '../services/risk.service.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/assess/login', optionalAuth, async (req, res, next) => {
  try {
    const { email } = req.body;
    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      ...req.body.deviceInfo
    };
    const ipAddress = req.ip || req.connection?.remoteAddress;

    let userId = req.userId;
    if (!userId && email) {
      const user = await req.prisma.user.findUnique({ where: { email } });
      userId = user?.id;
    }

    const riskService = new RiskService(req.prisma);
    const assessment = await riskService.assessLoginRisk(userId, deviceInfo, ipAddress);

    res.json(assessment);
  } catch (err) {
    next(err);
  }
});

router.post('/assess/action', authenticate, async (req, res, next) => {
  try {
    const { actionType, actionPayload } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: 'Action type is required' });
    }

    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      ...req.body.deviceInfo
    };
    const ipAddress = req.ip || req.connection?.remoteAddress;

    const riskService = new RiskService(req.prisma);
    const assessment = await riskService.assessActionRisk(
      req.userId,
      actionType,
      actionPayload,
      deviceInfo,
      ipAddress
    );

    res.json(assessment);
  } catch (err) {
    next(err);
  }
});

router.get('/history', authenticate, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const riskService = new RiskService(req.prisma);
    const history = await riskService.getRiskHistory(req.userId, limit);

    res.json({ events: history });
  } catch (err) {
    next(err);
  }
});

router.post('/log-failed', async (req, res, next) => {
  try {
    const { email, reason } = req.body;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const riskService = new RiskService(req.prisma);
    await riskService.logFailedLogin(email, ipAddress, userAgent, reason || 'Unknown');

    res.json({ logged: true });
  } catch (err) {
    next(err);
  }
});

router.get('/score/:userId', authenticate, async (req, res, next) => {
  try {
    if (req.userId !== req.params.userId) {
      return res.status(403).json({ error: 'Cannot view other user risk scores' });
    }

    const deviceInfo = {
      userAgent: req.headers['user-agent']
    };
    const ipAddress = req.ip || req.connection?.remoteAddress;

    const riskService = new RiskService(req.prisma);
    const assessment = await riskService.assessLoginRisk(req.userId, deviceInfo, ipAddress);

    res.json({
      currentRiskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      explanation: assessment.explanation
    });
  } catch (err) {
    next(err);
  }
});

export default router;
