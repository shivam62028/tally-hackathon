import crypto from 'crypto';

export function generateKeyPair() {
  return crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

export function signData(data, privateKey) {
  const sign = crypto.createSign('ed25519');
  sign.update(typeof data === 'string' ? data : JSON.stringify(data));
  return sign.sign(privateKey, 'base64');
}

export function verifySignature(data, signature, publicKey) {
  try {
    const verify = crypto.createVerify('ed25519');
    verify.update(typeof data === 'string' ? data : JSON.stringify(data));
    return verify.verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

export function hashData(data) {
  return crypto.createHash('sha256')
    .update(typeof data === 'string' ? data : JSON.stringify(data))
    .digest('hex');
}

export function generateChainedHash(data, prevHash = null) {
  const payload = prevHash ? `${prevHash}:${JSON.stringify(data)}` : JSON.stringify(data);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

export function generateNumericCode(length = 6) {
  const digits = '0123456789';
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += digits[bytes[i] % 10];
  }
  return code;
}
