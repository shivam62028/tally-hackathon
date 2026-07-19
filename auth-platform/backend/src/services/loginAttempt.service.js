import { NotificationService } from './notification.service.js';

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const ATTEMPT_WINDOW_MINUTES = 30;

export class LoginAttemptService {
  constructor(prisma) {
    this.prisma = prisma;
    this.notificationService = new NotificationService(prisma);
  }

  async checkAccountLock(email) {
    const lock = await this.prisma.accountLock.findUnique({
      where: { email }
    });

    if (!lock) {
      return { locked: false };
    }

    if (new Date() > lock.lockedUntil) {
      await this.prisma.accountLock.delete({ where: { email } });
      return { locked: false };
    }

    const remainingMs = lock.lockedUntil.getTime() - Date.now();
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    return {
      locked: true,
      lockedUntil: lock.lockedUntil,
      remainingMinutes,
      reason: lock.reason
    };
  }

  async getRecentFailedAttempts(email) {
    const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);

    const attempts = await this.prisma.loginAttempt.findMany({
      where: {
        email,
        success: false,
        createdAt: { gte: windowStart }
      },
      orderBy: { createdAt: 'desc' }
    });

    return attempts;
  }

  async recordAttempt(email, ipAddress, userAgent, success, failReason = null) {
    const recentAttempts = await this.getRecentFailedAttempts(email);
    const attemptCount = success ? 0 : recentAttempts.length + 1;

    await this.prisma.loginAttempt.create({
      data: {
        email,
        ipAddress,
        userAgent,
        success,
        failReason,
        attemptCount: success ? 0 : attemptCount
      }
    });

    if (success) {
      await this.prisma.accountLock.deleteMany({ where: { email } });
      return { recorded: true, attemptCount: 0 };
    }

    const remainingAttempts = MAX_ATTEMPTS - attemptCount;

    if (attemptCount >= 3) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user) {
        await this.notificationService.sendLoginAttemptWarning(
          email,
          attemptCount,
          MAX_ATTEMPTS,
          ipAddress,
          userAgent
        );
      }

      await this.prisma.adminNotification.create({
        data: {
          type: 'suspicious_login',
          title: 'Suspicious Login Attempts',
          message: `${attemptCount} failed login attempts detected for ${email}. ${remainingAttempts} attempts remaining before lock.`,
          email,
          ipAddress,
          metadata: JSON.stringify({ userAgent, attemptCount, remainingAttempts })
        }
      });
    }

    if (attemptCount >= MAX_ATTEMPTS) {
      await this.lockAccount(email, ipAddress, userAgent);
    }

    return {
      recorded: true,
      attemptCount,
      remainingAttempts: Math.max(0, remainingAttempts),
      warningThreshold: attemptCount >= 3,
      maxAttempts: MAX_ATTEMPTS
    };
  }

  async lockAccount(email, ipAddress, userAgent) {
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);

    await this.prisma.accountLock.upsert({
      where: { email },
      update: {
        lockedAt: new Date(),
        lockedUntil,
        reason: 'Too many failed login attempts'
      },
      create: {
        email,
        lockedUntil,
        reason: 'Too many failed login attempts'
      }
    });

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      await this.notificationService.sendAccountLockedNotification(
        email,
        ipAddress,
        userAgent,
        LOCK_DURATION_MINUTES
      );
    }

    await this.prisma.adminNotification.create({
      data: {
        type: 'account_locked',
        title: 'Account Locked',
        message: `Account ${email} has been locked due to ${MAX_ATTEMPTS} failed login attempts`,
        email,
        ipAddress,
        metadata: JSON.stringify({ userAgent, lockedUntil, attemptCount: MAX_ATTEMPTS })
      }
    });

    return { locked: true, lockedUntil };
  }

  async clearFailedAttempts(email) {
    await this.prisma.accountLock.deleteMany({ where: { email } });

    const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
    await this.prisma.loginAttempt.deleteMany({
      where: {
        email,
        success: false,
        createdAt: { gte: windowStart }
      }
    });

    return { cleared: true };
  }

  getAttemptWarningMessage(attemptCount, remainingAttempts) {
    if (remainingAttempts <= 0) {
      return 'Account locked due to too many failed attempts. Please check your email.';
    }

    if (attemptCount >= 3) {
      return `Warning: You have ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before your account is temporarily locked.`;
    }

    return null;
  }
}
