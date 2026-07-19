import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { generateTokens } from '../utils/jwt.js';
import { hashData, generateSecureToken } from '../utils/crypto.js';
import { RiskService } from './risk.service.js';
import { LoginAttemptService } from './loginAttempt.service.js';

const RP_NAME = 'Auth Platform';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

export class PasskeyService {
  constructor(prisma) {
    this.prisma = prisma;
    this.riskService = new RiskService(prisma);
    this.loginAttemptService = new LoginAttemptService(prisma);
  }

  async storeChallenge(identifier, challenge, type, userId = null, ttlMinutes = 5) {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.webAuthnChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });

    await this.prisma.webAuthnChallenge.upsert({
      where: { identifier },
      update: { challenge, type, userId, expiresAt },
      create: { identifier, challenge, type, userId, expiresAt }
    });
  }

  async getChallenge(identifier) {
    const record = await this.prisma.webAuthnChallenge.findUnique({
      where: { identifier }
    });

    if (!record) return null;

    if (new Date() > record.expiresAt) {
      await this.prisma.webAuthnChallenge.delete({ where: { identifier } });
      return null;
    }

    return {
      challenge: record.challenge,
      type: record.type,
      userId: record.userId,
      expires: record.expiresAt.getTime()
    };
  }

  async deleteChallenge(identifier) {
    await this.prisma.webAuthnChallenge.deleteMany({
      where: { identifier }
    });
  }

  async generateRegistrationOptions(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passkeys: true }
    });

    if (!user) throw new Error('User not found');

    const existingCredentials = user.passkeys.map(pk => ({
      id: Buffer.from(pk.credentialId, 'base64url'),
      type: 'public-key',
      transports: pk.transports ? JSON.parse(pk.transports) : undefined
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: Buffer.from(userId),
      userName: user.email,
      userDisplayName: user.email.split('@')[0],
      attestationType: 'none',
      excludeCredentials: existingCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform'
      }
    });

    await this.storeChallenge(`reg_${userId}`, options.challenge, 'registration', userId);

    return options;
  }

  async verifyRegistration(userId, response) {
    const challengeData = await this.getChallenge(`reg_${userId}`);

    if (!challengeData || challengeData.type !== 'registration') {
      throw new Error('No registration challenge found');
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Passkey verification failed');
    }

    const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const passkey = await this.prisma.passkey.create({
      data: {
        userId,
        credentialId: Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: Buffer.from(credentialPublicKey),
        counter: BigInt(counter),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: response.response.transports
          ? JSON.stringify(response.response.transports)
          : null
      }
    });

    await this.deleteChallenge(`reg_${userId}`);

    return {
      verified: true,
      passkeyId: passkey.id,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp
    };
  }

  async generateAuthenticationOptions(email) {
    const user = email
      ? await this.prisma.user.findUnique({
          where: { email },
          include: { passkeys: true }
        })
      : null;

    const allowCredentials = user?.passkeys.map(pk => ({
      id: Buffer.from(pk.credentialId, 'base64url'),
      type: 'public-key',
      transports: pk.transports ? JSON.parse(pk.transports) : undefined
    }));

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: allowCredentials || [],
      userVerification: 'preferred'
    });

    const challengeKey = `auth_${email || 'anonymous'}`;
    await this.storeChallenge(challengeKey, options.challenge, 'authentication', user?.id);

    return { ...options, userId: user?.id };
  }

  async verifyAuthentication(response, email, deviceInfo, ipAddress) {
    const challengeKey = `auth_${email || 'anonymous'}`;
    const challengeData = await this.getChallenge(challengeKey);

    if (!challengeData || challengeData.type !== 'authentication') {
      throw new Error('No authentication challenge found');
    }

    if (email) {
      const lockStatus = await this.loginAttemptService.checkAccountLock(email);
      if (lockStatus.locked) {
        throw new Error(`Account temporarily locked. Try again in ${lockStatus.remainingMinutes} minute(s).`);
      }
    }

    const credentialIdBase64 = Buffer.from(response.id, 'base64url').toString('base64url');

    const passkey = await this.prisma.passkey.findUnique({
      where: { credentialId: credentialIdBase64 },
      include: { user: true }
    });

    if (!passkey) {
      if (email) {
        const attemptResult = await this.loginAttemptService.recordAttempt(
          email, ipAddress, deviceInfo?.userAgent, false, 'Passkey not found'
        );
        const warningMsg = this.loginAttemptService.getAttemptWarningMessage(
          attemptResult.attemptCount, attemptResult.remainingAttempts
        );
        if (warningMsg) throw new Error(warningMsg);
      }
      throw new Error('Passkey not found');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        authenticator: {
          credentialID: Buffer.from(passkey.credentialId, 'base64url'),
          credentialPublicKey: passkey.credentialPublicKey,
          counter: Number(passkey.counter)
        }
      });
    } catch (err) {
      const attemptResult = await this.loginAttemptService.recordAttempt(
        passkey.user.email, ipAddress, deviceInfo?.userAgent, false, 'Passkey verification failed'
      );
      const warningMsg = this.loginAttemptService.getAttemptWarningMessage(
        attemptResult.attemptCount, attemptResult.remainingAttempts
      );
      throw new Error(warningMsg || 'Passkey authentication failed');
    }

    if (!verification.verified) {
      const attemptResult = await this.loginAttemptService.recordAttempt(
        passkey.user.email, ipAddress, deviceInfo?.userAgent, false, 'Passkey verification failed'
      );
      const warningMsg = this.loginAttemptService.getAttemptWarningMessage(
        attemptResult.attemptCount, attemptResult.remainingAttempts
      );
      throw new Error(warningMsg || 'Passkey authentication failed');
    }

    await this.loginAttemptService.recordAttempt(passkey.user.email, ipAddress, deviceInfo?.userAgent, true);

    const riskAssessment = await this.riskService.assessLoginRisk(passkey.userId, deviceInfo, ipAddress);

    if (riskAssessment.decision === 'block') {
      throw new Error('Login blocked due to suspicious activity. Please try again later or contact support.');
    }

    if (riskAssessment.decision === 'restrict') {
      throw new Error('Login restricted. Please verify your identity through another method or contact support.');
    }

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsed: new Date()
      }
    });

    await this.deleteChallenge(challengeKey);

    const device = await this.getOrCreateDevice(passkey.userId, deviceInfo, ipAddress);
    const tokens = generateTokens(passkey.userId, device.id);
    const tokenFamily = generateSecureToken(16);

    await this.prisma.session.create({
      data: {
        userId: passkey.userId,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenFamily,
        deviceId: device.id,
        ipAddress,
        userAgent: deviceInfo?.userAgent,
        expiresAt: tokens.refreshExpiry
      }
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiry,
      user: { id: passkey.userId, email: passkey.user.email },
      device: { id: device.id, isTrusted: device.isTrusted },
      riskLevel: riskAssessment.riskLevel
    };
  }

  async getOrCreateDevice(userId, deviceInfo, ipAddress) {
    const fingerprint = hashData({
      userAgent: deviceInfo?.userAgent,
      ...deviceInfo
    });

    let device = await this.prisma.device.findUnique({
      where: {
        userId_fingerprint: { userId, fingerprint }
      }
    });

    if (!device) {
      device = await this.prisma.device.create({
        data: {
          userId,
          fingerprint,
          userAgent: deviceInfo?.userAgent || 'unknown',
          ipAddress,
          isTrusted: true,
          trustScore: 80
        }
      });
    } else {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSeen: new Date() }
      });
    }

    return device;
  }

  async listPasskeys(userId) {
    return this.prisma.passkey.findMany({
      where: { userId },
      select: {
        id: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsed: true
      }
    });
  }

  async deletePasskey(userId, passkeyId) {
    const passkey = await this.prisma.passkey.findFirst({
      where: { id: passkeyId, userId }
    });

    if (!passkey) throw new Error('Passkey not found');

    await this.prisma.passkey.delete({ where: { id: passkeyId } });

    return { deleted: true };
  }
}
