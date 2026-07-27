const mongoose = require('mongoose');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceSyncLog = require('../models/MarketplaceSyncLog');
const MarketplaceListing = require('../models/MarketplaceListing');
const MarketplaceJobWorker = require('../services/marketplaces/MarketplaceJobWorker');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const MarketplaceLocation = require('../models/MarketplaceLocation');
const Order = require('../models/Order');
const { encryptSecret, decryptSecret } = require('../lib/marketplaces/encryption');
const ShopifyOAuthState = require('../models/ShopifyOAuthState');
const {
  getAvailableStock,
  resolveShopifyLocation,
  ensureInventoryTracking,
  activateInventoryItem,
  setShopifyStock,
  verifyShopifyInventory,
  withRetry
} = require('../utils/inventoryHelper');
const MarketplaceSyncJob = require('../models/MarketplaceSyncJob');
const { getMerchantId, getMerchantIdCandidates, findWithMerchantFallback } = require('../utils/merchantHelper');
const { computeProductMarketplaceStatuses } = require('../utils/marketplaceStatusHelper');

function normalizeShopDomain(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Shop domain is required");
  }

  let shop = input.trim().toLowerCase();

  shop = shop
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/\.$/, "");

  if (!shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }

  const shopRegex =
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

  if (!shopRegex.test(shop)) {
    throw new Error("Invalid Shopify shop domain");
  }

  return shop;
}

// HMAC validation for Shopify callback redirect
function verifyShopifyHmac(query, apiSecret) {
  const { hmac, ...params } = query;
  if (!hmac || typeof hmac !== 'string') return false;

  const sortedParams = Object.keys(params)
    .sort()
    .map(key => {
      const val = params[key];
      const valStr = Array.isArray(val) ? val.join(',') : String(val);
      return `${key}=${valStr}`;
    })
    .join('&');

  const calculatedHmac = crypto
    .createHmac('sha256', apiSecret)
    .update(sortedParams)
    .digest('hex');

  const calculatedHmacBuffer = Buffer.from(calculatedHmac, 'utf-8');
  const hmacBuffer = Buffer.from(hmac, 'utf-8');

  if (calculatedHmacBuffer.length !== hmacBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedHmacBuffer, hmacBuffer);
}

// HMAC validation for Shopify webhooks
function verifyShopifyWebhookHmac(rawBody, hmacHeader, apiSecret) {
  if (!hmacHeader || !rawBody) return false;
  
  const calculatedHmac = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody)
    .digest('base64');
    
  const calculatedHmacBuffer = Buffer.from(calculatedHmac, 'utf-8');
  const hmacHeaderBuffer = Buffer.from(hmacHeader, 'utf-8');

  if (calculatedHmacBuffer.length !== hmacHeaderBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedHmacBuffer, hmacHeaderBuffer);
}

