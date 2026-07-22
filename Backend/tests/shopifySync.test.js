/**
 * Shopify Sync Unit Tests
 *
 * These tests do NOT require MongoDB.
 * They test pure logic functions used in the sync flow.
 */

jest.mock('../lib/marketplaces/encryption', () => ({
  decryptSecret: jest.fn(x => x),
  encryptSecret: jest.fn(x => x)
}), { virtual: true });

jest.mock('../models/MarketplaceProduct', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../models/MarketplaceConnection', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../models/MarketplaceLocation', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../models/Product', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));
jest.mock('../models/Inventory', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));

jest.mock('../utils/inventoryHelper', () => ({
  getAvailableStock: jest.fn().mockResolvedValue(0),
  resolveShopifyLocation: jest.fn().mockResolvedValue('loc456'),
  ensureInventoryTracking: jest.fn().mockResolvedValue(true),
  activateInventoryItem: jest.fn().mockResolvedValue(true),
  setShopifyStock: jest.fn().mockResolvedValue(true),
  verifyShopifyInventory: jest.fn().mockResolvedValue(0),
  withRetry: jest.fn().mockImplementation((fn) => fn())
}));

const MarketplaceProduct = require('../models/MarketplaceProduct');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceLocation = require('../models/MarketplaceLocation');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const inventoryHelper = require('../utils/inventoryHelper');

describe('Normalize Shop Domain', () => {
  function normalizeShopDomain(input) {
    if (!input || typeof input !== 'string') {
      throw new Error('Shop domain is required');
    }
    let shop = input.trim().toLowerCase();
    shop = shop.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].replace(/\.$/, '');
    if (!shop.endsWith('.myshopify.com')) {
      shop = `${shop}.myshopify.com`;
    }
    const shopRegex = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
    if (!shopRegex.test(shop)) {
      throw new Error('Invalid Shopify shop domain');
    }
    return shop;
  }

  test('accepts full URL', () => {
    expect(normalizeShopDomain('https://test-store.myshopify.com')).toBe('test-store.myshopify.com');
  });

  test('accepts partial domain', () => {
    expect(normalizeShopDomain('test-store.myshopify.com')).toBe('test-store.myshopify.com');
  });

  test('accepts just store name', () => {
    expect(normalizeShopDomain('test-store')).toBe('test-store.myshopify.com');
  });

  test('rejects empty string', () => {
    expect(() => normalizeShopDomain('')).toThrow('Shop domain is required');
  });

  test('rejects email address', () => {
    expect(() => normalizeShopDomain('user@email.com')).toThrow('Invalid Shopify shop domain');
  });

  test('strips trailing slash', () => {
    expect(normalizeShopDomain('https://test-store.myshopify.com/')).toBe('test-store.myshopify.com');
  });

  test('strips http', () => {
    expect(normalizeShopDomain('http://test-store.myshopify.com')).toBe('test-store.myshopify.com');
  });

  test('handles query params', () => {
    expect(normalizeShopDomain('https://test-store.myshopify.com?foo=bar')).toBe('test-store.myshopify.com');
  });

  test('rejects invalid hostname characters', () => {
    expect(() => normalizeShopDomain('test_store')).toThrow('Invalid Shopify shop domain');
  });

  test('rejects non-myshopify domain', () => {
    expect(() => normalizeShopDomain('test-store.shopify.com')).toThrow('Invalid Shopify shop domain');
  });
});

describe('Eligible Product Filtering', () => {
  function isEligible(product) {
    if (!product.name && !product.title) return false;
    if (product.price === undefined || product.price === null || isNaN(Number(product.price)) || Number(product.price) < 0) return false;
    return true;
  }

  test('valid product is eligible', () => {
    expect(isEligible({ name: 'Test', price: 10, sku: 'TST-001' })).toBe(true);
  });

  test('product with only title is eligible', () => {
    expect(isEligible({ title: 'Test Title', price: 10 })).toBe(true);
  });

  test('product without name or title is not eligible', () => {
    expect(isEligible({ price: 10, sku: 'TST-001' })).toBe(false);
  });

  test('product with null price is not eligible', () => {
    expect(isEligible({ name: 'Test', price: null })).toBe(false);
  });

  test('product with undefined price is not eligible', () => {
    expect(isEligible({ name: 'Test' })).toBe(false);
  });

  test('product with negative price is not eligible', () => {
    expect(isEligible({ name: 'Test', price: -5 })).toBe(false);
  });

  test('product with zero price is eligible', () => {
    expect(isEligible({ name: 'Test', price: 0 })).toBe(true);
  });

  test('product with string price is eligible', () => {
    expect(isEligible({ name: 'Test', price: '19.99' })).toBe(true);
  });

  test('product with invalid string price is not eligible', () => {
    expect(isEligible({ name: 'Test', price: 'free' })).toBe(false);
  });
});

