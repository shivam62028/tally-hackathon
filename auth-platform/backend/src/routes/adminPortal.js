import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { AdminAuthService } from '../services/adminAuth.service.js';
import { ApprovalService } from '../services/approval.service.js';
import { getFailoverService } from '../services/failover.service.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = Router();

// Admin Auth Routes
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const adminAuthService = new AdminAuthService(req.prisma);
    const result = await adminAuthService.login(email, password);

    res.json(result);
  } catch (err) {
    if (err.message === 'Invalid credentials' || err.message === 'Account is deactivated') {
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/auth/me', authenticateAdmin, async (req, res, next) => {
  try {
    const adminAuthService = new AdminAuthService(req.prisma);
    const admin = await adminAuthService.getAdmin(req.adminId);

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({ admin });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/seed', async (req, res, next) => {
  try {
    const adminAuthService = new AdminAuthService(req.prisma);
    const result = await adminAuthService.seedDefaultAdmin();

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Dashboard Stats
router.get('/dashboard/stats', authenticateAdmin, async (req, res, next) => {
  try {
    const [
      userCount,
      sessionCount,
      passkeyCount,
      pendingApprovals,
      totalApprovals,
      riskEvents,
      recentLogins
    ] = await Promise.all([
      req.prisma.user.count(),
      req.prisma.session.count({ where: { isRevoked: false } }),
      req.prisma.passkey.count(),
      req.prisma.approvalRequest.count({ where: { status: 'pending' } }),
      req.prisma.approvalRequest.count(),
      req.prisma.riskEvent.count(),
      req.prisma.loginAttempt.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    const failoverService = getFailoverService(req.prisma);
    const systemStatus = failoverService.getSystemStatus();

    res.json({
      stats: {
        users: userCount,
        activeSessions: sessionCount,
        passkeys: passkeyCount,
        pendingApprovals,
        totalApprovals,
        riskEvents
      },
      recentLogins,
      systemStatus
    });
  } catch (err) {
    next(err);
  }
});

// User Management
router.get('/users', authenticateAdmin, async (req, res, next) => {
  try {
    const users = await req.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        totpEnabled: true,
        createdAt: true,
        _count: {
          select: {
            passkeys: true,
            devices: true,
            sessions: true,
            approvalRequests: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:userId/role', authenticateAdmin, async (req, res, next) => {
  try {
    const { role } = req.body;

    if (!['user', 'approver', 'manager'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await req.prisma.user.update({
      where: { id: req.params.userId },
      data: { role },
      select: { id: true, email: true, role: true }
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:userId/reset-password', authenticateAdmin, async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await req.prisma.user.findUnique({
      where: { id: req.params.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await req.prisma.user.update({
      where: { id: req.params.userId },
      data: { passwordHash }
    });

    // Clear account lock
    await req.prisma.accountLock.deleteMany({
      where: { email: user.email }
    });

    // Clear ALL failed login attempts for this email
    await req.prisma.loginAttempt.deleteMany({
      where: { email: user.email }
    });

    // Mark related admin notifications as resolved
    await req.prisma.adminNotification.updateMany({
      where: { email: user.email, isResolved: false },
      data: { isResolved: true, resolvedBy: req.adminEmail, resolvedAt: new Date() }
    });

    res.json({ reset: true, email: user.email });
  } catch (err) {
    next(err);
  }
});

// Approval Management
router.get('/approvals', authenticateAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const requests = await req.prisma.approvalRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, email: true } },
        policy: { select: { name: true, requiredWeight: true } },
        votes: {
          include: { approver: { select: { email: true } } }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({
      requests: requests.map(r => ({
        ...r,
        actionPayload: JSON.parse(r.actionPayload)
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.post('/approvals/:requestId/force-approve', authenticateAdmin, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const request = await req.prisma.approvalRequest.findUnique({
      where: { id: req.params.requestId }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve a ${request.status} request` });
    }

    await req.prisma.approvalRequest.update({
      where: { id: req.params.requestId },
      data: {
        status: 'approved',
        completedAt: new Date()
      }
    });

    const approvalService = new ApprovalService(req.prisma);
    await approvalService.addAuditLog(req.params.requestId, 'admin_force_approved', req.adminId, {
      adminEmail: req.adminEmail,
      reason: reason || 'Admin override'
    });

    res.json({ approved: true, by: req.adminEmail });
  } catch (err) {
    next(err);
  }
});

router.post('/approvals/:requestId/force-reject', authenticateAdmin, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const request = await req.prisma.approvalRequest.findUnique({
      where: { id: req.params.requestId }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject a ${request.status} request` });
    }

    await req.prisma.approvalRequest.update({
      where: { id: req.params.requestId },
      data: {
        status: 'rejected',
        completedAt: new Date()
      }
    });

    const approvalService = new ApprovalService(req.prisma);
    await approvalService.addAuditLog(req.params.requestId, 'admin_force_rejected', req.adminId, {
      adminEmail: req.adminEmail,
      reason: reason || 'Admin override'
    });

    res.json({ rejected: true, by: req.adminEmail });
  } catch (err) {
    next(err);
  }
});

// Policy Management
router.get('/policies', authenticateAdmin, async (req, res, next) => {
  try {
    const policies = await req.prisma.approvalPolicy.findMany({
      include: {
        approverRoles: {
          include: { user: { select: { id: true, email: true } } }
        },
        _count: {
          select: { approvalRequests: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ policies });
  } catch (err) {
    next(err);
  }
});

router.post('/policies', authenticateAdmin, async (req, res, next) => {
  try {
    const { name, description, actionType, requiredWeight, timeoutMinutes, escalationChain } = req.body;

    if (!name || !actionType) {
      return res.status(400).json({ error: 'Name and action type required' });
    }

    const policy = await req.prisma.approvalPolicy.create({
      data: {
        name,
        description,
        actionType,
        requiredWeight: requiredWeight || 1,
        timeoutMinutes: timeoutMinutes || 60,
        escalationChain: escalationChain ? JSON.stringify(escalationChain) : null
      }
    });

    res.status(201).json({ policy });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Policy name already exists' });
    }
    next(err);
  }
});

router.post('/policies/:policyId/approvers', authenticateAdmin, async (req, res, next) => {
  try {
    const { userId, weight = 1 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const approver = await req.prisma.approverRole.create({
      data: {
        policyId: req.params.policyId,
        userId,
        weight
      },
      include: { user: { select: { email: true } } }
    });

    res.status(201).json({ approver });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'User is already an approver' });
    }
    next(err);
  }
});

router.delete('/policies/:policyId/approvers/:userId', authenticateAdmin, async (req, res, next) => {
  try {
    await req.prisma.approverRole.deleteMany({
      where: {
        policyId: req.params.policyId,
        userId: req.params.userId
      }
    });

    res.json({ removed: true });
  } catch (err) {
    next(err);
  }
});

// System Controls
router.get('/system/status', authenticateAdmin, async (req, res, next) => {
  try {
    const failoverService = getFailoverService(req.prisma);
    const status = failoverService.getSystemStatus();

    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post('/system/killswitch/:provider', authenticateAdmin, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { activate } = req.body;

    const failoverService = getFailoverService(req.prisma);

    if (activate) {
      failoverService.activateKillSwitch(provider);
    } else {
      failoverService.deactivateKillSwitch(provider);
    }

    res.json({
      provider,
      activated: activate,
      systemStatus: failoverService.getSystemStatus()
    });
  } catch (err) {
    next(err);
  }
});

// Risk Events
router.get('/risk-events', authenticateAdmin, async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;

    const events = await req.prisma.riskEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: {
        user: { select: { email: true } }
      }
    });

    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// Login Attempts
router.get('/login-attempts', authenticateAdmin, async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;

    const attempts = await req.prisma.loginAttempt.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    const locks = await req.prisma.accountLock.findMany();

    res.json({ attempts, locks });
  } catch (err) {
    next(err);
  }
});

router.delete('/account-locks/:email', authenticateAdmin, async (req, res, next) => {
  try {
    const email = decodeURIComponent(req.params.email);

    // Delete account lock
    await req.prisma.accountLock.deleteMany({
      where: { email }
    });

    // Delete ALL failed login attempts for this email so they can login fresh
    await req.prisma.loginAttempt.deleteMany({
      where: { email }
    });

    // Mark related notifications as resolved
    await req.prisma.adminNotification.updateMany({
      where: { email, isResolved: false },
      data: { isResolved: true, resolvedBy: req.adminEmail, resolvedAt: new Date() }
    });

    res.json({ unlocked: true, email });
  } catch (err) {
    next(err);
  }
});

// Admin Notifications
router.get('/notifications', authenticateAdmin, async (req, res, next) => {
  try {
    const { unreadOnly } = req.query;
    const where = unreadOnly === 'true' ? { isRead: false } : {};

    const notifications = await req.prisma.adminNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const unreadCount = await req.prisma.adminNotification.count({
      where: { isRead: false }
    });

    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/:id/read', authenticateAdmin, async (req, res, next) => {
  try {
    await req.prisma.adminNotification.update({
      where: { id: req.params.id },
      data: { isRead: true }
    });

    res.json({ marked: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/:id/resolve', authenticateAdmin, async (req, res, next) => {
  try {
    await req.prisma.adminNotification.update({
      where: { id: req.params.id },
      data: {
        isResolved: true,
        resolvedBy: req.adminEmail,
        resolvedAt: new Date()
      }
    });

    res.json({ resolved: true });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/mark-all-read', authenticateAdmin, async (req, res, next) => {
  try {
    await req.prisma.adminNotification.updateMany({
      where: { isRead: false },
      data: { isRead: true }
    });

    res.json({ marked: true });
  } catch (err) {
    next(err);
  }
});

// Password Reset Requests
router.get('/password-reset-requests', authenticateAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const requests = await req.prisma.passwordResetRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

router.post('/password-reset-requests/:id/approve', authenticateAdmin, async (req, res, next) => {
  try {
    const { newPassword, adminNotes } = req.body;

    const request = await req.prisma.passwordResetRequest.findUnique({
      where: { id: req.params.id }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    const user = await req.prisma.user.findUnique({
      where: { email: request.email }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await req.prisma.user.update({
      where: { email: request.email },
      data: { passwordHash }
    });

    await req.prisma.passwordResetRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'approved',
        adminNotes,
        processedBy: req.adminEmail,
        processedAt: new Date()
      }
    });

    await req.prisma.accountLock.deleteMany({
      where: { email: request.email }
    });

    // Clear failed login attempts too
    await req.prisma.loginAttempt.deleteMany({
      where: { email: request.email, success: false }
    });

    res.json({ approved: true, email: request.email });
  } catch (err) {
    next(err);
  }
});

router.post('/password-reset-requests/:id/reject', authenticateAdmin, async (req, res, next) => {
  try {
    const { adminNotes } = req.body;

    await req.prisma.passwordResetRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        adminNotes,
        processedBy: req.adminEmail,
        processedAt: new Date()
      }
    });

    res.json({ rejected: true });
  } catch (err) {
    next(err);
  }
});

export default router;
