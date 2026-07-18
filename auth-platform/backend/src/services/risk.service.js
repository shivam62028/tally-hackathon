import { hashData } from '../utils/crypto.js';

const RISK_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 60,
  HIGH: 80
};

const RISK_DECISIONS = {
  ALLOW: 'allow',
  ALLOW_NOTIFY: 'allow_notify',
  STEP_UP: 'step_up',
  RESTRICT: 'restrict',
  BLOCK: 'block'
};

export class RiskService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async assessLoginRisk(userId, deviceInfo, ipAddress) {
    const factors = [];
    let riskScore = 0;

    const user = userId ? await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        devices: { orderBy: { lastSeen: 'desc' }, take: 10 },
        sessions: { orderBy: { createdAt: 'desc' }, take: 20 },
        riskEvents: { orderBy: { createdAt: 'desc' }, take: 50 }
      }
    }) : null;

    const deviceFingerprint = hashData({
      userAgent: deviceInfo?.userAgent,
      ...deviceInfo
    });

    const knownDevice = user?.devices.find(d => d.fingerprint === deviceFingerprint);

    if (!knownDevice) {
      riskScore += 25;
      factors.push({
        factor: 'new_device',
        score: 25,
        description: 'Login from a new, unrecognized device'
      });
    } else if (!knownDevice.isTrusted) {
      riskScore += 10;
      factors.push({
        factor: 'untrusted_device',
        score: 10,
        description: 'Device has not been marked as trusted'
      });
    } else {
      factors.push({
        factor: 'trusted_device',
        score: -10,
        description: 'Login from a trusted device'
      });
      riskScore = Math.max(0, riskScore - 10);
    }

    if (user?.sessions) {
      const recentIPs = [...new Set(user.sessions.map(s => s.ipAddress).filter(Boolean))];
      if (ipAddress && !recentIPs.includes(ipAddress)) {
        riskScore += 15;
        factors.push({
          factor: 'new_ip_address',
          score: 15,
          description: 'Login from a new IP address'
        });
      }
    }

    if (user?.riskEvents) {
      const recentHighRisk = user.riskEvents.filter(
        e => e.riskScore > RISK_THRESHOLDS.HIGH &&
             new Date(e.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

      if (recentHighRisk.length > 0) {
        riskScore += 20;
        factors.push({
          factor: 'recent_high_risk_events',
          score: 20,
          description: `${recentHighRisk.length} high-risk events in the last 24 hours`
        });
      }

      const recentFailedLogins = user.riskEvents.filter(
        e => e.eventType === 'failed_login' &&
             new Date(e.createdAt) > new Date(Date.now() - 60 * 60 * 1000)
      );

      if (recentFailedLogins.length >= 3) {
        riskScore += 15;
        factors.push({
          factor: 'multiple_failed_attempts',
          score: 15,
          description: `${recentFailedLogins.length} failed login attempts in the last hour`
        });
      }
    }

    const hour = new Date().getHours();
    if (hour >= 1 && hour <= 5) {
      riskScore += 10;
      factors.push({
        factor: 'unusual_time',
        score: 10,
        description: 'Login attempt during unusual hours (1 AM - 5 AM)'
      });
    }

    if (deviceInfo?.userAgent) {
      const suspiciousAgents = ['curl', 'wget', 'python', 'httpie', 'postman'];
      const agentLower = deviceInfo.userAgent.toLowerCase();
      if (suspiciousAgents.some(s => agentLower.includes(s))) {
        riskScore += 20;
        factors.push({
          factor: 'suspicious_user_agent',
          score: 20,
          description: 'Request from an automated or suspicious client'
        });
      }
    }

    if (user?.passkeys?.length > 0) {
      factors.push({
        factor: 'passkey_enrolled',
        score: -15,
        description: 'User has passkeys enrolled (hardware-backed authentication)'
      });
      riskScore = Math.max(0, riskScore - 15);
    }

    riskScore = Math.min(100, Math.max(0, riskScore));

    const decision = this.determineDecision(riskScore);
    const explanation = this.generateExplanation(factors, riskScore, decision);

    const riskEvent = await this.prisma.riskEvent.create({
      data: {
        userId,
        eventType: 'login_attempt',
        riskScore,
        riskFactors: JSON.stringify(factors),
        ipAddress,
        userAgent: deviceInfo?.userAgent,
        decision,
        explanation
      }
    });

    return {
      riskScore,
      riskLevel: this.getRiskLevel(riskScore),
      decision,
      factors,
      explanation,
      eventId: riskEvent.id
    };
  }

  async assessActionRisk(userId, actionType, actionPayload, deviceInfo, ipAddress) {
    const factors = [];
    let riskScore = 0;

    const baseActionRisk = {
      'deploy_production': 40,
      'approve_transaction': 35,
      'delete_data': 45,
      'change_permissions': 30,
      'export_data': 25,
      'modify_settings': 20,
      'default': 15
    };

    const actionRisk = baseActionRisk[actionType] || baseActionRisk.default;
    riskScore += actionRisk;
    factors.push({
      factor: 'action_type',
      score: actionRisk,
      description: `Action type "${actionType}" has inherent risk level`
    });

    const loginRisk = await this.assessLoginRisk(userId, deviceInfo, ipAddress);
    if (loginRisk.riskScore > 0) {
      const sessionRisk = Math.floor(loginRisk.riskScore * 0.5);
      riskScore += sessionRisk;
      factors.push({
        factor: 'session_risk',
        score: sessionRisk,
        description: 'Inherited risk from current session context'
      });
    }

    if (actionPayload?.amount) {
      const amount = parseFloat(actionPayload.amount);
      if (amount > 100000) {
        riskScore += 30;
        factors.push({
          factor: 'high_value_transaction',
          score: 30,
          description: `Transaction amount ($${amount.toLocaleString()}) exceeds high-value threshold`
        });
      } else if (amount > 10000) {
        riskScore += 15;
        factors.push({
          factor: 'medium_value_transaction',
          score: 15,
          description: `Transaction amount ($${amount.toLocaleString()}) exceeds medium-value threshold`
        });
      }
    }

    riskScore = Math.min(100, Math.max(0, riskScore));

    const decision = this.determineDecision(riskScore);
    const explanation = this.generateExplanation(factors, riskScore, decision);

    await this.prisma.riskEvent.create({
      data: {
        userId,
        eventType: `action_${actionType}`,
        riskScore,
        riskFactors: JSON.stringify(factors),
        ipAddress,
        userAgent: deviceInfo?.userAgent,
        decision,
        explanation
      }
    });

    return {
      riskScore,
      riskLevel: this.getRiskLevel(riskScore),
      decision,
      factors,
      explanation,
      requiresApproval: riskScore > RISK_THRESHOLDS.MEDIUM
    };
  }

  determineDecision(riskScore) {
    if (riskScore < RISK_THRESHOLDS.LOW) {
      return RISK_DECISIONS.ALLOW;
    } else if (riskScore < RISK_THRESHOLDS.MEDIUM) {
      return RISK_DECISIONS.ALLOW_NOTIFY;
    } else if (riskScore < RISK_THRESHOLDS.HIGH) {
      return RISK_DECISIONS.STEP_UP;
    } else if (riskScore < 95) {
      return RISK_DECISIONS.RESTRICT;
    }
    return RISK_DECISIONS.BLOCK;
  }

  getRiskLevel(riskScore) {
    if (riskScore < RISK_THRESHOLDS.LOW) return 'low';
    if (riskScore < RISK_THRESHOLDS.MEDIUM) return 'medium';
    if (riskScore < RISK_THRESHOLDS.HIGH) return 'high';
    return 'critical';
  }

  generateExplanation(factors, riskScore, decision) {
    const topFactors = factors
      .filter(f => f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (topFactors.length === 0) {
      return 'This appears to be a normal, low-risk activity with no concerning factors detected.';
    }

    let explanation = `Risk score of ${riskScore}/100 detected. `;

    const descriptions = topFactors.map(f => f.description);
    explanation += `Key factors: ${descriptions.join('; ')}. `;

    switch (decision) {
      case RISK_DECISIONS.ALLOW:
        explanation += 'Activity is allowed to proceed normally.';
        break;
      case RISK_DECISIONS.ALLOW_NOTIFY:
        explanation += 'Activity is allowed but has been flagged for review.';
        break;
      case RISK_DECISIONS.STEP_UP:
        explanation += 'Additional verification is required before proceeding.';
        break;
      case RISK_DECISIONS.RESTRICT:
        explanation += 'Activity is restricted. Please contact support or try from a trusted device.';
        break;
      case RISK_DECISIONS.BLOCK:
        explanation += 'Activity has been blocked due to high risk. Please verify your identity.';
        break;
    }

    return explanation;
  }

  async getRiskHistory(userId, limit = 20) {
    return this.prisma.riskEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  async logFailedLogin(email, ipAddress, userAgent, reason) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    await this.prisma.riskEvent.create({
      data: {
        userId: user?.id,
        eventType: 'failed_login',
        riskScore: 30,
        riskFactors: JSON.stringify([{ factor: 'failed_login', reason }]),
        ipAddress,
        userAgent,
        decision: 'logged',
        explanation: `Failed login attempt: ${reason}`
      }
    });
  }
}
