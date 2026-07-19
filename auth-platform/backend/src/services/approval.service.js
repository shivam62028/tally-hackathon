import { hashData, generateChainedHash, signData, verifySignature, generateKeyPair } from '../utils/crypto.js';

export class ApprovalService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async getOrCreateSigningKey(userId) {
    let keyRecord = await this.prisma.approverSigningKey.findUnique({
      where: { userId }
    });

    if (!keyRecord) {
      const keyPair = generateKeyPair();
      keyRecord = await this.prisma.approverSigningKey.create({
        data: {
          userId,
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey
        }
      });
    }

    return {
      publicKey: keyRecord.publicKey,
      privateKey: keyRecord.privateKey
    };
  }

  async createPolicy(data) {
    const policy = await this.prisma.approvalPolicy.create({
      data: {
        name: data.name,
        description: data.description,
        actionType: data.actionType,
        requiredWeight: data.requiredWeight || 1,
        timeoutMinutes: data.timeoutMinutes || 60,
        escalationChain: data.escalationChain ? JSON.stringify(data.escalationChain) : null
      }
    });

    return policy;
  }

  async getPolicy(policyId) {
    return this.prisma.approvalPolicy.findUnique({
      where: { id: policyId },
      include: {
        approverRoles: {
          include: { user: { select: { id: true, email: true } } }
        }
      }
    });
  }

  async getPolicyByAction(actionType) {
    return this.prisma.approvalPolicy.findFirst({
      where: { actionType, isActive: true },
      include: {
        approverRoles: {
          include: { user: { select: { id: true, email: true } } }
        }
      }
    });
  }

  async addApprover(policyId, userId, weight = 1, priority = 0) {
    return this.prisma.approverRole.create({
      data: { policyId, userId, weight, priority }
    });
  }

  async removeApprover(policyId, userId) {
    return this.prisma.approverRole.deleteMany({
      where: { policyId, userId }
    });
  }

  async createApprovalRequest(requesterId, actionType, actionPayload, adjustedRequiredWeight = null) {
    const policy = await this.getPolicyByAction(actionType);

    if (!policy) {
      throw new Error(`No approval policy found for action type: ${actionType}`);
    }

    const payloadString = JSON.stringify(actionPayload);
    const payloadHash = hashData(payloadString);

    const expiresAt = new Date(Date.now() + policy.timeoutMinutes * 60 * 1000);

    const effectiveRequiredWeight = adjustedRequiredWeight !== null
      ? Math.max(policy.requiredWeight, adjustedRequiredWeight)
      : policy.requiredWeight;

    const request = await this.prisma.approvalRequest.create({
      data: {
        requesterId,
        policyId: policy.id,
        actionType,
        actionPayload: payloadString,
        payloadHash,
        requiredWeight: effectiveRequiredWeight,
        expiresAt
      }
    });

    await this.addAuditLog(request.id, 'request_created', requesterId, {
      actionType,
      payloadHash,
      requiredWeight: policy.requiredWeight,
      expiresAt: expiresAt.toISOString()
    });

    return {
      ...request,
      policy: {
        name: policy.name,
        requiredWeight: policy.requiredWeight,
        timeoutMinutes: policy.timeoutMinutes
      },
      approvers: policy.approverRoles.map(ar => ({
        userId: ar.userId,
        email: ar.user.email,
        weight: ar.weight
      }))
    };
  }

  async getApprovalRequest(requestId) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: { select: { id: true, email: true } },
        policy: {
          include: {
            approverRoles: {
              include: { user: { select: { id: true, email: true } } }
            }
          }
        },
        votes: {
          include: { approver: { select: { id: true, email: true } } }
        },
        auditLog: { orderBy: { createdAt: 'asc' } }
      }
    });

    if (!request) return null;

    return {
      ...request,
      actionPayload: JSON.parse(request.actionPayload),
      isExpired: new Date() > request.expiresAt
    };
  }

  async submitVote(requestId, approverId, decision) {
    const request = await this.getApprovalRequest(requestId);

    if (!request) {
      throw new Error('Approval request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot vote on a ${request.status} request`);
    }

    if (new Date() > request.expiresAt) {
      await this.expireRequest(requestId);
      throw new Error('Approval request has expired');
    }

    const approverRole = request.policy.approverRoles.find(ar => ar.userId === approverId);

    if (!approverRole) {
      throw new Error('You are not authorized to vote on this request');
    }

    const existingVote = request.votes.find(v => v.approverId === approverId);
    if (existingVote) {
      throw new Error('You have already voted on this request');
    }

    const signedData = {
      requestId,
      payloadHash: request.payloadHash,
      decision,
      approverId,
      timestamp: new Date().toISOString()
    };

    const keyPair = await this.getOrCreateSigningKey(approverId);
    const signature = signData(signedData, keyPair.privateKey);

    const vote = await this.prisma.approvalVote.create({
      data: {
        requestId,
        approverId,
        decision,
        weight: approverRole.weight,
        signature,
        signedData: JSON.stringify(signedData)
      }
    });

    await this.addAuditLog(requestId, `vote_${decision}`, approverId, {
      weight: approverRole.weight,
      signaturePrefix: signature.substring(0, 20) + '...'
    });

    if (decision === 'reject') {
      await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'rejected', completedAt: new Date() }
      });

      await this.addAuditLog(requestId, 'request_rejected', null, {
        rejectedBy: approverId
      });

      return { status: 'rejected', vote };
    }

    const newWeight = request.currentWeight + approverRole.weight;

    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { currentWeight: newWeight }
    });

    if (newWeight >= request.requiredWeight) {
      await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'approved', completedAt: new Date() }
      });

      await this.addAuditLog(requestId, 'request_approved', null, {
        totalWeight: newWeight,
        requiredWeight: request.requiredWeight
      });

      return { status: 'approved', vote, totalWeight: newWeight };
    }

    return {
      status: 'pending',
      vote,
      currentWeight: newWeight,
      requiredWeight: request.requiredWeight,
      remaining: request.requiredWeight - newWeight
    };
  }

  async expireRequest(requestId) {
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'expired', completedAt: new Date() }
    });

    await this.addAuditLog(requestId, 'request_expired', null, {
      expiredAt: new Date().toISOString()
    });
  }

  async escalateRequest(requestId) {
    const request = await this.getApprovalRequest(requestId);

    if (!request) {
      throw new Error('Approval request not found');
    }

    if (!request.policy.escalationChain) {
      throw new Error('Cannot escalate: no escalation chain configured');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot escalate a ${request.status} request`);
    }

    const escalationChain = JSON.parse(request.policy.escalationChain);
    const currentApproverIds = request.policy.approverRoles.map(ar => ar.userId);

    let addedApprovers = [];
    for (const escalationLevel of escalationChain) {
      const backupUserId = escalationLevel.userId || escalationLevel.backupUserId;
      const backupWeight = escalationLevel.weight || 1;

      if (backupUserId && !currentApproverIds.includes(backupUserId)) {
        try {
          await this.prisma.approverRole.create({
            data: {
              policyId: request.policyId,
              userId: backupUserId,
              weight: backupWeight,
              priority: 10
            }
          });
          addedApprovers.push({ userId: backupUserId, weight: backupWeight });
        } catch (err) {
          if (err.code !== 'P2002') throw err;
        }
      }
    }

    const newExpiresAt = new Date(Date.now() + request.policy.timeoutMinutes * 60 * 1000);
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { expiresAt: newExpiresAt }
    });

    await this.addAuditLog(requestId, 'request_escalated', null, {
      escalationChain,
      addedApprovers,
      newExpiresAt: newExpiresAt.toISOString()
    });

    return {
      escalated: true,
      chain: escalationChain,
      addedApprovers,
      newExpiresAt
    };
  }

  async getPendingApprovals(approverId) {
    const roles = await this.prisma.approverRole.findMany({
      where: { userId: approverId },
      select: { policyId: true }
    });

    const policyIds = roles.map(r => r.policyId);

    const requests = await this.prisma.approvalRequest.findMany({
      where: {
        policyId: { in: policyIds },
        status: 'pending',
        expiresAt: { gt: new Date() },
        votes: {
          none: { approverId }
        }
      },
      include: {
        requester: { select: { id: true, email: true } },
        policy: { select: { name: true, requiredWeight: true } },
        votes: {
          select: {
            decision: true,
            weight: true,
            approver: { select: { email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return requests.map(r => ({
      ...r,
      actionPayload: JSON.parse(r.actionPayload)
    }));
  }

  async getMyRequests(requesterId) {
    const requests = await this.prisma.approvalRequest.findMany({
      where: { requesterId },
      include: {
        policy: { select: { name: true, requiredWeight: true } },
        votes: {
          select: {
            decision: true,
            weight: true,
            createdAt: true,
            approver: { select: { email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return requests.map(r => ({
      ...r,
      actionPayload: JSON.parse(r.actionPayload)
    }));
  }

  async verifyApprovalProof(requestId) {
    const request = await this.getApprovalRequest(requestId);

    if (!request) {
      throw new Error('Approval request not found');
    }

    const verificationResults = [];

    for (const vote of request.votes) {
      const signedData = JSON.parse(vote.signedData);
      const keyRecord = await this.prisma.approverSigningKey.findUnique({
        where: { userId: vote.approverId }
      });

      let isValid = false;
      let keyStatus = 'missing';
      if (keyRecord) {
        isValid = verifySignature(signedData, vote.signature, keyRecord.publicKey);
        keyStatus = isValid ? 'valid' : 'invalid';
      }

      verificationResults.push({
        approverId: vote.approverId,
        approverEmail: vote.approver.email,
        decision: vote.decision,
        weight: vote.weight,
        timestamp: signedData.timestamp,
        signatureValid: isValid,
        keyStatus,
        signedPayloadHash: signedData.payloadHash,
        matchesRequest: signedData.payloadHash === request.payloadHash
      });
    }

    let prevHash = null;
    const auditVerification = [];

    for (const entry of request.auditLog) {
      const expectedHash = generateChainedHash(
        { action: entry.action, details: entry.details, createdAt: entry.createdAt },
        prevHash
      );

      auditVerification.push({
        action: entry.action,
        timestamp: entry.createdAt,
        hashValid: entry.entryHash === expectedHash,
        chainIntact: entry.prevHash === prevHash
      });

      prevHash = entry.entryHash;
    }

    return {
      requestId,
      status: request.status,
      actionType: request.actionType,
      payloadHash: request.payloadHash,
      totalWeight: request.currentWeight,
      requiredWeight: request.requiredWeight,
      votes: verificationResults,
      auditChain: auditVerification,
      isFullyVerified: verificationResults.every(v => v.signatureValid && v.matchesRequest) &&
                       auditVerification.every(a => a.chainIntact)
    };
  }

  async addAuditLog(requestId, action, actorId, details) {
    const lastEntry = await this.prisma.approvalAuditLog.findFirst({
      where: { requestId },
      orderBy: { createdAt: 'desc' }
    });

    const entryHash = generateChainedHash(
      { action, details, createdAt: new Date() },
      lastEntry?.entryHash || null
    );

    return this.prisma.approvalAuditLog.create({
      data: {
        requestId,
        action,
        actorId,
        details: JSON.stringify(details),
        prevHash: lastEntry?.entryHash || null,
        entryHash
      }
    });
  }

  async listPolicies() {
    return this.prisma.approvalPolicy.findMany({
      where: { isActive: true },
      include: {
        approverRoles: {
          include: { user: { select: { id: true, email: true } } }
        }
      }
    });
  }
}
