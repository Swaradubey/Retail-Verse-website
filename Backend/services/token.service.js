const encryption = require('../lib/marketplaces/encryption');

/**
 * Legacy TokenService wrapper that forwards to the new AES-256-GCM encryption engine.
 * Ensures backward compatibility with existing background workers and controllers.
 */
class TokenService {
  encrypt(text) {
    if (!text) return null;
    return encryption.encryptSecret(text);
  }

  decrypt(text) {
    if (!text) return null;
    return encryption.decryptSecret(text);
  }
}

module.exports = new TokenService();
