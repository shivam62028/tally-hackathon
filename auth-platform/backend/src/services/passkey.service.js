import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { generateTokens } from '../utils/jwt.js';
import { hashData } from '../utils/crypto.js';

const RP_NAME = 'Auth Platform';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

export class PasskeyService {
  constructor(prisma) {
    this.prisma = prisma;
    this.challenges = new Map();
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

    this.challenges.set(userId, {
      challenge: options.challenge,
      type: 'registration',
      expires: Date.now() + 5 * 60 * 1000
    });

    return options;
  }

  async verifyRegistration(userId, response) {
    const challengeData = this.challenges.get(userId);

    if (!challengeData || challengeData.type !== 'registration') {
      throw new Error('No registration challenge found');
    }

    if (Date.now() > challengeData.expires) {
      this.challenges.delete(userId);
      throw new Error('Challenge expired');
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

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const passkey = await this.prisma.passkey.create({
      data: {
        userId,
        credentialId: Buffer.from(credential.id).toString('base64url'),
        credentialPublicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: response.response.transports
          ? JSON.stringify(response.response.transports)
          : null
      }
    });

    this.challenges.delete(userId);

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

    const challengeKey = email || 'anonymous';
    this.challenges.set(challengeKey, {
      challenge: options.challenge,
      type: 'authentication',
      expires: Date.now() + 5 * 60 * 1000,
      userId: user?.id
    });

    return { ...options, userId: user?.id };
  }

  async verifyAuthentication(response, email, deviceInfo, ipAddress) {
    const challengeKey = email || 'anonymous';
    const challengeData = this.challenges.get(challengeKey);

    if (!challengeData || challengeData.type !== 'authentication') {
      throw new Error('No authentication challenge found');
    }

    if (Date.now() > challengeData.expires) {
      this.challenges.delete(challengeKey);
      throw new Error('Challenge expired');
    }

    const credentialIdBase64 = Buffer.from(response.id, 'base64url').toString('base64url');

    const passkey = await this.prisma.passkey.findUnique({
      where: { credentialId: credentialIdBase64 },
      include: { user: true }
    });

    if (!passkey) {
      throw new Error('Passkey not found');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: Buffer.from(passkey.credentialId, 'base64url'),
        publicKey: passkey.credentialPublicKey,
        counter: Number(passkey.counter)
      }
    });

    if (!verification.verified) {
      throw new Error('Passkey authentication failed');
    }

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsed: new Date()
      }
    });

    this.challenges.delete(challengeKey);

    const device = await this.getOrCreateDevice(passkey.userId, deviceInfo, ipAddress);
    const tokens = generateTokens(passkey.userId, device.id);

    await this.prisma.session.create({
      data: {
        userId: passkey.userId,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
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
      device: { id: device.id, isTrusted: device.isTrusted }
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