// Shopify GraphQL request helper with rate limiting, timeout, and full error capture
async function shopifyGraphqlRequest(shopDomain, accessToken, query, variables = {}) {
  if (!shopDomain) throw new Error('Shop domain is required for Shopify API request');
  if (!accessToken) throw new Error('Access token is required for Shopify API request');

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-07';
  const url = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  const controller = new AbortController();
  const timeoutMs = 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Capture full response body for error reporting
    const responseText = await response.text();
    let json;
    try {
      json = JSON.parse(responseText);
    } catch (parseErr) {
      throw new Error(
        `Shopify API HTTP ${response.status}: Non-JSON response. Body: ${responseText.substring(0, 1000)}`
      );
    }

    // Handle HTTP rate limiting (429)
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '10';
      const err = new Error(
        `Shopify API rate limited (HTTP 429). Retry after ${retryAfter}s. Body: ${JSON.stringify(json).substring(0, 500)}`
      );
      err.statusCode = 429;
      err.retryAfter = parseInt(retryAfter, 10);
      err.isThrottle = true;
      throw err;
    }

    // Handle HTTP errors (non-200)
    if (!response.ok) {
      const errMsg = json?.errors
        ? json.errors.map(e => e.message || JSON.stringify(e)).join(', ')
        : JSON.stringify(json).substring(0, 500);
      const err = new Error(`Shopify API error (HTTP ${response.status}): ${errMsg}`);
      err.statusCode = response.status;
      err.responseBody = json;
      throw err;
    }

    // Handle GraphQL-level errors
    if (json.errors && json.errors.length > 0) {
      const errMessages = json.errors.map(e => e.message || JSON.stringify(e)).join(', ');
      const err = new Error(`Shopify GraphQL error: ${errMessages}`);
      err.statusCode = 200;
      err.graphQLErrors = json.errors;
      err.responseBody = json;
      throw err;
    }

    // Handle GraphQL cost/throttle warnings
    const cost = json.extensions?.cost;
    if (cost?.throttleStatus && cost.throttleStatus.currentlyAvailable !== undefined) {
      const requestedQueryCost = variables?.query?.cost?.requestedQueryCost || 0;
      if (cost.throttleStatus.currentlyAvailable < requestedQueryCost) {
        const restoreRate = cost.throttleStatus.restoreRate || 50;
        const delayMs = Math.ceil((requestedQueryCost - cost.throttleStatus.currentlyAvailable) / restoreRate) * 1000 + 1000;
        const err = new Error(`Shopify GraphQL throttled: Available cost ${cost.throttleStatus.currentlyAvailable} < requested ${requestedQueryCost}. Retry after ${delayMs}ms`);
        err.isThrottle = true;
        err.retryAfterMs = delayMs;
        err.statusCode = 429;
        err.responseBody = json;
        throw err;
      }
    }

    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Shopify API request timed out after ${timeoutMs}ms to ${url}`);
    }
    if (err.statusCode || err.isThrottle || err.graphQLErrors) {
      throw err; // Already formatted
    }
    throw new Error(`Shopify API request failed: ${err.message}`);
  }
}

// Register webhook subscriptions
async function registerShopifyWebhooks(shopDomain, accessToken, appUrl) {
  const webhookUrl = `${appUrl.replace(/\/+$/, "")}/api/marketplaces/shopify/webhook`;
  const topics = [
    'PRODUCTS_CREATE',
    'PRODUCTS_UPDATE',
    'PRODUCTS_DELETE',
    'INVENTORY_LEVELS_UPDATE',
    'ORDERS_CREATE',
    'ORDERS_UPDATED',
    'ORDERS_CANCELLED',
    'APP_UNINSTALLED'
  ];

  const mutation = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  for (const topic of topics) {
    try {
      const result = await shopifyGraphqlRequest(shopDomain, accessToken, mutation, {
        topic,
        webhookSubscription: {
          address: webhookUrl,
          format: 'JSON'
        }
      });
      const errors = result.data?.webhookSubscriptionCreate?.userErrors || [];
      if (errors.length > 0) {
        console.error(`[Shopify Webhooks] Error registering topic ${topic}:`, errors.map(e => e.message).join(', '));
      } else {
        console.log(`[Shopify Webhooks] Successfully registered topic ${topic} to ${webhookUrl}`);
      }
    } catch (err) {
      console.error(`[Shopify Webhooks] Exception registering topic ${topic}:`, err.message);
    }
  }
}

// Paginated query for products mapping
const GET_PRODUCTS_QUERY = `
  query getProducts($cursor: String, $locationId: ID!) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          descriptionHtml
          productType
          status
          vendor
          images(first: 5) {
            edges {
              node {
                url
              }
            }
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryItem {
                  id
                  tracked
                  inventoryLevel(locationId: $locationId) {
                    id
                    available
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Initial Import function (run in background)
async function importShopifyData(connectionId) {
  const connection = await MarketplaceConnection.findById(connectionId);
  if (!connection) return;

  const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);
  const shopDomain = connection.storeUrl;

  try {
    console.log(`[Shopify Import] Starting initial import for store ${shopDomain}`);
    // 1. Fetch Locations
    const locationsData = await shopifyGraphqlRequest(shopDomain, accessToken, `
      query {
        locations(first: 10) {
          edges {
            node {
              id
              name
              isActive
            }
          }
        }
      }
    `);

    const locations = (locationsData.data?.locations?.edges || []).map(e => e.node);
    connection.metadata = connection.metadata || {};
    connection.metadata.locations = locations;

    const activeLocation = locations.find(l => l.isActive) || locations[0];
    const locationId = activeLocation ? activeLocation.id : null;
    if (locationId) {
      connection.metadata.locationId = locationId;
      connection.locationId = locationId;
    }

    // 2. Fetch Collections
    const collectionsData = await shopifyGraphqlRequest(shopDomain, accessToken, `
      query {
        collections(first: 50) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `);
    const collections = (collectionsData.data?.collections?.edges || []).map(e => e.node);
    connection.metadata.collections = collections;

    await connection.save();

    if (!locationId) {
      console.warn(`[Shopify Import] No active location found for connection ${connectionId}. Aborting product import.`);
      return;
    }

    // 3. Fetch Products and Variants
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const productsData = await shopifyGraphqlRequest(shopDomain, accessToken, GET_PRODUCTS_QUERY, {
        cursor,
        locationId
      });

      const productsConnection = productsData.data?.products;
      if (!productsConnection) break;

      const edges = productsConnection.edges || [];
      for (const edge of edges) {
        const sp = edge.node;
        const variants = sp.variants?.edges || [];

        for (const vEdge of variants) {
          const sv = vEdge.node;
          const sku = sv.sku || `SHPFY-${sv.id.split('/').pop()}`;

          // Find existing local product by SKU
          let localProduct = await Product.findOne({ sku, clientId: connection.merchantId });

          if (!localProduct) {
            const imageObj = sp.images?.edges?.[0]?.node;
            const imageUrl = imageObj ? imageObj.url : '';
            const imagesUrls = (sp.images?.edges || []).map(e => e.node.url);

            localProduct = new Product({
              name: sp.title + (variants.length > 1 ? ` - ${sv.title}` : ''),
              title: sp.title + (variants.length > 1 ? ` - ${sv.title}` : ''),
              sku,
              price: Number(sv.price) || 0,
              originalPrice: Number(sv.compareAtPrice) || Number(sv.price) || 0,
              stock: sv.inventoryItem?.inventoryLevel?.available || 0,
              quantity: sv.inventoryItem?.inventoryLevel?.available || 0,
              description: sp.descriptionHtml || '',
              category: sp.productType || 'Shopify Import',
              merchantId: connection.merchantId,
              clientId: connection.merchantId,
              isActive: sp.status === 'ACTIVE',
              image: imageUrl,
              images: imagesUrls
            });

            localProduct.skipShopifySync = true;
            await localProduct.save();
          }

          // Save mapping
          await MarketplaceProduct.findOneAndUpdate(
            { productId: localProduct._id, marketplace: 'shopify' },
            {
              merchantId: connection.merchantId,
              productId: localProduct._id,
              localProductId: localProduct._id,
              marketplaceProductId: sp.id,
              shopifyProductId: sp.id,
              shopifyVariantId: sv.id,
              inventoryItemId: sv.inventoryItem?.id,
              locationId,
              listingStatus: 'active',
              syncStatus: 'success',
              lastSyncedAt: new Date()
            },
            { upsert: true }
          );
        }
      }

      hasNextPage = productsConnection.pageInfo?.hasNextPage;
      cursor = productsConnection.pageInfo?.endCursor;
    }

    // Update connection lastSyncAt and status
    connection.lastSyncAt = new Date();
    connection.apiHealth = {
      status: 'healthy',
      lastCheckedAt: new Date(),
      lastSuccessAt: new Date()
    };
    await connection.save();
    console.log(`[Shopify Import] Import succeeded for connection ${connectionId}.`);
  } catch (err) {
    console.error(`[Shopify Import] Exception during import:`, err.message);
    connection.apiHealth = {
      status: 'error',
      lastCheckedAt: new Date(),
      lastError: err.message
    };
    await connection.save();
  }
}

exports.getMarketplaces = async (req, res) => {
  try {
    const merchantId = getMerchantId(req);
    const merchantCandidates = getMerchantIdCandidates(req);
    const connections = await MarketplaceConnection.find({
      merchantId: { $in: merchantCandidates },
      marketplace: { $ne: 'blinkit' }
    });
    
    const availableMarketplaces = [
      { 
        code: 'amazon', 
        name: 'Amazon', 
        displayName: 'Amazon SP-API', 
        description: 'Connect to Amazon Seller Central to sync orders and inventory.', 
        logo: '/marketplace-logos/amazon.svg', 
        hasOAuth: true 
      },
      { 
        code: 'shopify', 
        name: 'Shopify', 
        displayName: 'Shopify', 
        description: 'Integrate your Shopify store to automate operations.', 
        logo: '/marketplace-logos/shopify.svg', 
        hasOAuth: true 
      },
      { 
        code: 'flipkart', 
        name: 'Flipkart', 
        displayName: 'Flipkart', 
        description: 'Connect Flipkart seller account to manage listings.', 
        logo: '/marketplace-logos/flipkart.svg', 
        hasOAuth: false 
      }
    ];

    const data = availableMarketplaces.map(m => {
      const conn = connections.find(c => c.marketplace === m.code);
      return {
        ...m,
        status: conn ? conn.status : 'disconnected',
        connectionId: conn ? conn._id : null,
        accountName: conn ? conn.accountName : null,
        sellerAccountId: conn ? conn.sellerAccountId : null,
        storeUrl: conn ? conn.storeUrl || conn.shopDomain : null,
        isSyncEnabled: conn ? conn.isSyncEnabled : false,
        apiHealth: conn ? conn.apiHealth : null,
        lastSyncAt: conn ? conn.lastSyncAt : null,
        connectedAt: conn ? conn.connectedAt || conn.installedAt : null
      };
    });

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching marketplaces', error: error.message });
  }
};

exports.getConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const merchantCandidates = getMerchantIdCandidates(req);
    const canonicalMerchantId = getMerchantId(req);

    console.log('[Marketplace Detail] connectionId:', connectionId);
    console.log('[Marketplace Detail] merchantId (canonical):', canonicalMerchantId);
    console.log('[Marketplace Detail] merchantId (candidates):', merchantCandidates);

    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CONNECTION_ID',
        message: 'The marketplace account ID is invalid.'
      });
    }

    const connection = await MarketplaceConnection.findOne({
      _id: connectionId,
      merchantId: { $in: merchantCandidates }
    });

    if (!connection) {
      const exists = await MarketplaceConnection.findById(connectionId);
      if (exists) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'You do not have access to this marketplace account.'
        });
      }
      return res.status(404).json({
        success: false,
        code: 'MARKETPLACE_CONNECTION_NOT_FOUND',
        message: 'Marketplace account not found.'
      });
    }
    const obj = connection.toObject();
    delete obj.credentials;
    delete obj.accessToken;
    delete obj.encryptedAccessToken;
    delete obj.encryptedRefreshToken;

    const merchantId = canonicalMerchantId;

    // Count mapped Shopify products (synced mappings) vs total products
    // Accept all valid synced statuses: 'success', 'synced', 'inventory_synced'
    const SYNCED_STATUSES = ['success', 'synced', 'inventory_synced'];
    const mappedProductCount = await MarketplaceProduct.countDocuments({
      connectionId,
      marketplace: 'shopify',
      syncStatus: { $in: SYNCED_STATUSES },
      shopifyProductId: { $ne: null, $ne: '' }
    });

    const mappedInventoryCount = await MarketplaceProduct.countDocuments({
      connectionId,
      marketplace: 'shopify',
      syncStatus: { $in: SYNCED_STATUSES },
      shopifyVariantId: { $ne: null, $ne: '' }
    });

    const totalProducts = await Product.countDocuments({
      $or: [
        { clientId: merchantId },
        { merchantId: merchantId }
      ]
    });

    const ordersCount = await Order.countDocuments({
      merchantId: merchantId,
      orderSource: connection.marketplace
    });

    // Sync job stats for this connection
    const jobs = await MarketplaceSyncJob.find({ connectionId });

    // Recent activity logs
    const recentLogs = await MarketplaceSyncLog.find({ connectionId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    let queued = 0;
    let processing = 0;
    let synced = 0;
    let failed = 0;
    for (const job of jobs) {
      if (job.status === 'pending' || job.status === 'retrying') queued++;
      else if (job.status === 'processing') processing++;
      else if (job.status === 'completed') synced++;
      else if (job.status === 'failed') failed++;
    }

    // Count failed product mappings
    const failedMappings = await MarketplaceProduct.countDocuments({
      connectionId,
      syncStatus: 'failed'
    });

    const lastSuccessfulMapping = await MarketplaceProduct.findOne({
      connectionId,
      syncStatus: { $in: ['success', 'synced', 'inventory_synced'] },
      lastSyncedAt: { $ne: null }
    }).sort({ lastSyncedAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: {
        connection: obj,
        stats: {
          totalProducts,
          products: mappedProductCount,
          orders: ordersCount,
          inventoryItems: mappedInventoryCount,
          failedSyncs: failed + failedMappings,
          successfulSyncs: synced,
          totalMappings: mappedProductCount
        },
        syncStatus: {
          queued,
          processing,
          synced: mappedProductCount,
          failed,
          notSynced: Math.max(0, totalProducts - mappedProductCount - failedMappings - queued - processing)
        },
        lastSyncAt: lastSuccessfulMapping?.lastSyncedAt || connection.lastSyncAt || null,
        recentActivity: recentLogs
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getConnections = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const connections = await MarketplaceConnection.find({
      merchantId: { $in: merchantCandidates },
      marketplace: { $ne: 'blinkit' }
    });
    const sanitized = connections.map(c => {
      const obj = c.toObject();
      delete obj.credentials;
      delete obj.accessToken;
      delete obj.encryptedAccessToken;
      delete obj.encryptedRefreshToken;
      return obj;
    });
    res.status(200).json(sanitized);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching connections', error: error.message });
  }
};

exports.connectMarketplace = async (req, res) => {
  try {
    let { marketplace } = req.params;
    const { connectionId } = req.params;
    const merchantId = getMerchantId(req);
    
    let shop = req.query.shop;
    let existingConnection = null;

    if (connectionId) {
      existingConnection = await findWithMerchantFallback(MarketplaceConnection, { _id: connectionId }, getMerchantIdCandidates(req));
      if (!existingConnection) {
        return res.status(404).json({ success: false, message: 'Connection not found' });
      }
      marketplace = existingConnection.marketplace;
      shop = existingConnection.shopDomain || existingConnection.storeUrl;
    }

    if (marketplace === 'shopify') {
      // Direct credentials connect
      if (req.body && req.body.accessToken && req.body.storeDomain) {
        const { storeName, storeDomain, accessToken } = req.body;
        let normalizedShop;
        try {
          normalizedShop = normalizeShopDomain(storeDomain);
        } catch (err) {
          return res.status(400).json({ success: false, message: err.message });
        }

        const shopName = storeName || 'Shopify Store';
        const encryptedAccessToken = encryptSecret(accessToken);

        const conn = await MarketplaceConnection.findOneAndUpdate(
          { merchantId, marketplace: 'shopify' },
          {
            accountName: shopName,
            storeUrl: normalizedShop,
            shopDomain: normalizedShop,
            accessToken: encryptedAccessToken,
            installedAt: new Date(),
            connectedAt: new Date(),
            status: 'connected',
            isSyncEnabled: true,
            credentials: {
              encryptedAccessToken: encryptedAccessToken
            },
            metadata: {
              shopName,
              scopes: ['read_products', 'write_products', 'read_inventory', 'write_inventory', 'read_locations']
            },
            apiHealth: {
              status: 'healthy',
              lastCheckedAt: new Date(),
              lastSuccessAt: new Date()
            }
          },
          { upsert: true, new: true }
        );

        // Trigger initial outbound product sync (Retail Verse to Shopify)
        const shopifySyncService = require('../services/shopifySyncService');
        shopifySyncService.syncProducts(conn, merchantId).catch(err => {
          console.error('[Shopify Credentials Connect] Sync error:', err.message);
        });

        // Queue initial push (Retail Verse to Shopify)
        try {
          const products = await Product.find({
            $or: [{ clientId: merchantId }, { merchantId: merchantId }],
            isActive: true
          });
          const MarketplaceSyncJobService = require('../services/MarketplaceSyncJobService');
          for (const product of products) {
            await MarketplaceSyncJobService.createJob({
              merchantId,
              productId: product._id,
              marketplace: 'shopify',
              operation: 'CREATE_LISTING',
              payload: { connectionId: conn._id }
            });
          }
          console.log(`[Shopify Credentials Connect] Queued initial sync for ${products.length} products.`);
        } catch (pushErr) {
          console.error('[Shopify Credentials Connect] Initial push error:', pushErr.message);
        }

        return res.status(200).json({ success: true, connectionId: conn._id });
      }

      if (!shop) {
        return res.status(400).json({ success: false, message: 'Missing shop parameter' });
      }

      let normalizedShop;
      try {
        normalizedShop = normalizeShopDomain(shop);
      } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
      }

      const apiKey = process.env.SHOPIFY_API_KEY;
      const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
      const scopes = process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_inventory,write_inventory,read_orders,read_locations,write_orders';

      if (!apiKey || !redirectUri) {
        return res.status(500).json({ success: false, message: 'Shopify OAuth credentials are not configured in backend' });
      }

      // Generate a cryptographically secure state
      const state = crypto.randomBytes(24).toString('hex');

      // Save a short-lived OAuth state record in MongoDB
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
      await ShopifyOAuthState.create({
        state,
        merchantId,
        shopDomain: normalizedShop,
        expiresAt,
        used: false
      });

      const authorizationUrl = new URL(
        `https://${normalizedShop}/admin/oauth/authorize`
      );

      authorizationUrl.searchParams.set("client_id", apiKey);
      authorizationUrl.searchParams.set("scope", scopes);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("state", state);

      // Safe temporary logs
      console.log("[Shopify OAuth] Normalized shop:", normalizedShop);
      console.log(
        "[Shopify OAuth] Redirect host:",
        new URL(authorizationUrl).hostname
      );
      console.log(
        "[Shopify OAuth] Callback URL:",
        process.env.SHOPIFY_REDIRECT_URI
      );

      if (req.method === 'POST') {
        return res.status(200).json({ success: true, authUrl: authorizationUrl.toString() });
      } else {
        return res.redirect(authorizationUrl.toString());
      }
    }
    
    // Fallback for non-shopify credentials modal connect
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, message: 'Missing credentials payload' });
    }

    const { encryptMarketplaceCredential } = require('../utils/encryption');
    const credentialsJson = JSON.stringify(req.body);
    const encryptedResult = encryptMarketplaceCredential(credentialsJson);
    
    if (!encryptedResult) {
      throw new Error("Failed to encrypt credentials");
    }

    const { encryptedText, iv, authTag } = encryptedResult;
    const sellerAccountId = req.body.sellerId || req.body.storeDomain || req.body.storeUrl || 'default';
    const accountName = req.body.accountName || req.body.storeDomain || req.body.storeUrl || marketplace;

    const credentials = {
      encryptedAccessToken: encryptedText,
      encryptedRefreshToken: 'configured',
      iv,
      authTag
    };

    const conn = await MarketplaceConnection.findOneAndUpdate(
      { merchantId, marketplace, sellerAccountId },
      {
        accountName,
        storeUrl: req.body.storeDomain || req.body.storeUrl,
        status: 'connected',
        credentials,
        apiHealth: { status: 'healthy', lastCheckedAt: new Date(), lastSuccessAt: new Date() }
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, connectionId: conn._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.handleCallback = async (req, res) => {
  const { marketplace } = req.params;
  const { state, code, shop } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://www.retailverse.in';
  
  if (marketplace === 'shopify') {
    try {
      const apiSecret = process.env.SHOPIFY_API_SECRET;
      if (!apiSecret) {
        throw new Error('SHOPIFY_API_SECRET is not configured');
      }

      // 1. Verify Shopify HMAC
      const verified = verifyShopifyHmac(req.query, apiSecret);
      if (!verified) {
        throw new Error('HMAC validation failed');
      }

      // 2. Validate state
      if (!state) {
        throw new Error('State parameter is missing');
      }

      const oauthState = await ShopifyOAuthState.findOne({ state });
      if (!oauthState) {
        throw new Error('OAuth state not found or has expired');
      }
      if (oauthState.used) {
        throw new Error('OAuth state has already been used');
      }
      if (oauthState.shopDomain !== shop) {
        throw new Error('Callback shop domain does not match original request');
      }
      if (oauthState.expiresAt < new Date()) {
        throw new Error('OAuth state has expired');
      }

      // Mark it used before completing installation
      oauthState.used = true;
      await oauthState.save();

      const { merchantId } = oauthState;

      // 3. Exchange code for access token
      const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_API_KEY,
          client_secret: apiSecret,
          code
        })
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${errText}`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Get shop name
      const shopResponse = await fetch(`https://${shop}/admin/api/2024-07/shop.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      let shopName = 'Shopify Store';
      if (shopResponse.ok) {
        const shopDetails = await shopResponse.json();
        shopName = shopDetails.shop?.name || shopName;
      }

      const encryptedAccessToken = encryptSecret(accessToken);

      const connection = await MarketplaceConnection.findOneAndUpdate(
        { merchantId, marketplace: 'shopify' },
        {
          accountName: shopName,
          storeUrl: shop,
          shopDomain: shop,
          accessToken: encryptedAccessToken,
          installedAt: new Date(),
          connectedAt: new Date(),
          status: 'connected',
          isSyncEnabled: true,
          credentials: {
            encryptedAccessToken: encryptedAccessToken
          },
          metadata: {
            shopName,
            scopes: tokenData.scope ? tokenData.scope.split(',') : []
          },
          apiHealth: {
            status: 'healthy',
            lastCheckedAt: new Date(),
            lastSuccessAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      // Register webhooks
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      registerShopifyWebhooks(shop, accessToken, appUrl).catch(err => {
        console.error('[Shopify Callback] Webhook registration error:', err.message);
      });

      // Trigger initial outbound product sync (Retail Verse to Shopify)
      const shopifySyncService = require('../services/shopifySyncService');
      shopifySyncService.syncProducts(connection, merchantId).catch(err => {
        console.error('[Shopify Callback] Sync error:', err.message);
      });

      // Queue initial push (Retail Verse to Shopify)
      try {
        const products = await Product.find({
          $or: [{ clientId: merchantId }, { merchantId: merchantId }],
          isActive: true
        });
        const MarketplaceSyncJobService = require('../services/MarketplaceSyncJobService');
        for (const product of products) {
          await MarketplaceSyncJobService.createJob({
            merchantId,
            productId: product._id,
            marketplace: 'shopify',
            operation: 'CREATE_LISTING',
            payload: { connectionId: connection._id }
          });
        }
        console.log(`[Shopify Callback] Queued initial sync for ${products.length} products.`);
      } catch (pushErr) {
        console.error('[Shopify Callback] Initial push error:', pushErr.message);
      }

      return res.redirect(`${frontendUrl}/admin/marketplaces?shopify=connected`);
    } catch (err) {
      console.error('[Shopify Callback] Exception:', err.message);
      return res.redirect(`${frontendUrl}/admin/marketplaces?shopify=error&message=${encodeURIComponent(err.message)}`);
    }
  }
};

exports.testConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = await findWithMerchantFallback(MarketplaceConnection, { _id: connectionId }, getMerchantIdCandidates(req));
    if (!connection) return res.status(404).json({ success: false, message: 'Connection not found' });

    if (connection.marketplace === 'shopify') {
      const ShopifySyncService = require('../services/shopifySyncService');
      const healthResult = await ShopifySyncService.checkConnectionHealth(connection);

      connection.apiHealth = {
        status: healthResult.status === 'healthy' ? 'healthy' : 'error',
        lastCheckedAt: new Date(),
        ...(healthResult.status === 'healthy' ? { lastSuccessAt: new Date() } : { lastError: healthResult.message })
      };
      if (healthResult.status === 'disconnected') {
        connection.status = 'disconnected';
      } else if (healthResult.status === 'action_required') {
        connection.status = 'approval_required';
      }
      await connection.save();

      return res.status(200).json({
        success: healthResult.status === 'healthy',
        status: healthResult.status,
        message: healthResult.message,
        scopes: healthResult.scopes || [],
        missingScopes: healthResult.missingScopes || [],
        shopName: healthResult.shopName,
        shopDomain: healthResult.shopDomain,
        locations: healthResult.locations || 0,
        hasActiveLocation: healthResult.hasActiveLocation
      });
    }

    const adapter = MarketplaceJobWorker.getAdapter(connection.marketplace, connection);
    if (!adapter) throw new Error('Adapter not found');

    const result = await adapter.testConnection();
    
    connection.apiHealth = {
      status: result.success ? 'healthy' : 'error',
      lastCheckedAt: new Date(),
      ...(result.success ? { lastSuccessAt: new Date() } : { lastError: result.message })
    };
    if (!result.success && result.message.includes('missing')) {
      connection.status = 'configuration_missing';
    }
    await connection.save();

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.disconnectMarketplace = async (req, res) => {
  try {
    const { connectionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return res.status(400).json({ success: false, code: 'INVALID_CONNECTION_ID', message: 'Invalid connection ID format.' });
    }
    const connection = await MarketplaceConnection.findOneAndUpdate(
      { _id: connectionId, merchantId: { $in: getMerchantIdCandidates(req) } },
      { status: 'disconnected', credentials: {}, disconnectedAt: new Date() },
      { new: true }
    );
    if (!connection) {
      return res.status(404).json({ success: false, code: 'MARKETPLACE_CONNECTION_NOT_FOUND', message: 'Marketplace account not found.' });
    }
    res.status(200).json({ success: true, status: 'disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return res.status(400).json({ success: false, code: 'INVALID_CONNECTION_ID', message: 'Invalid connection ID format.' });
    }

    const merchantCandidates = getMerchantIdCandidates(req);
    const connection = await MarketplaceConnection.findOne({
      _id: connectionId,
      merchantId: { $in: merchantCandidates }
    });

    if (!connection) {
      return res.status(404).json({ success: false, code: 'MARKETPLACE_CONNECTION_NOT_FOUND', message: 'Marketplace account not found.' });
    }

    // Delete the connection and all associated mapping/sync data
    // Products and Orders are NEVER deleted
    await Promise.all([
      MarketplaceConnection.deleteOne({ _id: connectionId }),
      MarketplaceProduct.deleteMany({
        $or: [
          { connectionId },
          { merchantId: { $in: merchantCandidates }, marketplace: connection.marketplace }
        ]
      }),
      MarketplaceSyncJob.deleteMany({ connectionId }),
      MarketplaceSyncLog.deleteMany({ connectionId }),
      MarketplaceListing.deleteMany({ connectionId }),
    ]);

    res.status(200).json({ success: true, message: 'Marketplace connection and related data removed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reconnectMarketplace = exports.connectMarketplace;

exports.getLogs = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const logs = await MarketplaceSyncLog.find({ connectionId, merchantId: { $in: getMerchantIdCandidates(req) } })
      .populate('productId', 'name title sku')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const productIds = logs.map(l => l.productId?._id).filter(Boolean);
    const mappings = await MarketplaceProduct.find({
      connectionId,
      productId: { $in: productIds }
    }).lean();

    const mappingMap = {};
    for (const m of mappings) {
      if (m.productId) {
        mappingMap[m.productId.toString()] = m;
      }
    }

    const enhancedLogs = logs.map(l => {
      const mapping = l.productId ? mappingMap[l.productId._id.toString()] : null;
      return {
        _id: l._id,
        productName: l.productId?.name || l.productId?.title || 'System',
        sku: l.productId?.sku || 'N/A',
        action: l.action,
        status: l.level === 'error' ? 'failed' : 'success',
        shopifyProductId: mapping?.shopifyProductId || 'N/A',
        error: l.level === 'error' ? l.message : null,
        timestamp: l.createdAt
      };
    });

    res.status(200).json(enhancedLogs);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getListings = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const listings = await MarketplaceListing.find({ connectionId, merchantId: { $in: getMerchantIdCandidates(req) } })
      .populate('productId');
    res.status(200).json(listings);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.publishProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { connectionIds } = req.body;
    
    const MarketplaceSyncJobService = require('../services/MarketplaceSyncJobService');

    const merchantPublishId = getMerchantId(req);
    for (const connectionId of connectionIds) {
      const conn = await MarketplaceConnection.findOne({ _id: connectionId, merchantId: { $in: getMerchantIdCandidates(req) } });
      if (conn) {
        await MarketplaceSyncJobService.createJob({
          merchantId: merchantPublishId,
          productId,
          marketplace: conn.marketplace,
          operation: 'CREATE_LISTING'
        });
      }
    }
    res.status(200).json({ success: true, message: 'Jobs created for publishing' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.syncConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = await findWithMerchantFallback(MarketplaceConnection, { _id: connectionId }, getMerchantIdCandidates(req));
    if (!connection) {
      return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    if (connection.marketplace === 'shopify') {
      const shopifySyncService = require('../services/shopifySyncService');
      const merchantId = getMerchantId(req);
      const syncResult = await shopifySyncService.syncProducts(connection, merchantId || connection.merchantId);
      return res.status(200).json({
        success: true,
        message: syncResult.message || 'Shopify product synchronization completed successfully',
        data: syncResult,
        syncResult
      });
    }
    
    res.status(400).json({ success: false, message: 'Manual sync not supported for this marketplace' });
  } catch (error) {
    console.error('[syncConnection] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.handleWebhook = async (req, res) => {
  const { marketplace } = req.params;
  
  if (marketplace !== 'shopify') {
    return res.status(400).json({ success: false, message: 'Unsupported webhook marketplace' });
  }

  try {
    const topic = req.headers['x-shopify-topic'];
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    const shopDomain = req.headers['x-shopify-shop-domain'];

    if (!topic || !hmacHeader || !shopDomain) {
      return res.status(400).json({ success: false, message: 'Missing required Shopify webhook headers' });
    }

    const connection = await MarketplaceConnection.findOne({
      storeUrl: shopDomain,
      marketplace: 'shopify'
    });

    if (!connection) {
      return res.status(404).json({ success: false, message: 'No active connection found for this shop domain' });
    }

    const apiSecret = process.env.SHOPIFY_API_SECRET;
    const isVerified = verifyShopifyWebhookHmac(req.rawBody || JSON.stringify(req.body), hmacHeader, apiSecret);
    if (!isVerified) {
      return res.status(401).json({ success: false, message: 'Webhook HMAC verification failed' });
    }

    const payload = req.body;
    console.log(`[Shopify Webhook] Received topic ${topic} for shop ${shopDomain}`);

    if (topic === 'products/create' || topic === 'products/update' || topic === 'inventory_levels/update') {
      const op = topic.startsWith('products/') ? 'IMPORT_PRODUCT_WEBHOOK' : 'IMPORT_INVENTORY_WEBHOOK';
      const MarketplaceSyncJobService = require('../services/MarketplaceSyncJobService');
      
      await MarketplaceSyncJobService.createJob({
        merchantId: connection.merchantId,
        productId: undefined,
        marketplace: 'shopify',
        operation: op,
        payload: {
          topic,
          body: payload,
          connectionId: connection._id
        }
      });
      
      return res.status(200).json({ success: true, message: 'Webhook job queued in background' });
    }
    else if (topic === 'products/delete') {
      const shopifyProductId = `gid://shopify/Product/${payload.id}`;
      await MarketplaceProduct.deleteMany({
        shopifyProductId,
        marketplace: 'shopify'
      });
    } 
    else if (topic === 'orders/create') {
      const shopifyOrderId = `shopify_${payload.id}`;
      let order = await Order.findOne({ orderId: shopifyOrderId });
      if (!order) {
        const items = [];
        for (const item of payload.line_items) {
          const mapping = await MarketplaceProduct.findOne({
            shopifyVariantId: `gid://shopify/ProductVariant/${item.variant_id}`,
            marketplace: 'shopify'
          });
          
          let productId = item.sku || `SHPFY-${item.variant_id}`;
          if (mapping) {
            productId = mapping.productId.toString();
            const localProduct = await Product.findById(mapping.productId);
            if (localProduct) {
              localProduct.stock = Math.max(0, localProduct.stock - item.quantity);
              localProduct.quantity = localProduct.stock;
              localProduct.skipShopifySync = true;
              await localProduct.save();
            }
          }

          items.push({
            productId,
            name: item.title,
            price: Number(item.price),
            quantity: item.quantity,
            category: 'Shopify Item'
          });
        }

        order = new Order({
          orderId: shopifyOrderId,
          merchantId: connection.merchantId,
          clientId: connection.merchantId,
          customerName: payload.customer ? `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim() : 'Shopify Customer',
          customerEmail: payload.customer?.email || '',
          items,
          orderSource: 'shopify',
          totalPrice: Number(payload.total_price) || 0,
          paymentMethod: payload.gateway || 'shopify',
          isPaid: payload.financial_status === 'paid',
          paymentStatus: payload.financial_status === 'paid' ? 'paid' : 'pending',
          orderStatus: 'placed',
          status: 'placed',
          shippingAddress: {
            fullName: payload.shipping_address ? `${payload.shipping_address.first_name || ''} ${payload.shipping_address.last_name || ''}`.trim() : '',
            email: payload.customer?.email || '',
            phone: payload.shipping_address?.phone || '',
            address: payload.shipping_address?.address1 || '',
            city: payload.shipping_address?.city || '',
            state: payload.shipping_address?.province || '',
            zipCode: payload.shipping_address?.zip || '',
            country: payload.shipping_address?.country || ''
          }
        });

        await order.save();
        console.log(`[Shopify Webhook] Created order ${shopifyOrderId} in Retail Verse`);
      }
    } 
    else if (topic === 'orders/updated') {
      const shopifyOrderId = `shopify_${payload.id}`;
      const order = await Order.findOne({ orderId: shopifyOrderId });
      if (order) {
        let changed = false;
        if (payload.financial_status === 'paid' && !order.isPaid) {
          order.isPaid = true;
          order.paymentStatus = 'paid';
          order.paidAt = new Date();
          changed = true;
        }
        if (changed) {
          await order.save();
          console.log(`[Shopify Webhook] Updated order payment status for ${shopifyOrderId}`);
        }
      }
    } 
    else if (topic === 'orders/cancelled') {
      const shopifyOrderId = `shopify_${payload.id}`;
      const order = await Order.findOne({ orderId: shopifyOrderId });
      if (order && order.status !== 'cancelled') {
        order.status = 'cancelled';
        order.orderStatus = 'cancelled';
        order.cancelledAt = new Date();
        await order.save();

        for (const item of order.items) {
          if (mongoose.Types.ObjectId.isValid(item.productId)) {
            const localProduct = await Product.findById(item.productId);
            if (localProduct) {
              localProduct.stock = localProduct.stock + item.quantity;
              localProduct.quantity = localProduct.stock;
              localProduct.skipShopifySync = true;
              await localProduct.save();
            }
          }
        }
        console.log(`[Shopify Webhook] Cancelled order ${shopifyOrderId} and refunded stock`);
      }
    } 
    else if (topic === 'app/uninstalled') {
      connection.status = 'disconnected';
      connection.credentials = {};
      connection.disconnectedAt = new Date();
      await connection.save();
      console.log(`[Shopify Webhook] App uninstalled for ${shopDomain}. Disconnected.`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(`[Shopify Webhook Handler Error]`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.syncShopify = async (req, res) => {
  try {
    const merchantId = getMerchantId(req);
    const merchantCandidates = getMerchantIdCandidates(req);

    console.log('[Shopify Sync Now] merchantId:', merchantId);
    console.log('[Shopify Sync Now] candidates:', merchantCandidates);

    const connection = await findWithMerchantFallback(MarketplaceConnection, {
      marketplace: 'shopify',
      status: 'connected'
    }, merchantCandidates);

    if (!connection) {
      return res.status(400).json({
        success: false,
        code: 'MARKETPLACE_CONNECTION_NOT_FOUND',
        message: 'No connected Shopify connection found for this merchant'
      });
    }

    console.log('[Shopify Sync Now] connectionId:', connection._id);
    console.log('[Shopify Sync Now] shopDomain:', connection.storeUrl || connection.shopDomain);

    const ShopifySyncService = require('../services/shopifySyncService');

    const health = await ShopifySyncService.checkConnectionHealth(connection);
    if (health.status !== 'healthy' && health.status !== 'action_required') {
      return res.status(400).json({
        success: false,
        code: 'CONNECTION_NOT_HEALTHY',
        message: health.message || 'Shopify connection is not healthy. Please reconnect.'
      });
    }

    if (health.missingScopes && health.missingScopes.length > 0) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_SCOPES',
        message: `Missing Shopify scopes: ${health.missingScopes.join(', ')}. Reconnect or reinstall the Shopify app after updating scopes.`,
        missingScopes: health.missingScopes
      });
    }

    const result = await ShopifySyncService.syncProducts(connection, merchantId);
    const reconStats = await ShopifySyncService.reconcileInventoryQuantities(connection, merchantId);

    console.log(`[Shopify Sync Now] Sync complete: synced=${result.synced}, failed=${result.failed}, skipped=${result.skipped}`);
    console.log(`[Shopify Sync Now] Reconciliation complete: checked=${reconStats.productsChecked}, updated=${reconStats.quantitiesUpdated}, matched=${reconStats.alreadyMatched}, failed=${reconStats.failed}`);

    res.status(200).json({
      success: true,
      syncRunId: result.syncRunId,
      message: `Shopify inventory sync and reconciliation completed: ${reconStats.quantitiesUpdated} updated, ${reconStats.alreadyMatched} already matched.`,
      productsChecked: reconStats.productsChecked,
      quantitiesUpdated: reconStats.quantitiesUpdated,
      alreadyMatched: reconStats.alreadyMatched,
      failed: reconStats.failed,
      shopDomain: reconStats.shopDomain,
      stats: {
        total: result.total,
        queued: result.queued,
        active: result.active,
        synced: result.synced,
        failed: result.failed,
        skipped: result.skipped
      },
      errors: result.errors || [],
      warnings: result.warnings || []
    });
  } catch (error) {
    console.error('[Shopify Sync Now] Error:', error.message);
    if (error.stack) console.error('[Shopify Sync Now] Stack:', error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getShopifySyncStatus = async (req, res) => {
  try {
    const merchantId = getMerchantId(req);
    const merchantCandidates = getMerchantIdCandidates(req);

    const connection = await findWithMerchantFallback(MarketplaceConnection, {
      marketplace: 'shopify',
      status: 'connected'
    }, merchantCandidates);

    if (!connection) {
      return res.status(200).json({
        success: true,
        queued: 0,
        processing: 0,
        synced: 0,
        successful: 0,
        completed: 0,
        failed: 0,
        notSynced: 0,
        lastSyncAt: null,
        totalProducts: 0,
        overallStatus: 'not_connected',
        syncStatus: 'not_connected'
      });
    }

    const ShopifySyncService = require('../services/shopifySyncService');
    const status = await ShopifySyncService.getSyncStatus(connection);

    res.status(200).json({
      success: true,
      queued: status.queued || 0,
      processing: status.active || 0,
      synced: status.synced || 0,
      successful: status.synced || 0,
      completed: status.synced || 0,
      failed: status.failed || 0,
      notSynced: Math.max(0, (status.total || 0) - (status.synced || 0) - (status.failed || 0)),
      totalProducts: status.total || 0,
      lastSyncAt: status.lastSyncAt || connection.lastSyncAt || null,
      overallStatus: status.status === 'running' ? 'syncing' : 'connected',
      syncStatus: status.status === 'running' ? 'syncing' : 'connected',
      errors: status.errors || [],
      warnings: status.warnings || []
    });
  } catch (error) {
    console.error('[Shopify Sync Status] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// ONE-WAY PRODUCT PUBLISHING: Retail Verse → Shopify
// ============================================================

const SHOPIFY_API_VERSION_PUBLISH = process.env.SHOPIFY_API_VERSION || '2024-07';

async function getShopifyLocation(connection, shopDomain, accessToken) {
  const bridgeGraphql = (shop, token, query, variables) => shopifyGraphqlRequest(shop, token, query, variables);
  const locationId = await resolveShopifyLocation(connection, shopDomain, accessToken, bridgeGraphql);
  return { shopifyLocationId: locationId };
}

function validateProductData(product) {
  const errors = [];
  if (!product.name && !product.title) {
    errors.push('Product must have a name or title');
  }
  if (product.price === undefined || product.price === null || isNaN(Number(product.price))) {
    errors.push('Product price must be a valid number (got: ' + JSON.stringify(product.price) + ')');
  }
  if (!product.sku) {
    errors.push('Product must have a SKU');
  }
  if (errors.length > 0) {
    throw new Error('Product validation failed: ' + errors.join('; '));
  }
}

function buildVariantUpdate(variantId, product) {
  const v = {
    price: String(Number(product.price) || 0)
  };
  if (variantId) {
    v.id = variantId;
  }
  const comparePrice = Number(product.comparePrice) || Number(product.originalPrice) || 0;
  if (comparePrice > 0 && comparePrice !== Number(product.price)) {
    v.compareAtPrice = String(comparePrice);
  }
  const weight = Number(product.weight) || 0;
  if (weight > 0) {
    v.weight = weight;
    v.weightUnit = 'KILOGRAMS';
  }
  v.inventoryItem = {
    tracked: true
  };
  if (product.sku) {
    v.inventoryItem.sku = product.sku;
  }
  if (product.barcode) {
    v.inventoryItem.barcode = String(product.barcode);
  }
  if (product.costPrice !== undefined || product.cost !== undefined) {
    const cost = Number(product.costPrice) || Number(product.cost) || 0;
    if (cost > 0) {
      v.inventoryItem.cost = String(cost);
    }
  }
  return v;
}

async function reconcileShopifyProduct(product, shopDomain, accessToken) {
  if (product.sku) {
    try {
      const skuResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
        query findVariantBySku($query: String!) {
          productVariants(first: 1, query: $query) {
            edges {
              node {
                id
                product {
                  id
                }
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      `, { query: `sku:${product.sku}` });
      const matchedVariant = skuResult.data?.productVariants?.edges?.[0]?.node;
      if (matchedVariant) {
        console.log(`[Shopify Publish] Reconciled product ${product._id} by SKU matching (${product.sku}).`);
        return {
          shopifyProductId: matchedVariant.product.id,
          shopifyVariantId: matchedVariant.id,
          inventoryItemId: matchedVariant.inventoryItem.id
        };
      }
    } catch (err) {
      console.warn(`[Shopify Publish] SKU reconciliation failed:`, err.message);
    }
  }

  for (const ns of ['retail_verse', 'retailverse']) {
    try {
      const metafieldResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
        query findProductByMetafield($query: String!) {
          products(first: 1, query: $query) {
            edges {
              node {
                id
                variants(first: 1) {
                  edges {
                    node {
                      id
                      inventoryItem {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `, { query: `metafield:${ns}.local_product_id:${product._id}` });
      const matchedNode = metafieldResult.data?.products?.edges?.[0]?.node;
      if (matchedNode) {
        console.log(`[Shopify Publish] Reconciled product ${product._id} by metafield matching (${ns}).`);
        const shopifyProductId = matchedNode.id;
        const defaultVariant = matchedNode.variants?.edges?.[0]?.node;
        return {
          shopifyProductId,
          shopifyVariantId: defaultVariant?.id,
          inventoryItemId: defaultVariant?.inventoryItem?.id
        };
      }
    } catch (err) {
      console.warn(`[Shopify Publish] Metafield (${ns}) reconciliation failed:`, err.message);
    }
  }

  return null;
}

async function checkShopifyProductExists(shopDomain, accessToken, shopifyProductId) {
  try {
    const result = await shopifyGraphqlRequest(shopDomain, accessToken, `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          status
        }
      }
    `, { id: shopifyProductId });
    return result.data?.product || null;
  } catch (err) {
    return null;
  }
}

async function syncSingleProduct(product, connection, shopDomain, accessToken, locationIdInput) {
  const result = { productId: product._id, sku: product.sku, status: 'not_synced', error: null, shopifyProductId: null, shopifyVariantId: null, isNew: false };

  // Validate product data before making any API calls
  try {
    validateProductData(product);
  } catch (valErr) {
    result.status = 'failed';
    result.error = valErr.message;
    return result;
  }

  // 1. Read authoritative Retail Verse stock
  let availableStock = 0;
  try {
    availableStock = await getAvailableStock(product._id);
  } catch (stockErr) {
    console.warn(`[Shopify Publish] Failed to read stock: ${stockErr.message}`);
  }

  const bridgeGraphql = (shop, token, query, variables) => shopifyGraphqlRequest(shop, token, query, variables);

  // 3. Resolve Location
  let locationId = locationIdInput;
  try {
    locationId = await resolveShopifyLocation(connection, shopDomain, accessToken, bridgeGraphql);
  } catch (locErr) {
    result.status = 'failed';
    result.error = locErr.message;
    return result;
  }

  if (!locationId) {
    result.status = 'failed';
    result.error = 'No active Shopify inventory location was found. Create or activate a location in Shopify and retry the sync.';
    return result;
  }

  let mapping = await MarketplaceProduct.findOne({
    connectionId: connection._id,
    localProductId: product._id
  });

  if (!mapping) {
    // Search reconciliation by SKU first, then Metafield
    const reconciled = await reconcileShopifyProduct(product, shopDomain, accessToken);
    if (reconciled) {
      mapping = await MarketplaceProduct.findOneAndUpdate(
        { connectionId: connection._id, localProductId: product._id },
        {
          merchantId: connection.merchantId,
          productId: product._id,
          connectionId: connection._id,
          shopDomain,
          marketplace: 'shopify',
          localProductId: product._id,
          shopifyProductId: reconciled.shopifyProductId,
          shopifyVariantId: reconciled.shopifyVariantId,
          inventoryItemId: reconciled.inventoryItemId,
          locationId: locationId || undefined,
          shopifyLocationId: locationId || undefined,
          listingStatus: 'active',
          syncStatus: 'success',
          lastSyncedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }
  }

  let shopifyProductId, shopifyVariantId, inventoryItemId;
  let isNewProduct = !mapping;

  try {
    if (!isNewProduct) {
      // 2. UPDATE EXISTING SHOPIFY PRODUCT
      shopifyProductId = mapping.shopifyProductId;
      shopifyVariantId = mapping.shopifyVariantId;
      inventoryItemId = mapping.inventoryItemId;

      // Validate that product exists on Shopify
      const existingProduct = await checkShopifyProductExists(shopDomain, accessToken, shopifyProductId);
      if (!existingProduct) {
        isNewProduct = true;
      } else {
        const productInput = {
          id: shopifyProductId,
          title: product.name || product.title,
          descriptionHtml: product.description || '',
          vendor: product.brand || product.vendor || 'Retail Verse',
          productType: product.category || 'General',
          status: product.isActive !== false ? 'ACTIVE' : 'DRAFT',
          tags: product.tags && Array.isArray(product.tags) ? product.tags.join(', ') : ''
        };

        const productUpdateRes = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
          mutation UpdateProduct(
            $product: ProductUpdateInput!
            $media: [CreateMediaInput!]
          ) {
            productUpdate(product: $product, media: $media) {
              product {
                id
                title
                status
                handle
                variants(first: 100) {
                  nodes {
                    id
                    sku
                    inventoryItem { id tracked }
                  }
                }
              }
              userErrors { field message }
            }
          }
        `, { product: productInput, media: [] }));

        const prodErrors = productUpdateRes.data?.productUpdate?.userErrors || [];
        if (prodErrors.length > 0) {
          throw new Error('Product update user errors: ' + prodErrors.map(e => e.message).join('; '));
        }

        // Update variant details
        if (shopifyVariantId) {
          const variantInput = buildVariantUpdate(shopifyVariantId, product);
          const variantUpdateRes = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
            mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                userErrors { field message }
              }
            }
          `, { productId: shopifyProductId, variants: [variantInput] }));

          const varErrors = variantUpdateRes.data?.productVariantsBulkUpdate?.userErrors || [];
          if (varErrors.length > 0) {
            console.warn('[Publish] Variant update warning for SKU ' + product.sku + ': ' + varErrors.map(e => e.message).join('; '));
          }
        }
        result.isNew = false;
      }
    }

    if (isNewProduct) {
      // 2. CREATE NEW SHOPIFY PRODUCT
      const productInput = {
        title: product.name || product.title || 'Untitled Product',
        descriptionHtml: product.description || '',
        vendor: product.brand || product.vendor || 'Retail Verse',
        productType: product.category || 'General',
        status: product.isActive !== false ? 'ACTIVE' : 'DRAFT',
        tags: product.tags && Array.isArray(product.tags) ? product.tags.join(', ') : '',
        metafields: [
          {
            namespace: 'retail_verse',
            key: 'local_product_id',
            value: String(product._id),
            type: 'single_line_text_field'
          }
        ]
      };

      const createResult = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
        mutation CreateProduct(
          $product: ProductCreateInput!
          $media: [CreateMediaInput!]
        ) {
          productCreate(product: $product, media: $media) {
            product {
              id
              title
              status
              handle
              variants(first: 100) {
                nodes {
                  id
                  sku
                  price
                  inventoryItem { id tracked }
                }
              }
            }
            userErrors { field message }
          }
        }
      `, { product: productInput, media: [] }));

      const payload = createResult.data?.productCreate;
      const errors = payload?.userErrors || [];
      if (errors.length > 0) {
        throw new Error('Product create user errors: ' + errors.map(e => e.message).join('; '));
      }

      const createdProduct = payload?.product;
      if (!createdProduct) {
        throw new Error('Failed to create Shopify product.');
      }

      shopifyProductId = createdProduct.id;
      const defaultVariant = createdProduct.variants?.nodes?.[0];
      shopifyVariantId = defaultVariant?.id;
      inventoryItemId = defaultVariant?.inventoryItem?.id;

      if (shopifyVariantId) {
        const variantInput = buildVariantUpdate(shopifyVariantId, product);
        const variantResult = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }
        `, { productId: shopifyProductId, variants: [variantInput] }));

        const varErrors = variantResult.data?.productVariantsBulkUpdate?.userErrors || [];
        if (varErrors.length > 0) {
          console.warn('[Publish] Variant update warning: ' + varErrors.map(e => e.message).join('; '));
        }
      }
      result.isNew = true;
    }

    // 4. Retrieve Shopify Variant and Inventory Item ID if missing
    if (!inventoryItemId && shopifyProductId) {
      const detailsResult = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
        query getProductDetails($id: ID!) {
          product(id: $id) {
            id
            variants(first: 100) {
              nodes {
                id
                sku
                inventoryItem { id tracked }
              }
            }
          }
        }
      `, { id: shopifyProductId }));
      const variants = detailsResult.data?.product?.variants?.nodes || [];
      let matchedVariant = variants.find(v => v.sku === product.sku);
      if (!matchedVariant && variants.length > 0) {
        matchedVariant = variants[0];
      }
      shopifyVariantId = matchedVariant?.id;
      inventoryItemId = matchedVariant?.inventoryItem?.id;
    }

    if (!inventoryItemId) {
      throw new Error('Failed to resolve Shopify inventoryItem ID');
    }

    // Structured logging start
    console.log(`[ShopifyInventorySync] Start`);
    console.log(`[ShopifyInventorySync] Retail Verse product ID: ${product._id}`);
    console.log(`[ShopifyInventorySync] SKU: ${product.sku}`);
    console.log(`[ShopifyInventorySync] Source stock: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Shopify product ID: ${shopifyProductId}`);
    console.log(`[ShopifyInventorySync] Shopify variant ID: ${shopifyVariantId}`);
    console.log(`[ShopifyInventorySync] Inventory item ID: ${inventoryItemId}`);
    console.log(`[ShopifyInventorySync] Location ID: ${locationId}`);

    // 5. Enable Inventory Tracking
    const trackingQuery = `
      query GetInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          id
          tracked
        }
      }
    `;
    const trackingResult = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, trackingQuery, { id: inventoryItemId }));
    const isTracked = trackingResult.data?.inventoryItem?.tracked || false;
    console.log(`[ShopifyInventorySync] Tracking enabled: ${isTracked}`);

    await ensureInventoryTracking(shopDomain, accessToken, inventoryItemId, isTracked, bridgeGraphql);

    // 6. Activate Inventory Item at Location
    await activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId, bridgeGraphql);

    // 7. Set Absolute Stock Quantity
    await setShopifyStock(shopDomain, accessToken, inventoryItemId, locationId, availableStock, product._id, bridgeGraphql);

    // 11. Verify Quantity
    const verifiedQty = await verifyShopifyInventory(shopDomain, accessToken, inventoryItemId, locationId, availableStock, bridgeGraphql);
    console.log(`[ShopifyInventorySync] Expected quantity: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Actual quantity: ${verifiedQty}`);
    console.log(`[ShopifyInventorySync] Completed`);

    // Sync Images
    const productImages = product.images && product.images.length > 0
      ? product.images
      : (product.image ? [product.image] : []);

    if (productImages.length > 0) {
      try {
        const existingData = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
          query getProductImages($id: ID!) {
            product(id: $id) {
              images(first: 50) {
                nodes { url }
              }
            }
          }
        `, { id: shopifyProductId }));

        const existingUrls = (existingData.data?.product?.images?.nodes || []).map(img => img.url.split('?')[0]);
        const imagesToUpload = productImages.filter(url => {
          const cleanUrl = url.split('?')[0];
          return !existingUrls.some(existUrl => existUrl.includes(cleanUrl) || cleanUrl.includes(existUrl));
        });

        if (imagesToUpload.length > 0) {
          await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
            mutation productImagesCreate($productId: ID!, $images: [ImageInput!]!) {
              productImagesCreate(productId: $productId, images: $images) {
                userErrors { field message }
              }
            }
          `, { productId: shopifyProductId, images: imagesToUpload.map(u => ({ src: u })) }));
        }
      } catch (imgErr) {
        console.warn('[Publish] Image sync warning for ' + product.sku + ': ' + imgErr.message);
      }
    }

    // 9. Save Sync Mapping and Status
    // Use 'success' as the canonical synced status so all modules agree
    await MarketplaceProduct.findOneAndUpdate(
      { connectionId: connection._id, localProductId: product._id },
      {
        merchantId: connection.merchantId,
        productId: product._id,
        connectionId: connection._id,
        shopDomain,
        marketplace: 'shopify',
        localProductId: product._id,
        shopifyProductId,
        shopifyVariantId,
        shopifyInventoryItemId: inventoryItemId,
        inventoryItemId,
        locationId,
        shopifyLocationId: locationId,
        listingStatus: 'active',
        syncStatus: 'success',
        lastSyncedAt: new Date(),
        lastError: '',
        syncError: ''
      },
      { upsert: true, new: true }
    );

    result.status = 'synced';
    result.shopifyProductId = shopifyProductId;
    result.shopifyVariantId = shopifyVariantId;

  } catch (err) {
    console.error(`[ShopifyInventorySync] Failed: ${err.message}`);
    console.log(`[ShopifyInventorySync] GraphQL userErrors: ${err.message}`);
    console.log(`[ShopifyInventorySync] Failed`);

    const errMsg = err.message;
    result.status = 'failed';
    result.error = errMsg;

    let detailStatus = 'inventory_sync_failed';
    if (!product.sku) {
      detailStatus = 'missing_sku';
    } else if (!locationId) {
      detailStatus = 'missing_location';
    } else if (errMsg.includes('scope') || errMsg.includes('permission')) {
      detailStatus = 'missing_permission';
    } else if (errMsg.includes('token') || errMsg.includes('unauthorized') || errMsg.includes('401')) {
      detailStatus = 'reconnection_required';
    }

    await MarketplaceProduct.findOneAndUpdate(
      { connectionId: connection._id, localProductId: product._id },
      {
        merchantId: connection.merchantId,
        productId: product._id,
        connectionId: connection._id,
        shopDomain,
        marketplace: 'shopify',
        localProductId: product._id,
        shopifyProductId: shopifyProductId || mapping?.shopifyProductId,
        shopifyVariantId: shopifyVariantId || mapping?.shopifyVariantId,
        inventoryItemId: inventoryItemId || mapping?.inventoryItemId,
        locationId: locationId || mapping?.locationId,
        shopifyLocationId: locationId || mapping?.shopifyLocationId,
        listingStatus: 'active',
        syncStatus: detailStatus,
        syncError: errMsg.substring(0, 500),
        lastError: errMsg.substring(0, 500),
        lastSyncedAt: new Date()
      },
      { upsert: true, new: true }
    );
  }

  return result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.publishToShopify = async (req, res) => {
  const { marketplaceAccountId } = req.params;
  const merchantCandidates = getMerchantIdCandidates(req);

  try {
    const connection = await findWithMerchantFallback(MarketplaceConnection, { _id: marketplaceAccountId }, merchantCandidates);
    if (!connection) {
      return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    if (connection.marketplace !== 'shopify') {
      return res.status(400).json({ success: false, message: 'This endpoint is only for Shopify connections' });
    }

    if (!connection.credentials?.encryptedAccessToken) {
      return res.status(400).json({ success: false, message: 'Shopify access token not found. Reconnect the account.' });
    }

    const shopDomain = connection.storeUrl || connection.shopDomain;
    const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);

    if (!shopDomain) {
      return res.status(400).json({ success: false, message: 'Shop domain not configured' });
    }

    const location = await getShopifyLocation(connection, shopDomain, accessToken);
    const locationId = location?.shopifyLocationId;

    const merchantId = getMerchantId(req);
    const products = await Product.find({
      $or: [
        { clientId: merchantId },
        { merchantId: merchantId }
      ]
    }).lean();

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No products found to publish',
        stats: { total: 0, synced: 0, failed: 0, skipped: 0 }
      });
    }

    // Process products with batching and rate limiting
    const BATCH_SIZE = 5;
    const RATE_LIMIT_DELAY_MS = 500;
    const results = [];
    let syncedCount = 0;
    let publishedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (product) => {
          await sleep(Math.random() * 200);
          return syncSingleProduct(product, connection, shopDomain, accessToken, locationId);
        })
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          const r = settled.value;
          results.push(r);
          if (r.status === 'synced') {
            syncedCount++;
            if (r.isNew) publishedCount++;
            else updatedCount++;
          } else if (r.status === 'failed') failedCount++;
          else skippedCount++;
        } else {
          results.push({
            productId: 'unknown',
            sku: 'unknown',
            status: 'failed',
            error: settled.reason?.message || 'Unknown error',
            isNew: false
          });
          failedCount++;
        }
      }

      await MarketplaceSyncLog.create({
        merchantId: connection.merchantId,
        connectionId: connection._id,
        marketplace: 'shopify',
        action: 'PUBLISH_BATCH',
        level: 'info',
        message: 'Processed batch ' + (Math.floor(i / BATCH_SIZE) + 1) + '/' + Math.ceil(products.length / BATCH_SIZE) + ': ' + batchResults.filter(r => r.status === 'fulfilled' && r.value?.status === 'synced').length + ' synced, ' + batchResults.filter(r => r.status === 'rejected' || r.value?.status === 'failed').length + ' failed'
      });

      if (i + BATCH_SIZE < products.length) {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }

    // Update connection
    connection.lastSyncAt = new Date();
    connection.lastSuccessfulSync = connection.lastSyncAt;
    connection.apiHealth = {
      ...connection.apiHealth,
      status: failedCount === 0 ? 'healthy' : 'warning',
      lastCheckedAt: new Date(),
      lastSuccessAt: new Date(),
      lastError: failedCount > 0 ? failedCount + ' product(s) failed to sync' : ''
    };
    await connection.save();

    const errorsList = results
      .filter(r => r.status === 'failed' && r.error)
      .map(r => ({ productName: r.productName || r.productId, sku: r.sku, error: r.error }));

    await MarketplaceSyncLog.create({
      merchantId: connection.merchantId,
      connectionId: connection._id,
      marketplace: 'shopify',
      action: 'PUBLISH_COMPLETE',
      level: failedCount > 0 ? 'warn' : 'info',
      message: 'Publishing complete: ' + syncedCount + ' synced (' + publishedCount + ' new, ' + updatedCount + ' updated), ' + failedCount + ' failed, ' + skippedCount + ' skipped out of ' + products.length + ' total products'
    });

    // Mark failed product mappings
    for (const r of results) {
      if (r.status === 'failed' && r.productId) {
        await MarketplaceProduct.findOneAndUpdate(
          { connectionId: connection._id, localProductId: r.productId },
          {
            $set: {
              syncStatus: 'failed',
              syncError: (r.error || 'Unknown error').substring(0, 500),
              lastSyncedAt: new Date()
            }
          },
          { upsert: true }
        ).catch(err => console.warn('[Publish] Failed to update error mapping: ' + err.message));
      }
    }

    res.status(200).json({
      success: true,
      message: 'Published ' + publishedCount + ' products to Shopify, updated ' + updatedCount + '. ' + failedCount + ' failed.',
      total: products.length,
      published: publishedCount,
      updated: updatedCount,
      failed: failedCount,
      lastSyncAt: connection.lastSyncAt,
      errors: errorsList,
      stats: {
        total: products.length,
        synced: syncedCount,
        published: publishedCount,
        updated: updatedCount,
        failed: failedCount,
        skipped: skippedCount
      },
      results: results.map(r => ({
        productId: r.productId,
        sku: r.sku,
        status: r.status,
        error: r.error,
        shopifyProductId: r.shopifyProductId,
        shopifyVariantId: r.shopifyVariantId
      }))
    });
  } catch (error) {
    const errMessage = error.message || 'Unknown error';
    const statusCode = error.statusCode || 500;
    console.error('[PublishToShopify] Error:', errMessage);
    if (error.stack) console.error('[PublishToShopify] Stack:', error.stack);

    const logMessage = 'Publishing failed: ' + errMessage;
    await MarketplaceSyncLog.create({
      merchantId: getMerchantId(req),
      connectionId: marketplaceAccountId,
      marketplace: 'shopify',
      action: 'PUBLISH_ERROR',
      level: 'error',
      message: logMessage
    }).catch(function() {});

    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: errMessage,
      statusCode: statusCode,
      shopifyError: error.responseBody || null,
      total: 0,
      published: 0,
      updated: 0,
      failed: 0,
      lastSyncAt: null,
      errors: [{ error: errMessage }],
      stats: null,
      results: []
    });
  }
};

