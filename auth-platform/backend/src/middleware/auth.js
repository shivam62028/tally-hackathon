import { verifyAccessToken } from '../utils/jwt.js';
import { ApiKeyService } from '../services/apikey.service.js';
import { AdminAuthService } from '../services/adminAuth.service.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyAccessToken(token);
    req.userId = decoded.sub;
    req.deviceId = decoded.deviceId;
    req.tokenClaims = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = verifyAccessToken(token);
      req.userId = decoded.sub;
      req.deviceId = decoded.deviceId;
      req.tokenClaims = decoded;
    } catch {
      // Token invalid but auth is optional
    }
  }
  next();
}

export async function requireTrustedDevice(req, res, next) {
  if (!req.deviceId) {
    return res.status(403).json({ error: 'Trusted device required' });
  }

  const device = await req.prisma.device.findUnique({
    where: { id: req.deviceId }
  });

  if (!device || !device.isTrusted) {
    return res.status(403).json({
      error: 'This action requires a trusted device',
      code: 'UNTRUSTED_DEVICE'
    });
  }

  req.device = device;
  next();
}

export async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required. Provide X-API-Key header.' });
  }

  const apiKeyService = new ApiKeyService(req.prisma);
  const result = await apiKeyService.validateApiKey(apiKey);

  if (!result.valid) {
    return res.status(401).json({ error: `Invalid API key: ${result.reason}` });
  }

  req.apiKeyId = result.keyId;
  req.apiKeyName = result.name;
  req.apiKeyPermissions = result.permissions;
  req.userId = result.userId;
  req.authMethod = 'api_key';
  next();
}

export function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (req.authMethod !== 'api_key') {
      return next();
    }

    const hasPermission = requiredPermissions.some(p =>
      req.apiKeyPermissions.includes(p) || req.apiKeyPermissions.includes('admin')
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredPermissions,
        available: req.apiKeyPermissions
      });
    }

    next();
  };
}

export async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  const token = authHeader.substring(7);

  try {
    const adminAuthService = new AdminAuthService(req.prisma);
    const decoded = await adminAuthService.verifyToken(token);
    req.adminId = decoded.sub;
    req.adminEmail = decoded.email;
    req.adminPermissions = decoded.permissions;
    req.isAdmin = true;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}
