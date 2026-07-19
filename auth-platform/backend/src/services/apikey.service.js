import { hashData, generateSecureToken } from '../utils/crypto.js';

export class ApiKeyService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async createApiKey(name, permissions = ['read'], userId = null, expiresInDays = null) {
    const rawKey = `ap_${generateSecureToken(32)}`;
    const keyHash = hashData(rawKey);
    const keyPrefix = rawKey.substring(0, 10);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        permissions: JSON.stringify(permissions),
        userId,
        expiresAt
      }
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      keyPrefix,
      permissions,
      expiresAt,
      createdAt: apiKey.createdAt,
      warning: 'Store this key securely. It will not be shown again.'
    };
  }

  async validateApiKey(rawKey) {
    if (!rawKey || !rawKey.startsWith('ap_')) {
      return { valid: false, reason: 'Invalid key format' };
    }

    const keyHash = hashData(rawKey);

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash }
    });

    if (!apiKey) {
      return { valid: false, reason: 'Key not found' };
    }

    if (!apiKey.isActive) {
      return { valid: false, reason: 'Key is deactivated' };
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return { valid: false, reason: 'Key has expired' };
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsed: new Date() }
    });

    return {
      valid: true,
      keyId: apiKey.id,
      name: apiKey.name,
      permissions: JSON.parse(apiKey.permissions),
      userId: apiKey.userId
    };
  }

  async listApiKeys(userId = null) {
    const where = userId ? { userId } : {};

    const keys = await this.prisma.apiKey.findMany({
      where,
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        isActive: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return keys.map(k => ({
      ...k,
      permissions: JSON.parse(k.permissions)
    }));
  }

  async revokeApiKey(keyId) {
    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false }
    });

    return { revoked: true };
  }

  async deleteApiKey(keyId) {
    await this.prisma.apiKey.delete({
      where: { id: keyId }
    });

    return { deleted: true };
  }
}
