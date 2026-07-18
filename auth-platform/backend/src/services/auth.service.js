import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { generateTokens } from '../utils/jwt.js';
import { generateSecureToken, hashData } from '../utils/crypto.js';

export class AuthService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async register(email, password) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error('Email already registered');
    }

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash
      }
    });

    return { id: user.id, email: user.email };
  }

  async loginWithPassword(email, password, deviceInfo, ipAddress) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    if (user.totpEnabled) {
      const pendingToken = generateSecureToken(32);
      return {
        requiresTOTP: true,
        pendingToken,
        userId: user.id
      };
    }

    return this.createSession(user.id, deviceInfo, ipAddress);
  }

  async verifyTOTP(userId, code, deviceInfo, ipAddress) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.totpSecret) {
      throw new Error('TOTP not configured');
    }

    const valid = authenticator.verify({ token: code, secret: user.totpSecret });

    if (!valid) {
      throw new Error('Invalid TOTP code');
    }

    return this.createSession(user.id, deviceInfo, ipAddress);
  }

  async setupTOTP(userId) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'AuthPlatform', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret }
    });

    return { secret, qrCode, otpauth };
  }

  async enableTOTP(userId, code) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.totpSecret) {
      throw new Error('TOTP not set up');
    }

    const valid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!valid) {
      throw new Error('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true }
    });

    return { enabled: true };
  }

  async disableTOTP(userId, code) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.totpEnabled) {
      throw new Error('TOTP not enabled');
    }

    const valid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!valid) {
      throw new Error('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null }
    });

    return { disabled: true };
  }

  async createSession(userId, deviceInfo, ipAddress) {
    const device = await this.getOrCreateDevice(userId, deviceInfo, ipAddress);
    const tokens = generateTokens(userId, device.id);

    await this.prisma.session.create({
      data: {
        userId,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        deviceId: device.id,
        ipAddress,
        userAgent: deviceInfo?.userAgent,
        expiresAt: tokens.refreshExpiry
      }
    });

    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeen: new Date() }
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiry,
      user: { id: userId },
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
          ipAddress
        }
      });
    }

    return device;
  }

  async refreshSession(refreshToken, ipAddress) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true }
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    const tokens = generateTokens(session.userId, session.deviceId);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.refreshExpiry
      }
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiry
    };
  }

  async logout(userId, sessionToken) {
    await this.prisma.session.updateMany({
      where: { userId, token: sessionToken },
      data: { isRevoked: true }
    });
  }

  async logoutAll(userId) {
    await this.prisma.session.updateMany({
      where: { userId },
      data: { isRevoked: true }
    });
  }

  async getUser(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        totpEnabled: true,
        createdAt: true,
        devices: {
          select: {
            id: true,
            userAgent: true,
            isTrusted: true,
            lastSeen: true
          }
        },
        passkeys: {
          select: {
            id: true,
            deviceType: true,
            createdAt: true,
            lastUsed: true
          }
        }
      }
    });

    return user;
  }

  async trustDevice(userId, deviceId) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId }
    });

    if (!device) throw new Error('Device not found');

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { isTrusted: true, trustScore: 100 }
    });

    return { trusted: true };
  }

  async revokeDevice(userId, deviceId) {
    await this.prisma.device.deleteMany({
      where: { id: deviceId, userId }
    });

    await this.prisma.session.updateMany({
      where: { deviceId, userId },
      data: { isRevoked: true }
    });

    return { revoked: true };
  }
}