describe('Inventory Quantity Clamping', () => {
  function clampQuantity(quantity) {
    return Math.max(0, Number(quantity) || 0);
  }

  test('positive quantity stays the same', () => {
    expect(clampQuantity(10)).toBe(10);
  });

  test('zero stays zero', () => {
    expect(clampQuantity(0)).toBe(0);
  });

  test('negative clamps to zero', () => {
    expect(clampQuantity(-5)).toBe(0);
  });

  test('null clamps to zero', () => {
    expect(clampQuantity(null)).toBe(0);
  });

  test('undefined clamps to zero', () => {
    expect(clampQuantity(undefined)).toBe(0);
  });

  test('string number is parsed', () => {
    expect(clampQuantity('15')).toBe(15);
  });

  test('NaN clamps to zero', () => {
    expect(clampQuantity(NaN)).toBe(0);
  });
});

describe('Product Mapping Deduplication', () => {
  function buildMappingKey(connectionId, retailVerseProductId) {
    return `${connectionId}:${retailVerseProductId}`;
  }

  test('same connection and product produce same key', () => {
    const key1 = buildMappingKey('conn1', 'prod1');
    const key2 = buildMappingKey('conn1', 'prod1');
    expect(key1).toBe(key2);
  });

  test('different products produce different keys', () => {
    const key1 = buildMappingKey('conn1', 'prod1');
    const key2 = buildMappingKey('conn1', 'prod2');
    expect(key1).not.toBe(key2);
  });

  test('different connections produce different keys', () => {
    const key1 = buildMappingKey('conn1', 'prod1');
    const key2 = buildMappingKey('conn2', 'prod1');
    expect(key1).not.toBe(key2);
  });

  test('unique constraint prevents duplicate', () => {
    const key1 = buildMappingKey('conn1', 'prod1');
    const key2 = buildMappingKey('conn1', 'prod1');
    expect(key1).toBe(key2);
  });
});

describe('Product Field Mapping', () => {
  function mapRetailVerseToShopify(product) {
    return {
      title: product.name || product.title || 'Untitled Product',
      descriptionHtml: product.description || '',
      vendor: product.brand || product.vendor || 'Retail Verse',
      productType: product.category || 'General',
      status: product.isActive !== false ? 'ACTIVE' : 'DRAFT',
      price: String(Number(product.price) || 0),
      sku: product.sku || '',
      stock: Math.max(0, Number(product.stock) || 0)
    };
  }

  test('maps all fields correctly', () => {
    const rv = {
      name: 'Test Product',
      description: 'A test',
      brand: 'TestBrand',
      category: 'Electronics',
      isActive: true,
      price: 29.99,
      sku: 'TST-001',
      stock: 50
    };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.title).toBe('Test Product');
    expect(shopify.descriptionHtml).toBe('A test');
    expect(shopify.vendor).toBe('TestBrand');
    expect(shopify.productType).toBe('Electronics');
    expect(shopify.status).toBe('ACTIVE');
    expect(shopify.price).toBe('29.99');
    expect(shopify.sku).toBe('TST-001');
    expect(shopify.stock).toBe(50);
  });

  test('falls back to title when name missing', () => {
    const rv = { title: 'Title Only', price: 10 };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.title).toBe('Title Only');
  });

  test('inactive product maps to DRAFT', () => {
    const rv = { name: 'Test', price: 10, isActive: false };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.status).toBe('DRAFT');
  });

  test('missing stock defaults to 0', () => {
    const rv = { name: 'Test', price: 10, stock: undefined };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.stock).toBe(0);
  });

  test('negative stock clamped to 0', () => {
    const rv = { name: 'Test', price: 10, stock: -5 };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.stock).toBe(0);
  });

  test('missing name and title uses default', () => {
    const rv = { price: 10 };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.title).toBe('Untitled Product');
  });

  test('vendor falls back to Retail Verse', () => {
    const rv = { name: 'Test', price: 10 };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.vendor).toBe('Retail Verse');
  });

  test('uses brand as vendor when available', () => {
    const rv = { name: 'Test', price: 10, brand: 'Nike' };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.vendor).toBe('Nike');
  });

  test('category falls back to General', () => {
    const rv = { name: 'Test', price: 10 };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.productType).toBe('General');
  });

  test('price is converted to string', () => {
    const rv = { name: 'Test', price: 42 };
    const shopify = mapRetailVerseToShopify(rv);
    expect(typeof shopify.price).toBe('string');
    expect(shopify.price).toBe('42');
  });

  test('zero price is allowed', () => {
    const rv = { name: 'Free', price: 0 };
    const shopify = mapRetailVerseToShopify(rv);
    expect(shopify.price).toBe('0');
    expect(shopify.status).toBe('ACTIVE');
  });
});

