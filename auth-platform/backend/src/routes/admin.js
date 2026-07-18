import { Router } from 'express';
import { getFailoverService } from '../services/failover.service.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/system/status', async (req, res, next) => {
  try {
    const failoverService = getFailoverService(req.prisma);
    const status = failoverService.getSystemStatus();

    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post('/system/health-check', async (req, res, next) => {
  try {
    const failoverService = getFailoverService(req.prisma);
    const results = await failoverService.healthCheck();

    res.json({ healthCheck: results });
  } catch (err) {
    next(err);
  }
});

router.post('/killswitch/:provider/activate', async (req, res, next) => {
  try {
    const { provider } = req.params;
    const failoverService = getFailoverService(req.prisma);
    const result = failoverService.activateKillSwitch(provider);

    res.json({
      ...result,
      systemStatus: failoverService.getSystemStatus()
    });
  } catch (err) {
    next(err);
  }
});

router.post('/killswitch/:provider/deactivate', async (req, res, next) => {
  try {
    const { provider } = req.params;
    const failoverService = getFailoverService(req.prisma);
    const result = failoverService.deactivateKillSwitch(provider);

    res.json({
      ...result,
      systemStatus: failoverService.getSystemStatus()
    });
  } catch (err) {
    next(err);
  }
});

router.get('/available-methods', async (req, res, next) => {
  try {
    const failoverService = getFailoverService(req.prisma);
    const methods = failoverService.getAvailableMethods();

    res.json({
      availableMethods: methods,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

router.post('/send-verification', authenticate, async (req, res, next) => {
  try {
    const { preferredMethod } = req.body;
    const failoverService = getFailoverService(req.prisma);
    const result = await failoverService.sendVerificationCode(req.userId, preferredMethod);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await req.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        totpEnabled: true,
        createdAt: true,
        _count: {
          select: {
            passkeys: true,
            devices: true,
            sessions: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const [
      userCount,
      sessionCount,
      passkeyCount,
      approvalCount,
      riskEventCount
    ] = await Promise.all([
      req.prisma.user.count(),
      req.prisma.session.count({ where: { isRevoked: false } }),
      req.prisma.passkey.count(),
      req.prisma.approvalRequest.count(),
      req.prisma.riskEvent.count()
    ]);

    const recentRiskEvents = await req.prisma.riskEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        riskScore: true,
        decision: true,
        createdAt: true
      }
    });

    const pendingApprovals = await req.prisma.approvalRequest.count({
      where: { status: 'pending' }
    });

    res.json({
      stats: {
        users: userCount,
        activeSessions: sessionCount,
        passkeys: passkeyCount,
        approvalRequests: approvalCount,
        pendingApprovals,
        riskEvents: riskEventCount
      },
      recentRiskEvents
    });
  } catch (err) {
    next(err);
  }
});

export default router;
