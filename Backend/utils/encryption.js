const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const SECRET_KEY = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "fallback_default_encryption_key_32_bytes")
  .digest();

/**
 * Encrypts cleartext using aes-256-cbc.
 * Returns a colon-separated string: "iv:encryptedText"
 * @param {string} text
 * @returns {string}
 */
function encrypt(text) {
  if (!text) return "";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts a colon-separated "iv:encryptedText" string using aes-256-cbc.
 * Returns the cleartext, or empty string on failure.
 * @param {string} text
 * @returns {string}
 */
function decrypt(text) {
  if (!text) return "";
  try {
    const parts = text.split(":");
    if (parts.length !== 2) return "";
    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return "";
  }
}

/**
 * Encrypts a string using AES-256-GCM for marketplace credentials.
 * @param {string} text - The text to encrypt
 * @returns {Object|null} - Encrypted string, IV, and authTag (all hex), or null if text is empty
 */
function encryptMarketplaceCredential(text) {
  if (!text) return null;

  const ENCRYPTION_KEY = process.env.MARKETPLACE_ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY, 'utf-8').length !== 32) {
    throw new Error('MARKETPLACE_ENCRYPTION_KEY is missing or must be exactly 32 bytes.');
  }

  // Generate random initialization vector
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'utf-8'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return {
    encryptedText: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag
  };
}

/**
 * Decrypts a string encrypted with AES-256-GCM for marketplace credentials.
 * @param {string} encryptedText - The encrypted text
 * @param {string} ivHex - The initialization vector in hex
 * @param {string} authTagHex - The authentication tag in hex
 * @returns {string|null} - Decrypted text or null if inputs are missing
 */
function decryptMarketplaceCredential(encryptedText, ivHex, authTagHex) {
  if (!encryptedText || !ivHex || !authTagHex) return null;

  const ENCRYPTION_KEY = process.env.MARKETPLACE_ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY, 'utf-8').length !== 32) {
    throw new Error('MARKETPLACE_ENCRYPTION_KEY is missing or must be exactly 32 bytes.');
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY, 'utf-8'),
      Buffer.from(ivHex, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error("Marketplace credential decryption failed:", err.message);
    return null;
  }
}

module.exports = { encrypt, decrypt, encryptMarketplaceCredential, decryptMarketplaceCredential };
