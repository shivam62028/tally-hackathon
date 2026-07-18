import { Router } from 'express';
import { ApprovalService } from '../services/approval.service.js';
import { RiskService } from '../services/risk.service.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/policies', authenticate, async (req, res, next) => {
  try {
    const { name, description, actionType, requiredWeight, timeoutMinutes, escalationChain } = req.body;

    if (!name || !actionType) {
      return res.status(400).json({ error: 'Name and action type are required' });
    }

    const approvalService = new ApprovalService(req.prisma);
    const policy = await approvalService.createPolicy({
      name,
      description,
      actionType,
      requiredWeight,
      timeoutMinutes,
      escalationChain
    });

    res.status(201).json({ policy });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Policy with this name already exists' });
    }
    next(err);
  }
});

router.get('/policies', authenticate, async (req, res, next) => {
  try {
    const approvalService = new ApprovalService(req.prisma);
    const policies = await approvalService.listPolicies();

    res.json({ policies });
  } catch (err) {
    next(err);
  }
});

router.get('/policies/:policyId', authenticate, async (req, res, next) => {
  try {
    const approvalService = new ApprovalService(req.prisma);
    const policy = await approvalService.getPolicy(req.params.policyId);

    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json({ policy });
  } catch (err) {
    next(err);
  }
});

router.post('/policies/:policyId/approvers', authenticate, async (req, res, next) => {
  try {
    const { userId, weight, priority } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const approvalService = new ApprovalService(req.prisma);
    const approver = await approvalService.addApprover(
      req.params.policyId,
      userId,
      weight,
      priority
    );

    res.status(201).json({ approver });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'User is already an approver for this policy' });
    }
    next(err);
  }
});

router.delete('/policies/:policyId/approvers/:userId', authenticate, async (req, res, next) => {
  try {
    const approvalService = new ApprovalService(req.prisma);
    await approvalService.removeApprover(req.params.policyId, req.params.userId);

    res.json({ removed: true });
  } catch (err) {
    next(err);
  }
});

router.post('/request', authenticate, async (req, res, next) => {
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
    const riskAssessment = await riskService.assessActionRisk(
      req.userId,
      actionType,
      actionPayload,
      deviceInfo,
      ipAddress
    );

    const approvalService = new ApprovalService(req.prisma);
    const request = await approvalService.createApprovalRequest(
      req.userId,
      actionType,
      { ...actionPayload, riskAssessment }
    );

    res.status(201).json({
      request,
      riskAssessment: {
        score: riskAssessment.riskScore,
        level: riskAssessment.riskLevel,
        explanation: riskAssessment.explanation
      }
    });
  } catch (err) {
    if (err.message.includes('No approval policy')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/requests/:requestId', authenticate, async (req, res, next) => {
  try {
    const approvalService = new ApprovalService(req.prisma);
    const request = await approvalService.getApprovalRequest(req.params.requestId);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ request });
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:requestId/vote', authenticate, async (req, res, next) => {
  try {
    const { decision } = req.body;

    if (!decision || !['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'Valid decision (approve/reject) is required' });
    }

    const approvalService = new ApprovalService(req.prisma);
    const result = await approvalService.submitVote(
      req.params.requestId,
      req.userId,
      decision
    );

    res.json(result);
  } catch (err) {
    if (err.message.includes('not found') ||
        err.message.includes('Cannot vote') ||
        err.message.includes('expired') ||
        err.message.includes('not authorized') ||
        err.message.includes('already voted')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/requests/:requestId/verify', authenticate, async (req, res, next) => {
  try {
    const approvalService = new ApprovalService(req.prisma);
    const verification = await approvalService.verifyApprovalProof(req.params.requestId);

    res.json({ verification });
  } catch (err) {
    if (err.message === 'Approval request not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/requests/:requestId/escalate', authenticate, async (req, res, next) => {
  try {
    const approvalService = new ApprovalService(req.prisma);
    const result = await approvalService.escalateRequest(req.params.requestId);

    res.json(result);
  } catch (err) {
    if (err.message.includes('Cannot escalate')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const approvalService = new ApprovalService(req.prisma);
    const requests = await approvalService.getPendingApprovals(req.userId);

    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

router.get('/my-requests', authenticate, async (req, res, next) => {
  try {
    const approvalService = new ApprovalService(req.prisma);
    const requests = await approvalService.getMyRequests(req.userId);

    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

export default router;
