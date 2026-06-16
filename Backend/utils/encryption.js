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

module.exports = { encrypt, decrypt };
