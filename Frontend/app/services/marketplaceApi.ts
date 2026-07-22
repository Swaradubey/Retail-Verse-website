import api from '../api/apiService';

const PAGE_NAME = 'Marketplace API';

export const getMarketplaces = async () => {
  const response = await api.get('/api/marketplaces', { pageName: PAGE_NAME });
  return response.data || response;
};

export const getMarketplaceConnections = async () => {
  const response = await api.get('/api/marketplaces/connections', { pageName: PAGE_NAME });
  return response.data || response;
};

export const startMarketplaceOAuth = async (code: string, shopDomain?: string) => {
  const url = shopDomain 
    ? `/api/marketplaces/${code}/connect?shopDomain=${encodeURIComponent(shopDomain)}` 
    : `/api/marketplaces/${code}/connect`;
  
  const response = await api.post(url, {}, { pageName: PAGE_NAME });
  return response.data || response;
};

export const connectMarketplaceWithCredentials = async (type: string, credentials: any) => {
  const response = await api.post(`/api/marketplaces/${type}/connect`, credentials, { pageName: PAGE_NAME });
  return response.data || response;
};

export const disconnectMarketplace = async (connId: string) => {
  const response = await api.post(`/api/marketplaces/connections/${connId}/disconnect`, {}, { pageName: PAGE_NAME });
  return response.data || response;
};

export const syncMarketplaceConnection = async (connId: string) => {
  const response = await api.post(`/api/marketplaces/connections/${connId}/sync`, {}, { pageName: PAGE_NAME });
  return response.data || response;
};

export const testMarketplaceConnection = async (connId: string) => {
  const response = await api.post(`/api/marketplaces/connections/${connId}/test`, {}, { pageName: PAGE_NAME });
  return response.data || response;
};

export const syncShopifyProducts = async () => {
  const response = await api.post('/api/marketplaces/shopify/sync', {}, { pageName: PAGE_NAME });
  return response.data || response;
};

export const getShopifySyncStatus = async () => {
  const response = await api.get('/api/marketplaces/shopify/sync/status', { pageName: PAGE_NAME });
  return response.data || response;
};

export const deleteMarketplaceConnection = async (connId: string) => {
  const response = await api.delete(`/api/marketplaces/connections/${connId}`, { pageName: PAGE_NAME });
  return response.data || response;
};

// ========== One-Way Publish / Sync API ==========

export const publishToShopify = async (marketplaceAccountId: string) => {
  const response = await api.post(
    `/api/marketplaces/${marketplaceAccountId}/publish-to-shopify`,
    {},
    { pageName: PAGE_NAME }
  );
  return response.data || response;
};

export const getProductSyncStatuses = async (connectionId: string) => {
  const response = await api.get(
    `/api/marketplaces/connections/${connectionId}/product-statuses`,
    { pageName: PAGE_NAME }
  );
  return response.data || response;
};

export const retryProductSync = async (productId: string) => {
  const response = await api.post(
    `/api/marketplaces/products/${productId}/retry-sync`,
    {},
    { pageName: PAGE_NAME }
  );
  return response.data || response;
};

export const retryFailedSyncs = async (connectionId: string) => {
  const response = await api.post(
    `/api/marketplaces/connections/${connectionId}/retry-failed`,
    {},
    { pageName: PAGE_NAME }
  );
  return response.data || response;
};

export const syncToShopify = async (marketplaceAccountId: string) => {
  const response = await api.post(
    `/api/marketplaces/${marketplaceAccountId}/sync-to-shopify`,
    {},
    { pageName: PAGE_NAME }
  );
  return response.data || response;
};

export const getConnectionLogs = async (connectionId: string) => {
  const response = await api.get(
    `/api/marketplaces/connections/${connectionId}/logs`,
    { pageName: PAGE_NAME }
  );
  return response.data || response;
};

// ========== Flipkart Integration API ==========