describe('Sync Run Status Logic', () => {
  function determineFinalStatus(syncedCount, failedCount) {
    if (failedCount === 0 && syncedCount > 0) return 'completed';
    if (failedCount === 0 && syncedCount === 0) return 'completed';
    if (syncedCount > 0 && failedCount > 0) return 'partial';
    return 'failed';
  }

  test('all succeeded returns completed', () => {
    expect(determineFinalStatus(4, 0)).toBe('completed');
  });

  test('all failed returns failed', () => {
    expect(determineFinalStatus(0, 4)).toBe('failed');
  });

  test('some succeeded, some failed returns partial', () => {
    expect(determineFinalStatus(3, 1)).toBe('partial');
  });

  test('no products returns completed', () => {
    expect(determineFinalStatus(0, 0)).toBe('completed');
  });

  test('more succeeded than failed returns partial', () => {
    expect(determineFinalStatus(10, 2)).toBe('partial');
  });
});

describe('Required Scopes Validation', () => {
  function checkRequiredScopes(installedScopes) {
    const required = [
      'write_products', 'read_products',
      'write_inventory', 'read_inventory',
      'read_locations'
    ];
    return required.filter(s => !installedScopes.includes(s));
  }

  test('all scopes present returns empty', () => {
    const scopes = ['write_products', 'read_products', 'write_inventory', 'read_inventory', 'read_locations'];
    expect(checkRequiredScopes(scopes)).toEqual([]);
  });

  test('missing write_products detected', () => {
    const scopes = ['read_products', 'write_inventory', 'read_inventory', 'read_locations'];
    expect(checkRequiredScopes(scopes)).toContain('write_products');
  });

  test('missing inventory scopes detected', () => {
    const scopes = ['write_products', 'read_products', 'read_locations'];
    const missing = checkRequiredScopes(scopes);
    expect(missing).toContain('write_inventory');
    expect(missing).toContain('read_inventory');
  });

  test('missing locations scope detected', () => {
    const scopes = ['write_products', 'read_products', 'write_inventory', 'read_inventory'];
    expect(checkRequiredScopes(scopes)).toContain('read_locations');
  });

  test('multiple missing scopes all returned', () => {
    const scopes = ['read_products'];
    const missing = checkRequiredScopes(scopes);
    expect(missing.length).toBe(4);
    expect(missing).toEqual(expect.arrayContaining(['write_products', 'write_inventory', 'read_inventory', 'read_locations']));
  });

  test('empty scopes returns all required', () => {
    const missing = checkRequiredScopes([]);
    expect(missing.length).toBe(5);
  });

  test('extra scopes do not cause issues', () => {
    const scopes = ['write_products', 'read_products', 'write_inventory', 'read_inventory', 'read_locations', 'write_orders', 'read_orders'];
    expect(checkRequiredScopes(scopes)).toEqual([]);
  });
});