exports.syncToShopify = async (req, res) => {
  const { marketplaceAccountId } = req.params;
  const merchantCandidates = getMerchantIdCandidates(req);

  try {
    const connection = await findWithMerchantFallback(MarketplaceConnection, { _id: marketplaceAccountId }, merchantCandidates);
    if (!connection) {
      return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    if (connection.marketplace !== 'shopify') {
      return res.status(400).json({ success: false, message: 'This endpoint is only for Shopify connections' });
    }

    if (connection.status !== 'connected') {
      return res.status(400).json({ success: false, message: 'Shopify connection is not active. Reconnect the account.' });
    }

    if (!connection.credentials?.encryptedAccessToken) {
      return res.status(400).json({ success: false, message: 'Shopify access token not found. Reconnect the account.' });
    }

    const shopDomain = connection.storeUrl || connection.shopDomain;
    if (!shopDomain) {
      return res.status(400).json({ success: false, message: 'Shop domain not configured' });
    }

    const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);

    // STEP 3: Verify Connected Shopify Store Runtime Verification
    let normalizedShopDomain;
    try {
      normalizedShopDomain = normalizeShopDomain(shopDomain);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid shop domain configuration: ' + e.message });
    }

    const expectedDomain = 'retail-verse-test.myshopify.com';
    if (normalizedShopDomain !== expectedDomain) {
      return res.status(400).json({
        success: false,
        message: `Sync aborted: Connected shop domain (${normalizedShopDomain}) does not match expected store domain (${expectedDomain}).`
      });
    }

    try {
      const shopCheck = await shopifyGraphqlRequest(normalizedShopDomain, accessToken, `
        query {
          shop {
            myshopifyDomain
            name
          }
        }
      `);
      const returnedDomain = shopCheck.data?.shop?.myshopifyDomain;
      if (returnedDomain !== expectedDomain) {
        return res.status(400).json({
          success: false,
          message: `Sync aborted: Shopify API returned shop domain (${returnedDomain}) which does not match (${expectedDomain}).`
        });
      }
    } catch (shopErr) {
      return res.status(400).json({
        success: false,
        message: `Failed runtime verification for store ${expectedDomain}: ${shopErr.message}`
      });
    }

    // Fetch Shopify location for inventory
    const location = await getShopifyLocation(connection, normalizedShopDomain, accessToken);
    const locationId = location?.shopifyLocationId;

    // STEP 5: Query source-of-truth local products across candidate tenant IDs
    const candidateIds = getMerchantIdCandidates(req);
    if (connection.merchantId && !candidateIds.includes(String(connection.merchantId))) {
      candidateIds.push(String(connection.merchantId));
    }

    let products = await Product.find({
      $or: [
        { clientId: { $in: candidateIds } },
        { merchantId: { $in: candidateIds } },
        { createdBy: { $in: candidateIds } }
      ],
      isActive: true
    }).lean();

    if (!products || products.length === 0) {
      products = await Product.find({ isActive: true }).lean();
    }

    // Add diagnostic logging showing local products found
    console.log(`[ShopifySyncDiagnostic] Total local products found for sync: ${products.length}`);
    for (const p of products) {
      console.log(`[ShopifySyncDiagnostic] ID: ${p._id} | Title: ${p.name || p.title} | SKU: ${p.sku} | tenantId: ${p.clientId || p.merchantId} | syncStatus: ${p.status || 'active'}`);
    }

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active products found to sync',
        localProductsFound: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        synced: 0,
        failed: 0,
        shopDomain: normalizedShopDomain,
        lastSyncAt: connection.lastSyncAt || null,
        errors: []
      });
    }

    // Filter valid vs skipped products
    const validProducts = [];
    let skippedCount = 0;
    const skippedList = [];

    for (const p of products) {
      if (!p.name && !p.title) {
        skippedCount++;
        skippedList.push({
          productName: 'Untitled Product',
          sku: p.sku || 'N/A',
          error: 'Missing product name or title'
        });
        continue;
      }
      if (!p.sku) {
        skippedCount++;
        skippedList.push({
          productName: p.name || p.title,
          sku: 'N/A',
          error: 'Missing SKU'
        });
        continue;
      }
      validProducts.push(p);
    }

    // Process products with batching and rate limiting
    const BATCH_SIZE = 5;
    const RATE_LIMIT_DELAY_MS = 500;
    const results = [];
    let createdCount = 0;
    let updatedCount = 0;
    let syncedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < validProducts.length; i += BATCH_SIZE) {
      const batch = validProducts.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (product) => {
          await sleep(Math.random() * 200);
          return syncSingleProduct(product, connection, normalizedShopDomain, accessToken, locationId);
        })
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          const r = settled.value;
          results.push(r);
          if (r.status === 'synced') {
            syncedCount++;
            if (r.isNew) createdCount++;
            else updatedCount++;
          } else if (r.status === 'failed') {
            failedCount++;
          }
        } else {
          results.push({
            productId: 'unknown',
            sku: 'unknown',
            status: 'failed',
            error: settled.reason?.message || 'Unknown error',
            isNew: false
          });
          failedCount++;
        }
      }

      await MarketplaceSyncLog.create({
        merchantId: connection.merchantId,
        connectionId: connection._id,
        marketplace: 'shopify',
        action: 'SYNC_BATCH',
        level: 'info',
        message: 'Processed batch ' + (Math.floor(i / BATCH_SIZE) + 1) + '/' + Math.ceil(validProducts.length / BATCH_SIZE) + ': ' + batchResults.filter(r => r.status === 'fulfilled' && r.value?.status === 'synced').length + ' synced, ' + batchResults.filter(r => r.status === 'rejected' || r.value?.status === 'failed').length + ' failed'
      });

      if (i + BATCH_SIZE < validProducts.length) {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }

    // Update connection timestamp
    connection.lastSyncAt = new Date();
    connection.lastSuccessfulSync = connection.lastSyncAt;
    connection.apiHealth = {
      ...connection.apiHealth,
      status: failedCount === 0 ? 'healthy' : 'warning',
      lastCheckedAt: new Date(),
      lastSuccessAt: new Date(),
      lastError: failedCount > 0 ? failedCount + ' product(s) failed to sync' : ''
    };
    await connection.save();

    // Build error list with product names
    const errorsList = results
      .filter(r => r.status === 'failed' && r.error)
      .map(r => {
        const product = products.find(p => String(p._id) === String(r.productId));
        return {
          productName: product?.name || product?.title || r.productId,
          sku: r.sku || 'N/A',
          error: r.error
        };
      });

    // Mark failed product mappings
    for (const r of results) {
      if (r.status === 'failed' && r.productId) {
        await MarketplaceProduct.findOneAndUpdate(
          { connectionId: connection._id, localProductId: r.productId },
          {
            $set: {
              syncStatus: 'failed',
              syncError: (r.error || 'Unknown error').substring(0, 500),
              lastSyncedAt: new Date()
            }
          },
          { upsert: true }
        ).catch(err => console.warn('[SyncToShopify] Failed to update error mapping: ' + err.message));
      }
    }

    await MarketplaceSyncLog.create({
      merchantId: connection.merchantId,
      connectionId: connection._id,
      marketplace: 'shopify',
      action: 'SYNC_COMPLETE',
      level: failedCount > 0 ? 'warn' : 'info',
      message: 'Sync complete: ' + syncedCount + ' synced (' + createdCount + ' new, ' + updatedCount + ' updated), ' + failedCount + ' failed, ' + skippedCount + ' skipped out of ' + products.length + ' total products'
    });

    res.status(200).json({
      success: true,
      message: `Synced ${syncedCount} products (${createdCount} created, ${updatedCount} updated). ${failedCount} failed. ${skippedCount} skipped.`,
      localProductsFound: products.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
      synced: syncedCount,
      shopDomain: normalizedShopDomain,
      lastSyncAt: connection.lastSyncAt,
      errors: [...errorsList, ...skippedList],
      results: results
    });
  } catch (error) {
    const errMessage = error.message || 'Unknown error';
    const statusCode = error.statusCode || 500;
    console.error('[SyncToShopify] Error:', errMessage);
    if (error.stack) console.error('[SyncToShopify] Stack:', error.stack);

    await MarketplaceSyncLog.create({
      merchantId: getMerchantId(req),
      connectionId: marketplaceAccountId,
      marketplace: 'shopify',
      action: 'SYNC_ERROR',
      level: 'error',
      message: 'Sync failed: ' + errMessage
    }).catch(function() {});

    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: errMessage,
      statusCode: statusCode,
      shopifyError: error.responseBody || null,
      localProductsFound: 0,
      created: 0,
      updated: 0,
      synced: 0,
      failed: 0,
      lastSyncAt: null,
      errors: [{ productName: 'N/A', sku: 'N/A', error: errMessage }]
    });
  }
};

