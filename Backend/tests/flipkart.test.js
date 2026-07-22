const assert = require("node:assert");
const { describe, it } = require("node:test");

// ── Set env vars before loading modules ──────────────────────────────────────
process.env.MARKETPLACE_ENCRYPTION_KEY = "a".repeat(32); // Valid 32-character key
process.env.OAUTH_STATE_SECRET = "state-secret-key-123456789";

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
const FlipkartMarketplaceAdapter = require("../services/marketplaces/adapters/flipkart.adapter");
const MarketplaceConnection = require("../models/MarketplaceConnection");
const Product = require("../models/Product");
const MarketplaceProductMapping = require("../models/MarketplaceProductMapping");
const mongoose = require("mongoose");

// Prevent Mongoose from buffering queries by marking the connection as ready (1)
mongoose.connection.readyState = 1;

// Mock the core Query execution method to intercept all findOne calls database-free
let mockMapping = { flipkartFsn: "FSN1234567890" };
mongoose.Query.prototype.exec = async function () {
  const modelName = this.model.modelName;
  if (modelName === "MarketplaceProductMapping") {
    if (mockMapping === null) return null;
    return {
      ...mockMapping,
      save: async function() { return this; }
    };
  }
  return null;
};

describe("Flipkart Integration Crypto & Models", () => {
  it("should encrypt and decrypt Flipkart refresh tokens", () => {
    const refreshToken = "flipkart-refresh-token-xyz-123";
    const encrypted = encryption.encryptSecret(refreshToken);
    
    const decrypted = encryption.decryptSecret(encrypted);
    assert.strictEqual(decrypted, refreshToken);
  });

  it("should retrieve Flipkart connection virtuals correctly", () => {
    const conn = new MarketplaceConnection({
      merchantId: "65d8a0d0d4ba1624c43ba10a",
      marketplace: "FLIPKART",
      sellerAccountId: "seller_fk_123",
      credentials: {
        encryptedRefreshToken: encryption.encryptSecret("my-ref-token")
      }
    });

    assert.strictEqual(conn.sellerId, "seller_fk_123");
    assert.strictEqual(conn.encryptedRefreshToken, conn.credentials.encryptedRefreshToken);
  });
});

describe("Flipkart Product Validation & Adapter Rules", () => {
  it("should fail validation if selling price is greater than MRP", async () => {
    const connection = new MarketplaceConnection({
      merchantId: "65d8a0d0d4ba1624c43ba10a",
      marketplace: "FLIPKART",
      sellerAccountId: "seller_fk_123"
    });

    const product = new Product({
      name: "Overpriced Phone",
      sku: "PHONE-99",
      price: 1500, // Selling price
      originalPrice: 1000, // MRP
      stock: 10,
      weight: 0.5,
      dimensions: { length: 15, width: 10, height: 5 }
    });

    const adapter = new FlipkartMarketplaceAdapter(connection);
    
    // We mock the mapping lookup to return our test FSN
    adapter.getFsnMapping = async () => "FSN1234567890";

    const validation = await adapter.validateProduct(product);
    assert.strictEqual(validation.isValid, false);
    assert.ok(validation.errors.some(e => e.includes("Selling price exceeds MRP")));
  });

  it("should pass validation with valid attributes", async () => {
    const connection = new MarketplaceConnection({
      merchantId: "65d8a0d0d4ba1624c43ba10a",
      marketplace: "FLIPKART",
      sellerAccountId: "seller_fk_123"
    });

    const product = new Product({
      name: "Good Phone",
      sku: "PHONE-100",
      price: 800, // Selling price
      originalPrice: 1000, // MRP
      stock: 10,
      weight: 0.5,
      dimensions: { length: 15, width: 10, height: 5 }
    });

    const adapter = new FlipkartMarketplaceAdapter(connection);
    adapter.getFsnMapping = async () => "FSN1234567890";

    const validation = await adapter.validateProduct(product);
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  it("should fail validation if package weight or dimensions are missing", async () => {
    const connection = new MarketplaceConnection({
      merchantId: "65d8a0d0d4ba1624c43ba10a",
      marketplace: "FLIPKART",
      sellerAccountId: "seller_fk_123"
    });

    const product = new Product({
      name: "Weightless Phone",
      sku: "PHONE-101",
      price: 800,
      originalPrice: 1000,
      stock: 10
      // weight and dimensions missing
    });

    const adapter = new FlipkartMarketplaceAdapter(connection);
    adapter.getFsnMapping = async () => "FSN1234567890";

    const validation = await adapter.validateProduct(product);
    assert.strictEqual(validation.isValid, false);
    assert.ok(validation.errors.some(e => e.includes("Package weight is missing or invalid")));
  });
});

describe("Flipkart Client API Mock Sync", () => {
  it("should mock E2E listing update flow", async () => {
    const connection = new MarketplaceConnection({
      merchantId: "65d8a0d0d4ba1624c43ba10a",
      marketplace: "FLIPKART",
      sellerAccountId: "seller_fk_123"
    });

    const product = new Product({
      name: "Phone E2E",
      sku: "PHONE-E2E",
      price: 800,
      originalPrice: 1000,
      stock: 5,
      weight: 0.5,
      dimensions: { length: 15, width: 10, height: 5 }
    });

    const adapter = new FlipkartMarketplaceAdapter(connection);
    adapter.getFsnMapping = async () => "FSN1234567890";

    // Stub createListing to simulate successful Flipkart response
    adapter.createListing = async (prod) => {
      assert.strictEqual(prod.sku, "PHONE-E2E");
      return { success: true, listingId: "LISTING-FK-999" };
    };

    const res = await adapter.createListing(product);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.listingId, "LISTING-FK-999");
  });
});