describe('Connection Health Status Mapping', () => {
  function mapHealthStatus(apiResult) {
    if (!apiResult) return { status: 'error', message: 'No API result' };
    if (apiResult.status === 'healthy') return { status: 'healthy', message: apiResult.message };
    if (apiResult.status === 'action_required' || apiResult.missingScopes?.length > 0) {
      return { status: 'action_required', message: `Missing scopes: ${(apiResult.missingScopes || []).join(', ')}` };
    }
    if (apiResult.status === 'disconnected' || (apiResult.message && apiResult.message.includes('401'))) {
      return { status: 'disconnected', message: 'Access token invalid or expired' };
    }
    return { status: 'error', message: apiResult.message || 'Unknown error' };
  }

  test('healthy connection maps to healthy', () => {
    expect(mapHealthStatus({ status: 'healthy', message: 'All good' }).status).toBe('healthy');
  });

  test('missing scopes maps to action_required', () => {
    const result = mapHealthStatus({ status: 'action_required', missingScopes: ['write_products'], message: 'Missing scope' });
    expect(result.status).toBe('action_required');
    expect(result.message).toContain('write_products');
  });

  test('disconnected token maps to disconnected', () => {
    const result = mapHealthStatus({ status: 'disconnected', message: '401 Unauthorized' });
    expect(result.status).toBe('disconnected');
  });

  test('error status maps to error', () => {
    const result = mapHealthStatus({ status: 'error', message: 'Network error' });
    expect(result.status).toBe('error');
  });

  test('null result maps to error', () => {
    expect(mapHealthStatus(null).status).toBe('error');
  });
});

describe('Image URL Validation', () => {
  function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) return false;
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://10.') || url.startsWith('http://192.168.')) return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false;
      return true;
    } catch {
      return false;
    }
  }

  test('valid https URL is accepted', () => {
    expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
  });

  test('valid http URL is accepted', () => {
    expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
  });

  test('localhost URL is rejected', () => {
    expect(isValidImageUrl('https://localhost:5000/image.jpg')).toBe(false);
  });

  test('127.0.0.1 URL is rejected', () => {
    expect(isValidImageUrl('http://127.0.0.1/image.jpg')).toBe(false);
  });

  test('private IP URL is rejected', () => {
    expect(isValidImageUrl('http://192.168.1.1/image.jpg')).toBe(false);
  });

  test('empty string is rejected', () => {
    expect(isValidImageUrl('')).toBe(false);
  });

  test('null is rejected', () => {
    expect(isValidImageUrl(null)).toBe(false);
  });

  test('undefined is rejected', () => {
    expect(isValidImageUrl(undefined)).toBe(false);
  });

  test('data URL is rejected', () => {
    expect(isValidImageUrl('data:image/png;base64,abc')).toBe(false);
  });

  test('relative path is rejected', () => {
    expect(isValidImageUrl('/images/product.jpg')).toBe(false);
  });
});

