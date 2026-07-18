import { verifyAccessToken } from '../utils/jwt.js';

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
