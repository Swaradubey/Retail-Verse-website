const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const MarketplaceSyncJob = require('../models/MarketplaceSyncJob');

const SYNC_STATUS_PRIORITY = {
  processing: 1,
  queued: 2,
  failed: 3,
  synced: 4,
  not_synced: 5,
  not_connected: 6
};

async function computeProductMarketplaceStatuses({ merchantId, productIds, provider = 'shopify' }) {
  const connections = await MarketplaceConnection.find({
    merchantId,
    marketplace: provider,
    status: 'connected'
  }).lean();

  if (!connections || connections.length === 0) {
    const none = {};
    for (const pid of productIds) {
      none[pid.toString()] = [];
    }
    return none;
  }

  const connectionIds = connections.map(c => c._id);

  const mappings = await MarketplaceProduct.find({
    connectionId: { $in: connectionIds },
    marketplace: provider,
    $or: [
      { localProductId: { $in: productIds } },
      { productId: { $in: productIds } }
    ]
  }).lean();

  const jobs = await MarketplaceSyncJob.find({
    connectionId: { $in: connectionIds },
    productId: { $in: productIds },
    marketplace: provider
  }).sort({ createdAt: -1 }).lean();

  const mappingsByProduct = {};
  for (const m of mappings) {
    const key = m.localProductId?.toString() || m.productId?.toString();
    if (!mappingsByProduct[key]) mappingsByProduct[key] = [];
    mappingsByProduct[key].push(m);
  }

  const jobsByProduct = {};
  for (const j of jobs) {
    const key = j.productId?.toString();
    if (!jobsByProduct[key]) jobsByProduct[key] = [];
    jobsByProduct[key].push(j);
  }

  // All statuses treated as a successful sync (single source of truth)
  const SYNCED_STATUSES = new Set(['success', 'synced', 'inventory_synced']);

  const result = {};
  for (const pid of productIds) {
    const pidStr = pid.toString();
    const productStatuses = [];

    for (const conn of connections) {
      const connId = conn._id.toString();
      const productMappings = mappingsByProduct[pidStr]?.filter(m => m.connectionId?.toString() === connId) || [];
      const productJobs = jobsByProduct[pidStr]?.filter(j => j.connectionId?.toString() === connId) || [];

      const status = determineProductStatus(productMappings, productJobs);

      const validMapping = productMappings.find(m =>
        SYNCED_STATUSES.has(m.syncStatus) &&
        m.shopifyProductId &&
        m.connectionId?.toString() === connId
      );

      productStatuses.push({
        provider,
        connectionId: conn._id,
        accountName: conn.accountName || conn.shopDomain || provider,
        status,
        externalProductId: validMapping?.shopifyProductId || null,
        shopifyProductId: validMapping?.shopifyProductId || null,
        shopifyVariantId: validMapping?.shopifyVariantId || null,
        inventoryItemId: validMapping?.inventoryItemId || validMapping?.shopifyInventoryItemId || null,
        lastSyncedAt: validMapping?.lastSyncedAt || null,
        error: null
      });
    }

    result[pidStr] = productStatuses;
  }

  return result;
}

function determineProductStatus(mappings, jobs) {
  const activeJobs = jobs.filter(j => !j.completedAt);
  const processingJob = activeJobs.find(j => j.status === 'processing');
  if (processingJob) return 'processing';

  const queuedJob = activeJobs.find(j => j.status === 'pending' || j.status === 'retrying');
  if (queuedJob) return 'queued';

  const latestJob = jobs.length > 0 ? jobs.reduce((a, b) => new Date(a.createdAt) > new Date(b.createdAt) ? a : b) : null;
  if (latestJob && latestJob.status === 'failed') return 'failed';

  // All of these represent a successfully synced product
  const SYNCED_STATUSES = new Set(['success', 'synced', 'inventory_synced']);

  const successfulMapping = mappings.find(m =>
    SYNCED_STATUSES.has(m.syncStatus) &&
    m.shopifyProductId
  );
  if (successfulMapping) return 'synced';

  const anyMapping = mappings.length > 0;
  if (anyMapping) {
    const hasFailedMapping = mappings.some(m => m.syncStatus === 'failed');
    if (hasFailedMapping) return 'failed';
    return 'not_synced';
  }

  return 'not_synced';
}

async function attachMarketplaceStatusToProducts({ products, merchantId, provider = 'shopify' }) {
  const productIds = products.map(p => p._id);
  const statusMap = await computeProductMarketplaceStatuses({ merchantId, productIds, provider });

  return products.map(p => {
    const pObj = p.toObject ? p.toObject({ virtuals: true }) : { ...p };
    const pid = p._id.toString();
    const statuses = statusMap[pid] || [];

    pObj.marketplaces = statuses.map(s => ({
      provider: s.provider,
      connectionId: s.connectionId,
      accountName: s.accountName,
      status: s.status,
      externalProductId: s.externalProductId,
      shopifyProductId: s.shopifyProductId,
      shopifyVariantId: s.shopifyVariantId,
      inventoryItemId: s.inventoryItemId,
      lastSyncedAt: s.lastSyncedAt
    }));

    return pObj;
  });
}

module.exports = {
  computeProductMarketplaceStatuses,
  attachMarketplaceStatusToProducts,
  determineProductStatus,
  SYNC_STATUS_PRIORITY
};