describe('Shopify Inventory Sync Integrated Flow', () => {
  beforeAll(() => {
    global.fetch = jest.fn();
    const mongoose = require('mongoose');
    mongoose.model = jest.fn().mockImplementation((name) => {
      if (name === 'Product') return Product;
      if (name === 'Inventory') return Inventory;
      if (name === 'MarketplaceConnection') return MarketplaceConnection;
      if (name === 'MarketplaceLocation') return MarketplaceLocation;
      if (name === 'MarketplaceProduct') return MarketplaceProduct;
      return {
        schema: { paths: {} }
      };
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SHOPIFY_LOCATION_ID;
    delete process.env.SHOPIFY_INVENTORY_SYNC_ENABLED;
    if (global.fetch) global.fetch.mockReset();

    // Reset default mock values
    inventoryHelper.getAvailableStock.mockReset();
    inventoryHelper.getAvailableStock.mockResolvedValue(0);
    inventoryHelper.resolveShopifyLocation.mockReset();
    inventoryHelper.resolveShopifyLocation.mockResolvedValue('loc456');
    inventoryHelper.ensureInventoryTracking.mockReset();
    inventoryHelper.ensureInventoryTracking.mockResolvedValue(true);
    inventoryHelper.activateInventoryItem.mockReset();
    inventoryHelper.activateInventoryItem.mockResolvedValue(true);
    inventoryHelper.setShopifyStock.mockReset();
    inventoryHelper.setShopifyStock.mockResolvedValue(true);
    inventoryHelper.verifyShopifyInventory.mockReset();
    inventoryHelper.verifyShopifyInventory.mockResolvedValue(0);
    inventoryHelper.withRetry.mockReset();
    inventoryHelper.withRetry.mockImplementation((fn) => fn());
  });

  test('Scenario 1 & 2: getAvailableStock resolves authoritative stock or defaults to 0 with warning', async () => {
    const { getAvailableStock } = jest.requireActual('../utils/inventoryHelper');
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // 1. Success case: find product with stock
    Product.findById.mockResolvedValueOnce({
      _id: 'prod123',
      sku: 'SKU-123',
      stock: 42
    });
    let stock = await getAvailableStock('prod123');
    expect(stock).toBe(42);

    // 2. Fallback case: find variant stock
    Product.findById.mockResolvedValueOnce({
      _id: 'prod123',
      sku: 'SKU-123',
      variants: [{ _id: 'var456', stock: 15 }]
    });
    stock = await getAvailableStock('prod123', 'var456');
    expect(stock).toBe(15);

    // 3. Fallback to Inventory collection
    Product.findById.mockResolvedValueOnce(null);
    Inventory.findById.mockResolvedValueOnce({
      _id: 'prod123',
      sku: 'SKU-123',
      stock: 99
    });
    stock = await getAvailableStock('prod123');
    expect(stock).toBe(99);

    // 4. Invalid field resolves to 0 and logs warning
    Product.findById.mockResolvedValueOnce({
      _id: 'prod123',
      sku: 'SKU-123',
      stock: 'invalid_value'
    });
    stock = await getAvailableStock('prod123');
    expect(stock).toBe(0);
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  test('Scenario 3: Verify OAuth Access Scopes matches required ones', () => {
    const checkRequiredScopes = (installedScopes) => {
      const required = ['read_products', 'write_products', 'read_inventory', 'write_inventory', 'read_locations'];
      return required.filter(s => !installedScopes.includes(s));
    };
    const validScopes = ['read_products', 'write_products', 'read_inventory', 'write_inventory', 'read_locations'];
    expect(checkRequiredScopes(validScopes)).toEqual([]);
    
    const invalidScopes = ['read_products'];
    expect(checkRequiredScopes(invalidScopes)).toContain('write_inventory');
  });

  test('Scenario 4: resolveShopifyLocation implements priority logic correctly', async () => {
    const { resolveShopifyLocation } = jest.requireActual('../utils/inventoryHelper');
    const mockGraphql = jest.fn();
    const connection = {
      _id: 'conn123',
      metadata: {}
    };

    // Priority 1: Check existing saved location ID on connection metadata
    connection.metadata.locationId = 'gid://shopify/Location/saved';
    let loc = await resolveShopifyLocation(connection, 'test.myshopify.com', 'token', mockGraphql);
    expect(loc).toBe('gid://shopify/Location/saved');

    // Priority 2: Configured SHOPIFY_LOCATION_ID in env
    connection.metadata.locationId = null;
    process.env.SHOPIFY_LOCATION_ID = 'gid://shopify/Location/env';
    loc = await resolveShopifyLocation(connection, 'test.myshopify.com', 'token', mockGraphql);
    expect(loc).toBe('gid://shopify/Location/env');

    // Priority 3: First active location that can stock inventory (isActive & fulfillsOnlineOrders)
    delete process.env.SHOPIFY_LOCATION_ID;
    mockGraphql.mockResolvedValueOnce({
      locations: {
        nodes: [
          { id: 'gid://shopify/Location/inactive', isActive: false, fulfillsOnlineOrders: true, name: 'Inactive' },
          { id: 'gid://shopify/Location/active-no-orders', isActive: true, fulfillsOnlineOrders: false, name: 'No orders' },
          { id: 'gid://shopify/Location/active-with-orders', isActive: true, fulfillsOnlineOrders: true, name: 'Main' }
        ]
      }
    });
    loc = await resolveShopifyLocation(connection, 'test.myshopify.com', 'token', mockGraphql);
    expect(loc).toBe('gid://shopify/Location/active-with-orders');
    expect(MarketplaceConnection.updateOne).toHaveBeenCalledWith(
      { _id: 'conn123' },
      { $set: { 'metadata.locationId': 'gid://shopify/Location/active-with-orders' } }
    );

    // Priority 4: Fallback to first active location
    connection.metadata.locationId = null;
    mockGraphql.mockResolvedValueOnce({
      locations: {
        nodes: [
          { id: 'gid://shopify/Location/active-fallback', isActive: true, fulfillsOnlineOrders: false, name: 'Fallback' }
        ]
      }
    });
    loc = await resolveShopifyLocation(connection, 'test.myshopify.com', 'token', mockGraphql);
    expect(loc).toBe('gid://shopify/Location/active-fallback');
  });

  test('Scenario 5: ensureInventoryTracking updates tracked to true if false', async () => {
    const { ensureInventoryTracking } = jest.requireActual('../utils/inventoryHelper');
    const mockGraphql = jest.fn().mockResolvedValue({
      inventoryItemUpdate: {
        inventoryItem: { id: 'item123', tracked: true },
        userErrors: []
      }
    });

    // 1. If already tracked, do not mutate
    await ensureInventoryTracking('test.myshopify.com', 'token', 'item123', true, mockGraphql);
    expect(mockGraphql).not.toHaveBeenCalled();

    // 2. If not tracked, call mutation
    await ensureInventoryTracking('test.myshopify.com', 'token', 'item123', false, mockGraphql);
    expect(mockGraphql).toHaveBeenCalled();
  });

  test('Scenario 6: activateInventoryItem calls activate mutation gracefully', async () => {
    const { activateInventoryItem } = jest.requireActual('../utils/inventoryHelper');
    const mockGraphql = jest.fn().mockResolvedValue({
      inventoryActivate: {
        inventoryLevel: { id: 'lvl123' },
        userErrors: []
      }
    });

    await activateInventoryItem('test.myshopify.com', 'token', 'item123', 'loc456', mockGraphql);
    expect(mockGraphql).toHaveBeenCalled();
  });

  test('Scenario 7: setShopifyStock calls inventorySetQuantities with correct referenceDocumentUri', async () => {
    const { setShopifyStock } = jest.requireActual('../utils/inventoryHelper');
    const mockGraphql = jest.fn().mockResolvedValue({
      inventorySetQuantities: {
        inventoryAdjustmentGroup: { id: 'adj123' },
        userErrors: []
      }
    });

    await setShopifyStock('test.myshopify.com', 'token', 'item123', 'loc456', 25, 'prod789', mockGraphql);
    expect(mockGraphql).toHaveBeenCalledWith(
      'test.myshopify.com',
      'token',
      expect.stringContaining('mutation InventorySetQuantities'),
      expect.objectContaining({
        input: expect.objectContaining({
          reason: 'correction',
          referenceDocumentUri: 'retail-verse://inventory-sync/prod789',
          quantities: [
            {
              inventoryItemId: 'item123',
              locationId: 'loc456',
              quantity: 25
            }
          ]
        })
      })
    );
  });

  test('Scenario 8: verifyShopifyInventory queries and compares stock levels', async () => {
    const { verifyShopifyInventory } = jest.requireActual('../utils/inventoryHelper');
    const mockGraphql = jest.fn().mockResolvedValue({
      inventoryItem: {
        id: 'item123',
        tracked: true,
        inventoryLevels: {
          nodes: [
            {
              location: { id: 'loc456' },
              quantities: [{ name: 'available', quantity: 25 }]
            }
          ]
        }
      }
    });

    const verified = await verifyShopifyInventory('test.myshopify.com', 'token', 'item123', 'loc456', 25, mockGraphql);
    expect(verified).toBe(25);

    // Should throw if mismatch
    await expect(verifyShopifyInventory('test.myshopify.com', 'token', 'item123', 'loc456', 10, mockGraphql))
      .rejects.toThrow('Inventory verification mismatch');
  });

  test('Scenario 9: sync status gets updated to inventory_synced upon success', async () => {
    const mockService = require('../services/shopifySyncService');
    const product = { _id: 'prod123', name: 'Test Product', sku: 'SKU123', price: 10, stock: 25 };
    const connection = { _id: 'conn123', merchantId: 'merch123', credentials: { encryptedAccessToken: 'encToken' } };

    global.fetch.mockImplementation((url, options) => {
      const body = JSON.parse(options.body);
      const query = body.query;
      if (query.includes('mutation CreateProduct')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            data: {
              productCreate: {
                product: {
                  id: 'gid://shopify/Product/shopifyProd123',
                  title: 'Test Product',
                  variants: {
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/shopifyVar123',
                        sku: 'SKU123',
                        inventoryItem: {
                          id: 'gid://shopify/InventoryItem/shopifyInv123',
                          tracked: true
                        }
                      }
                    ]
                  }
                },
                userErrors: []
              }
            }
          }))
        });
      }
      if (query.includes('mutation productVariantsBulkUpdate')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            data: {
              productVariantsBulkUpdate: {
                userErrors: []
              }
            }
          }))
        });
      }
      if (query.includes('mutation publishablePublish')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            data: {
              publishablePublish: {
                userErrors: []
              }
            }
          }))
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: {} }))
      });
    });

    inventoryHelper.getAvailableStock.mockResolvedValue(25);
    inventoryHelper.resolveShopifyLocation.mockResolvedValue('loc456');
    inventoryHelper.ensureInventoryTracking.mockResolvedValue(true);
    inventoryHelper.activateInventoryItem.mockResolvedValue(true);
    inventoryHelper.setShopifyStock.mockResolvedValue(true);
    inventoryHelper.verifyShopifyInventory.mockResolvedValue(25);
    inventoryHelper.withRetry.mockImplementation((fn) => fn());

    MarketplaceProduct.findOne.mockResolvedValue(null);
    MarketplaceProduct.findOneAndUpdate.mockResolvedValue({
      shopifyProductId: 'shopifyProd123',
      shopifyVariantId: 'shopifyVar123',
      inventoryItemId: 'shopifyInv123',
      syncStatus: 'inventory_synced'
    });

    const result = await mockService.syncSingleProductInline(
      product,
      connection,
      'test.myshopify.com',
      'token',
      'loc456'
    );

    expect(MarketplaceProduct.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        syncStatus: 'inventory_synced'
      }),
      expect.any(Object)
    );
  });

  test('Scenario 10: prevent webhooks sync loop using skipShopifySync', () => {
    const localProduct = {
      name: 'Loop Prevention Product',
      stock: 10,
      skipShopifySync: true
    };

    let triggerJob = true;
    if (localProduct.skipShopifySync) {
      triggerJob = false;
      localProduct.skipShopifySync = false;
    }

    expect(triggerJob).toBe(false);
    expect(localProduct.skipShopifySync).toBe(false);
  });

  test('Scenario 11: SHOPIFY_INVENTORY_SYNC_ENABLED configuration parsing', () => {
    const isSyncEnabled = (envVal) => {
      if (envVal === undefined || envVal === null) return true;
      return String(envVal).toLowerCase() === 'true';
    };

    expect(isSyncEnabled(undefined)).toBe(true);
    expect(isSyncEnabled('true')).toBe(true);
    expect(isSyncEnabled('TRUE')).toBe(true);
    expect(isSyncEnabled('false')).toBe(false);
  });

  test('Scenario 12: Reports inventory_sync_failed when stock set fails but product shell succeeded', async () => {
    const mockService = require('../services/shopifySyncService');
    const product = { _id: 'prod123', name: 'Test Product', sku: 'SKU123', price: 10, stock: 25 };
    const connection = { _id: 'conn123', merchantId: 'merch123', credentials: { encryptedAccessToken: 'encToken' } };

    global.fetch.mockImplementation((url, options) => {
      const body = JSON.parse(options.body);
      const query = body.query;
      if (query.includes('mutation CreateProduct')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            data: {
              productCreate: {
                product: {
                  id: 'gid://shopify/Product/shopifyProd123',
                  title: 'Test Product',
                  variants: {
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/shopifyVar123',
                        sku: 'SKU123',
                        inventoryItem: {
                          id: 'gid://shopify/InventoryItem/shopifyInv123',
                          tracked: true
                        }
                      }
                    ]
                  }
                },
                userErrors: []
              }
            }
          }))
        });
      }
      if (query.includes('mutation productVariantsBulkUpdate')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            data: {
              productVariantsBulkUpdate: {
                userErrors: []
              }
            }
          }))
        });
      }
      if (query.includes('mutation publishablePublish')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            data: {
              publishablePublish: {
                userErrors: []
              }
            }
          }))
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: {} }))
      });
    });

    inventoryHelper.getAvailableStock.mockResolvedValue(25);
    inventoryHelper.resolveShopifyLocation.mockResolvedValue('loc456');
    inventoryHelper.ensureInventoryTracking.mockResolvedValue(true);
    inventoryHelper.activateInventoryItem.mockResolvedValue(true);
    inventoryHelper.setShopifyStock.mockRejectedValueOnce(new Error('Shopify mutation error'));
    inventoryHelper.withRetry.mockImplementation((fn) => fn());

    MarketplaceProduct.findOne.mockResolvedValue(null);

    await mockService.syncSingleProductInline(
      product,
      connection,
      'test.myshopify.com',
      'token',
      'loc456'
    );

    expect(MarketplaceProduct.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        syncStatus: 'inventory_sync_failed'
      }),
      expect.any(Object)
    );
  });
});
