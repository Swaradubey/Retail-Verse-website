import crypto from 'crypto';

// Ensure server-only check
if (typeof globalThis !== 'undefined' && 'window' in globalThis && (globalThis as any).window !== undefined) {
  throw new Error('This module can only be imported in server-only environments.');
}

function getEncryptionKey(): Buffer {
  const rawKey = process.env.MARKETPLACE_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('MARKETPLACE_ENCRYPTION_KEY is not configured');
  }
  
  // Accept 64 hex characters or 32 plain characters
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  } else if (rawKey.length === 32) {
    return Buffer.from(rawKey, 'utf8');
  } else {
    throw new Error('MARKETPLACE_ENCRYPTION_KEY must be a 32-character string or a 64-character hex string');
  }
}

/**
 * Encrypt a secret value using AES-256-GCM.
 * Returns format: ivHex:tagHex:ciphertextHex
 */
export function encryptSecret(text: string): string {
  if (!text) return '';
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
  } catch (error: any) {
    if (error.message.includes('MARKETPLACE_ENCRYPTION_KEY')) {
      throw error;
    }
    console.error('Encryption error:', error.message);
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypt a secret value using AES-256-GCM.
 */
export function decryptSecret(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error: any) {
    if (error.message.includes('MARKETPLACE_ENCRYPTION_KEY')) {
      throw error;
    }
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt token');
  }
}
