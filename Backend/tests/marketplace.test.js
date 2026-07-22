/**
 * Marketplace Integration Tests
 *
 * Tests for:
 * - AES-256-GCM encryption & decryption
 * - Invalid encryption key length detection
 * - Signed expiring OAuth state (tampering, expiry, open redirect, replay check)
 * - Shopify domain normalization & validation
 * - Connection model virtuals & legacy mappings
 *
 * Run: node --test Backend/tests/marketplace.test.js
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");

// ── Set env vars before loading modules ──────────────────────────────────────
process.env.MARKETPLACE_ENCRYPTION_KEY = "a".repeat(32); // Valid 32-character key
process.env.OAUTH_STATE_SECRET = "state-secret-key-123456789";

// Mock dns.lookup to isolate tests from actual network status
const dns = require("dns");
const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (hostname === "example.com") {
    return callback(null, { address: "93.184.216.34", family: 4 });
  }
  return originalLookup(hostname, options, callback);
};

// Load ts-node manually to compile TypeScript modules during testing
try {
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: "commonjs",
      target: "es2020",
      esModuleInterop: true
    }
  });
} catch (err) {}

const encryption = require("../lib/marketplaces/encryption");
const oauthState = require("../lib/marketplaces/oauth-state");
const shopifyConnectorModule = require("../lib/marketplaces/shopify/index");

describe("AES-256-GCM Secret Encryption Module", () => {
  it("should encrypt and decrypt a secret successfully", () => {
    const secret = "super-secret-oauth-token-123";
    const encrypted = encryption.encryptSecret(secret);
    
    // Check format: iv:tag:ciphertext
    assert.strictEqual(encrypted.split(":").length, 3);
    
    const decrypted = encryption.decryptSecret(encrypted);
    assert.strictEqual(decrypted, secret);
  });

  it("should fail to decrypt if auth tag is tampered with", () => {
    const secret = "test-token";
    const encrypted = encryption.encryptSecret(secret);
    const parts = encrypted.split(":");
    
    // Modify one byte in the auth tag (part 2)
    const tamperedTag = parts[1].replace(/^[0-9a-f]/, "0");
    const tamperedEncrypted = `${parts[0]}:${tamperedTag}:${parts[2]}`;
    
    assert.throws(() => {
      encryption.decryptSecret(tamperedEncrypted);
    }, /Unsupported state or unable to authenticate data|Failed to decrypt token/);
  });

  it("should throw error if key length is invalid", () => {
    const originalKey = process.env.MARKETPLACE_ENCRYPTION_KEY;
    
    // Set an invalid key (10 characters instead of 32)
    process.env.MARKETPLACE_ENCRYPTION_KEY = "short_key";
    
    assert.throws(() => {
      encryption.encryptSecret("data");
    }, /MARKETPLACE_ENCRYPTION_KEY must be a 32-character string/);
    
    process.env.MARKETPLACE_ENCRYPTION_KEY = originalKey;
  });
});

describe("OAuth Expiring Signed State Module", () => {
  it("should generate and verify a valid state", () => {
    const stateStr = oauthState.generateState({
      merchantId: "merchant123",
      marketplace: "shopify",
      safeReturnUrl: "/dashboard"
    });

    const verified = oauthState.verifyState(stateStr);
    assert.strictEqual(verified.merchantId, "merchant123");
    assert.strictEqual(verified.marketplace, "shopify");
    assert.strictEqual(verified.safeReturnUrl, "/dashboard");
  });

  it("should reject tampered state signatures", () => {
    const stateStr = oauthState.generateState({
      merchantId: "merchant123",
      marketplace: "shopify",
      safeReturnUrl: "/dashboard"
    });

    const parts = stateStr.split(".");
    // Modify the signature portion
    const tampered = `${parts[0]}.tamperedsignature`;

    assert.throws(() => {
      oauthState.verifyState(tampered);
    }, /signature mismatch/);
  });

  it("should reject expired states", () => {
    const secret = process.env.OAUTH_STATE_SECRET;
    const crypto = require("crypto");
    
    // Construct an expired state payload manually
    const expiredPayload = {
      merchantId: "merchant123",
      marketplace: "shopify",
      nonce: "nonce123",
      issuedAt: Date.now() - 20 * 60 * 1000,
      expiresAt: Date.now() - 10 * 60 * 1000,
      safeReturnUrl: "/dashboard"
    };

    const payloadStr = JSON.stringify(expiredPayload);
    const signature = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
    const stateStr = `${Buffer.from(payloadStr).toString("base64url")}.${signature}`;

    assert.throws(() => {
      oauthState.verifyState(stateStr);
    }, /state has expired/);
  });

  it("should reject unsafe return URLs", () => {
    const stateStr = oauthState.generateState({
      merchantId: "merchant123",
      marketplace: "shopify",
      safeReturnUrl: "https://evil-attacker.com/dashboard"
    });

    assert.throws(() => {
      oauthState.verifyState(stateStr);
    }, /Unsafe return URL/);
  });

  it("should prevent state replay attack on verification", () => {
    const stateStr = oauthState.generateState({
      merchantId: "merchant123",
      marketplace: "shopify",
      safeReturnUrl: "/dashboard"
    });

    // First verification should pass
    const verified = oauthState.verifyState(stateStr);
    assert.ok(verified);

    // Second verification must fail as the nonce has been marked as used
    assert.throws(() => {
      oauthState.verifyState(stateStr);
    }, /replay attack detected/);
  });
});

describe("Shopify Domain Normalization", () => {
  it("should normalize plain store name to myshopify.com domain", () => {
    const shop = "awesome-gadgets";
    const normalized = shopifyConnectorModule.normalizeShopifyDomain(shop);
    assert.strictEqual(normalized, "awesome-gadgets.myshopify.com");
  });

  it("should normalize url with protocols and trailing paths", () => {
    const shop = "https://my-store.myshopify.com/admin/settings";
    const normalized = shopifyConnectorModule.normalizeShopifyDomain(shop);
    assert.strictEqual(normalized, "my-store.myshopify.com");
  });

  it("should reject invalid/custom store domains", () => {
    const shop = "awesome-gadgets.com";
    assert.throws(() => {
      shopifyConnectorModule.normalizeShopifyDomain(shop);
    }, /Invalid Shopify domain/);
  });
});


describe("Mongoose Connection Model Virtuals", () => {
  it("should map fields correctly to legacy virtual properties", () => {
    const MarketplaceConnection = require("../models/MarketplaceConnection");
    const conn = new MarketplaceConnection({
      merchantId: "65d8a0d0d4ba1624c43ba10a",
      marketplace: "shopify",
      connectionType: "oauth",
      account: {
        sellerId: "shop_id_123",
        storeName: "Custom Shopify Store",
        shopDomain: "custom.myshopify.com"
      },
      health: {
        status: "healthy",
        lastCheckedAt: new Date(),
        lastError: ""
      },
      credentials: {
        encryptedAccessToken: "iv:tag:ciphertext"
      }
    });

    // Test legacy virtual getters
    assert.strictEqual(conn.sellerId, "shop_id_123");
    assert.strictEqual(conn.sellerAccountName, "Custom Shopify Store");
    assert.strictEqual(conn.apiHealth.status, "healthy");
    assert.strictEqual(conn.encryptedAccessToken, "iv:tag:ciphertext");

    // Test virtual setters
    conn.sellerId = "new_id";
    assert.strictEqual(conn.account.sellerId, "new_id");
  });
});

describe("Marketplace Connection Controller - getConnection Security & Validation Checks", () => {
  const MarketplaceConnection = require("../models/MarketplaceConnection");
  const MarketplaceProduct = require("../models/MarketplaceProduct");
  const Product = require("../models/Product");
  const Order = require("../models/Order");
  const MarketplaceSyncJob = require("../models/MarketplaceSyncJob");
  const MarketplaceSyncLog = require("../models/MarketplaceSyncLog");
  const marketplaceController = require("../controllers/marketplace.controller");

  let originalFindOne;
  let originalFindById;
  let originalCountDocuments;
  let originalProductCount;
  let originalOrderCount;
  let originalSyncJobFind;
  let originalSyncLogFind;
  let originalProductFindOne;

  before(() => {
    originalFindOne = MarketplaceConnection.findOne;
    originalFindById = MarketplaceConnection.findById;
    originalCountDocuments = MarketplaceProduct.countDocuments;
    originalProductCount = Product.countDocuments;
    originalOrderCount = Order.countDocuments;
    originalSyncJobFind = MarketplaceSyncJob.find;
    originalSyncLogFind = MarketplaceSyncLog.find;
    originalProductFindOne = MarketplaceProduct.findOne;
  });

  after(() => {
    MarketplaceConnection.findOne = originalFindOne;
    MarketplaceConnection.findById = originalFindById;
    MarketplaceProduct.countDocuments = originalCountDocuments;
    Product.countDocuments = originalProductCount;
    Order.countDocuments = originalOrderCount;
    MarketplaceSyncJob.find = originalSyncJobFind;
    MarketplaceSyncLog.find = originalSyncLogFind;
    MarketplaceProduct.findOne = originalProductFindOne;
  });

  it("should return 400 if connectionId is invalid/malformed", async () => {
    const req = {
      params: { connectionId: "invalid-id-format" },
      user: { id: "merchant123" }
    };
    let statusCalled = null;
    let jsonPayload = null;
    const res = {
      status(s) {
        statusCalled = s;
        return this;
      },
      json(data) {
        jsonPayload = data;
        return this;
      }
    };

    await marketplaceController.getConnection(req, res);

    assert.strictEqual(statusCalled, 400);
    assert.strictEqual(jsonPayload.success, false);
    assert.strictEqual(jsonPayload.code, "INVALID_CONNECTION_ID");
  });

  it("should return 404 if connection does not exist", async () => {
    const validId = "6a5daaed5c18a15ac3af5b92";
    MarketplaceConnection.findOne = () => Promise.resolve(null);
    MarketplaceConnection.findById = () => Promise.resolve(null);

    const req = {
      params: { connectionId: validId },
      user: { id: "merchant123" }
    };
    let statusCalled = null;
    let jsonPayload = null;
    const res = {
      status(s) {
        statusCalled = s;
        return this;
      },
      json(data) {
        jsonPayload = data;
        return this;
      }
    };

    await marketplaceController.getConnection(req, res);

    assert.strictEqual(statusCalled, 404);
    assert.strictEqual(jsonPayload.success, false);
    assert.strictEqual(jsonPayload.code, "MARKETPLACE_CONNECTION_NOT_FOUND");
  });

  it("should return 403 Forbidden if connection belongs to a different merchant", async () => {
    const validId = "6a5daaed5c18a15ac3af5b92";
    // findOne (with candidates) returns null
    MarketplaceConnection.findOne = () => Promise.resolve(null);
    // findById (bypass) finds it (meaning it exists but owned by someone else)
    MarketplaceConnection.findById = () => Promise.resolve({
      _id: validId,
      merchantId: "otherMerchantId",
      marketplace: "shopify"
    });

    const req = {
      params: { connectionId: validId },
      user: { id: "merchant123" }
    };
    let statusCalled = null;
    let jsonPayload = null;
    const res = {
      status(s) {
        statusCalled = s;
        return this;
      },
      json(data) {
        jsonPayload = data;
        return this;
      }
    };

    await marketplaceController.getConnection(req, res);

    assert.strictEqual(statusCalled, 403);
    assert.strictEqual(jsonPayload.success, false);
    assert.strictEqual(jsonPayload.code, "FORBIDDEN");
  });

  it("should return 200 and return connection stats safely if owner verified", async () => {
    const validId = "6a5daaed5c18a15ac3af5b92";
    const mockConnection = new MarketplaceConnection({
      _id: validId,
      merchantId: "merchant123",
      marketplace: "shopify",
      status: "connected",
      credentials: { encryptedAccessToken: "secret" }
    });

    MarketplaceConnection.findOne = () => Promise.resolve(mockConnection);
    MarketplaceProduct.countDocuments = () => Promise.resolve(10);
    Product.countDocuments = () => Promise.resolve(100);
    Order.countDocuments = () => Promise.resolve(5);
    MarketplaceSyncJob.find = () => Promise.resolve([]);
    MarketplaceSyncLog.find = () => ({
      sort: () => ({
        limit: () => ({
          lean: () => Promise.resolve([])
        })
      })
    });
    MarketplaceProduct.findOne = () => ({
      sort: () => ({
        lean: () => Promise.resolve(null)
      })
    });

    const req = {
      params: { connectionId: validId },
      user: { id: "merchant123" }
    };
    let statusCalled = null;
    let jsonPayload = null;
    const res = {
      status(s) {
        statusCalled = s;
        return this;
      },
      json(data) {
        jsonPayload = data;
        return this;
      }
    };

    await marketplaceController.getConnection(req, res);

    assert.strictEqual(statusCalled, 200);
    assert.strictEqual(jsonPayload.success, true);
    assert.ok(jsonPayload.data.connection);
    // Secrets should be excluded
    assert.strictEqual(jsonPayload.data.connection.credentials, undefined);
    assert.strictEqual(jsonPayload.data.connection.accessToken, undefined);
    assert.strictEqual(jsonPayload.data.connection.encryptedAccessToken, undefined);
    assert.strictEqual(jsonPayload.data.connection.encryptedRefreshToken, undefined);
  });
});

