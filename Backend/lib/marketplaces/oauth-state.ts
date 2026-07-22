import crypto from 'crypto';

export interface OAuthStateData {
  merchantId: string;
  marketplace: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  safeReturnUrl: string;
  shopDomain?: string;
  connectionId?: string;
}

// In-memory set for used nonces to prevent replay attacks
const usedNonces = new Map<string, number>();

function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, expiresAt] of usedNonces.entries()) {
    if (now > expiresAt) {
      usedNonces.delete(nonce);
    }
  }
}

// Run cleanup every 5 minutes and allow node process to exit if inactive
const interval = setInterval(cleanExpiredNonces, 5 * 60 * 1000);
if (interval && typeof interval.unref === 'function') {
  interval.unref();
}

/**
 * Generate a signed, expiring OAuth state string.
 */
export function generateState(data: Omit<OAuthStateData, 'nonce' | 'issuedAt' | 'expiresAt'>): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET environment variable is missing');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 10 * 60 * 1000; // 10 minutes from now

  const stateData: OAuthStateData = {
    ...data,
    nonce,
    issuedAt,
    expiresAt,
  };

  const payloadStr = JSON.stringify(stateData);
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

  // Format: base64url(payload).signature
  return `${Buffer.from(payloadStr).toString('base64url')}.${signature}`;
}

/**
 * Verify, parse, and check expiry and signature of OAuth state string.
 */
export function verifyState(stateStr: string): OAuthStateData {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET environment variable is missing');
  }

  if (!stateStr) {
    throw new Error('OAuth state is empty or missing');
  }

  const parts = stateStr.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid OAuth state format');
  }

  const [payloadB64, signature] = parts;
  let payloadStr: string;
  try {
    payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch (err) {
    throw new Error('Failed to decode state payload');
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  if (signature !== expectedSignature) {
    throw new Error('OAuth state signature mismatch or tampering detected');
  }

  let stateData: OAuthStateData;
  try {
    stateData = JSON.parse(payloadStr);
  } catch (err) {
    throw new Error('Failed to parse state JSON');
  }

  const now = Date.now();
  if (now > stateData.expiresAt) {
    throw new Error('OAuth state has expired');
  }

  // Prevent replay attacks
  if (usedNonces.has(stateData.nonce)) {
    throw new Error('OAuth state has already been processed (replay attack detected)');
  }
  usedNonces.set(stateData.nonce, stateData.expiresAt);

  // Validate return URL to prevent open redirection
  if (stateData.safeReturnUrl) {
    const isRelative = stateData.safeReturnUrl.startsWith('/') && !stateData.safeReturnUrl.startsWith('//');
    const isAbsoluteAllowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://retailverse.in',
      'https://www.retailverse.in'
    ].some(allowedOrigin => stateData.safeReturnUrl.startsWith(allowedOrigin));

    if (!isRelative && !isAbsoluteAllowed) {
      throw new Error('Unsafe return URL rejection');
    }
  }

  return stateData;
}