exports.getProductSyncStatuses = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const merchantCandidates = getMerchantIdCandidates(req);

    const connection = await findWithMerchantFallback(MarketplaceConnection, { _id: connectionId }, merchantCandidates);
    if (!connection) {
      return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    const merchantId = getMerchantId(req);
    const products = await Product.find({
      $or: [{ clientId: merchantId }, { merchantId: merchantId }]
    }).lean();

    const mappings = await MarketplaceProduct.find({
      connectionId,
      merchantId: { $in: merchantCandidates }
    }).lean();

    const mappingMap = {};
    for (const m of mappings) {
      const pid = (m.localProductId || m.productId)?.toString();
      if (pid) mappingMap[pid] = m;
    }

    const productStatuses = products.map(p => {
      const pid = p._id.toString();
      const map = mappingMap[pid];
      return {
        _id: p._id,
        name: p.name || p.title,
        sku: p.sku,
        image: p.image,
        status: map?.syncStatus || 'not_synced',
        shopifyProductId: map?.shopifyProductId || null,
        shopifyVariantId: map?.shopifyVariantId || null,
        error: map?.syncError || map?.lastError || null,
        lastSyncedAt: map?.lastSyncedAt || null,
        price: p.price,
        stock: p.stock
      };
    });

    res.status(200).json({
      success: true,
      products: productStatuses,
      stats: {
        total: productStatuses.length,
        synced: productStatuses.filter(p => p.status === 'synced').length,
        failed: productStatuses.filter(p => p.status === 'failed').length,
        syncing: productStatuses.filter(p => p.status === 'syncing').length,
        notSynced: productStatuses.filter(p => p.status === 'not_synced').length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.retryProductSync = async (req, res) => {
  try {
    const { productId } = req.params;
    const merchantCandidates = getMerchantIdCandidates(req);

    const product = await Product.findOne({ _id: productId });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const connection = await MarketplaceConnection.findOne({
      merchantId: { $in: merchantCandidates },
      marketplace: 'shopify',
      status: 'connected'
    });

    if (!connection) {
      return res.status(404).json({ success: false, message: 'No active Shopify connection found' });
    }

    const shopDomain = connection.storeUrl || connection.shopDomain;
    const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);
    const location = await getShopifyLocation(connection, shopDomain, accessToken);
    const locationId = location?.shopifyLocationId;

    await MarketplaceProduct.findOneAndUpdate(
      { connectionId: connection._id, localProductId: product._id },
      { $set: { syncStatus: 'syncing', syncError: '', lastSyncedAt: new Date() } },
      { upsert: true }
    );

    const result = await syncSingleProduct(product, connection, shopDomain, accessToken, locationId);

    res.status(200).json({
      success: true,
      message: result.status === 'synced' ? 'Product synced successfully' : 'Product sync failed: ' + (result.error || 'Unknown error'),
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.retryFailedSyncs = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const merchantCandidates = getMerchantIdCandidates(req);

    const connection = await findWithMerchantFallback(MarketplaceConnection, { _id: connectionId }, merchantCandidates);
    if (!connection) {
      return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    if (connection.marketplace !== 'shopify') {
      return res.status(400).json({ success: false, message: 'Only Shopify connections supported' });
    }

    const failedMappings = await MarketplaceProduct.find({
      connectionId,
      syncStatus: 'failed'
    });

    if (failedMappings.length === 0) {
      return res.status(200).json({ success: true, message: 'No failed products to retry', retried: 0 });
    }

    const shopDomain = connection.storeUrl || connection.shopDomain;
    const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);
    const location = await getShopifyLocation(connection, shopDomain, accessToken);
    const locationId = location?.shopifyLocationId;

    let retried = 0;
    let stillFailed = 0;

    for (const mapping of failedMappings) {
      try {
        const product = await Product.findById(mapping.localProductId || mapping.productId).lean();
        if (!product) { stillFailed++; continue; }

        mapping.syncStatus = 'syncing';
        mapping.syncError = '';
        await mapping.save();

        const resSync = await syncSingleProduct(product, connection, shopDomain, accessToken, locationId);
        if (resSync.status === 'synced') retried++;
        else stillFailed++;
      } catch (err) {
        stillFailed++;
        await MarketplaceProduct.findOneAndUpdate(
          { _id: mapping._id },
          { $set: { syncStatus: 'failed', syncError: (err.message || '').substring(0, 500) } }
        );
      }

      await sleep(300);
    }

    await MarketplaceSyncLog.create({
      merchantId: connection.merchantId,
      connectionId: connection._id,
      marketplace: 'shopify',
      action: 'RETRY_FAILED',
      level: stillFailed > 0 ? 'warn' : 'info',
      message: 'Retried ' + (retried + stillFailed) + ' failed products: ' + retried + ' succeeded, ' + stillFailed + ' still failed'
    });

    res.status(200).json({
      success: true,
      message: 'Retried ' + (retried + stillFailed) + ' products: ' + retried + ' succeeded, ' + stillFailed + ' still failed',
      retried,
      stillFailed
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

