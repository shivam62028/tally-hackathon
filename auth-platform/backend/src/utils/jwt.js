import jwt from 'jsonwebtoken';
import { generateSecureToken } from './crypto.js';

const NODE_ENV = process.env.NODE_ENV || 'development';

if (!process.env.JWT_SECRET && NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || 'hackathon-dev-secret-not-for-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export function generateTokens(userId, deviceId = null, additionalClaims = {}) {
  const accessToken = jwt.sign(
    {
      sub: userId,
      deviceId,
      type: 'access',
      ...additionalClaims
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = generateSecureToken(48);
  const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    accessToken,
    refreshToken,
    refreshExpiry,
    accessExpiry: new Date(Date.now() + 15 * 60 * 1000)
  };
}

export function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
}

export function decodeToken(token) {
  return jwt.decode(token);
}

export function generateStepUpToken(userId, action, expiryMinutes = 5) {
  return jwt.sign(
    {
      sub: userId,
      action,
      type: 'stepup',
      iat: Date.now()
    },
    JWT_SECRET,
    { expiresIn: `${expiryMinutes}m` }
  );
}

export function verifyStepUpToken(token, expectedAction) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'stepup' || decoded.action !== expectedAction) {
      throw new Error('Invalid step-up token');
    }
    return decoded;
  } catch {
    throw new Error('Invalid or expired step-up token');
  }
}