export const connectFlipkart = async (params: { accountLabel?: string, mode?: string, clientId?: string, clientSecret?: string, sellerId?: string }) => {
  const mode = params.mode || 'THIRD_PARTY_OAUTH';
  if (mode === 'SELF_ACCESS') {
    const response = await api.post(`/api/integrations/flipkart/connect?accountLabel=${encodeURIComponent(params.accountLabel || '')}&mode=SELF_ACCESS`, {
      clientId: params.clientId,
      clientSecret: params.clientSecret,
      sellerId: params.sellerId
    }, { pageName: PAGE_NAME });
    return response.data || response;
  } else {
    // THIRD_PARTY_OAUTH
    const response = await api.post(`/api/integrations/flipkart/connect?accountLabel=${encodeURIComponent(params.accountLabel || '')}&mode=THIRD_PARTY_OAUTH`, {}, { pageName: PAGE_NAME });
    return response.data || response;
  }
};

export const disconnectFlipkart = async () => {
  const response = await api.post('/api/integrations/flipkart/disconnect', {}, { pageName: PAGE_NAME });
  return response.data || response;
};

export const getFlipkartStatus = async () => {
  const response = await api.get('/api/integrations/flipkart/status', { pageName: PAGE_NAME });
  return response.data || response;
};

export const checkFlipkartHealth = async () => {
  const response = await api.get('/api/integrations/flipkart/health', { pageName: PAGE_NAME });
  return response.data || response;
};

export const syncFlipkartProducts = async (payload: { productIds?: string[], mode?: string, force?: boolean } = {}) => {
  const response = await api.post('/api/integrations/flipkart/sync/products', payload, { pageName: PAGE_NAME });
  return response.data || response;
};

export const getFlipkartProducts = async () => {
  const response = await api.get('/api/integrations/flipkart/products', { pageName: PAGE_NAME });
  return response.data || response;
};

export const mapFlipkartProduct = async (payload: { retailVerseProductId: string, flipkartFsn: string, sellerSku: string, flipkartLocationId?: string, categoryId?: string }) => {
  const response = await api.post('/api/integrations/flipkart/products/map', payload, { pageName: PAGE_NAME });
  return response.data || response;
};

export const unmapFlipkartProduct = async (mappingId: string) => {
  const response = await api.post('/api/integrations/flipkart/products/unmap', { mappingId }, { pageName: PAGE_NAME });
  return response.data || response;
};

export const searchFlipkartCatalogue = async (query: string) => {
  const response = await api.get(`/api/integrations/flipkart/products/search?q=${encodeURIComponent(query)}`, { pageName: PAGE_NAME });
  return response.data || response;
};

export const updateFlipkartProductAttributes = async (payload: { productId: string, hsn?: string, weight?: number, length?: number, width?: number, height?: number }) => {
  const response = await api.post('/api/integrations/flipkart/products/attributes', payload, { pageName: PAGE_NAME });
  return response.data || response;
};

export const getFlipkartLogs = async (params: { level?: string, action?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.level) query.append('level', params.level);
  if (params.action) query.append('action', params.action);
  const response = await api.get(`/api/integrations/flipkart/logs?${query.toString()}`, { pageName: PAGE_NAME });
  return response.data || response;
};

// Named object for import { marketplaceApi } pattern
export const marketplaceApi = {
  getMarketplaces,
  getMarketplaceConnections,
  startMarketplaceOAuth,
  connectMarketplaceWithCredentials,
  disconnectMarketplace,
  syncMarketplaceConnection,
  testMarketplaceConnection,
  syncShopifyProducts,
  getShopifySyncStatus,
  deleteMarketplaceConnection,
  publishToShopify,
  getProductSyncStatuses,
  retryProductSync,
  retryFailedSyncs,
  syncToShopify,
  getConnectionLogs,
  // Flipkart Integration
  connectFlipkart,
  disconnectFlipkart,
  getFlipkartStatus,
  checkFlipkartHealth,
  syncFlipkartProducts,
  getFlipkartProducts,
  mapFlipkartProduct,
  unmapFlipkartProduct,
  searchFlipkartCatalogue,
  updateFlipkartProductAttributes,
  getFlipkartLogs
};


