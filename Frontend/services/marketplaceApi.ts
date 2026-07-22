import axios from 'axios';
import { getAuthToken } from '../utils/auth';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';

const getHeaders = () => {
  const token = getAuthToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export const getMarketplaces = async () => {
  const response = await axios.get(`${API_BASE}/marketplaces`, { headers: getHeaders() });
  return response.data;
};

export const getMarketplaceConnections = async () => {
  const response = await axios.get(`${API_BASE}/marketplaces/connections`, { headers: getHeaders() });
  return response.data;
};

export const startMarketplaceOAuth = async (marketplace: string, shop?: string) => {
  const url = `${API_BASE}/marketplaces/${marketplace}/connect${shop ? `?shop=${shop}` : ''}`;
  const response = await axios.get(url, { headers: getHeaders() });
  return response.data;
};

export const connectMarketplaceWithCredentials = async (marketplace: string, credentials: any) => {
  const response = await axios.post(`${API_BASE}/marketplaces/${marketplace}/connect`, credentials, { headers: getHeaders() });
  return response.data;
};

export const disconnectMarketplace = async (connectionId: string) => {
  const response = await axios.post(`${API_BASE}/marketplaces/connections/${connectionId}/disconnect`, {}, { headers: getHeaders() });
  return response.data;
};

export const reconnectMarketplace = async (connectionId: string) => {
  const response = await axios.post(`${API_BASE}/marketplaces/connections/${connectionId}/reconnect`, {}, { headers: getHeaders() });
  return response.data;
};

export const testMarketplaceConnection = async (connectionId: string) => {
  const response = await axios.post(`${API_BASE}/marketplaces/connections/${connectionId}/test`, {}, { headers: getHeaders() });
  return response.data;
};

export const getMarketplaceLogs = async (connectionId: string) => {
  const response = await axios.get(`${API_BASE}/marketplaces/connections/${connectionId}/logs`, { headers: getHeaders() });
  return response.data;
};

export const getMarketplaceListings = async (connectionId: string) => {
  const response = await axios.get(`${API_BASE}/marketplaces/connections/${connectionId}/listings`, { headers: getHeaders() });
  return response.data;
};

export const syncMarketplaceConnection = async (connectionId: string) => {
  const response = await axios.post(`${API_BASE}/marketplaces/connections/${connectionId}/sync`, {}, { headers: getHeaders() });
  return response.data;
};

export const publishProductToMarketplaces = async (productId: string, connectionIds: string[]) => {
  const response = await axios.post(`${API_BASE}/marketplaces/products/${productId}/publish`, { connectionIds }, { headers: getHeaders() });
  return response.data;
};

export const syncShopifyProducts = async () => {
  const response = await axios.post(`${API_BASE}/marketplaces/shopify/sync`, {}, { headers: getHeaders() });
  return response.data;
};

export const getShopifySyncStatus = async () => {
  const response = await axios.get(`${API_BASE}/marketplaces/shopify/sync/status`, { headers: getHeaders() });
  return response.data;
};

// ========== One-Way Publish / Sync API ==========

export const publishToShopify = async (connectionId: string) => {
  const response = await axios.post(`${API_BASE}/marketplaces/connections/${connectionId}/publish-to-shopify`, {}, { headers: getHeaders() });
  return response.data;
};

export const getProductSyncStatuses = async (connectionId: string) => {
  const response = await axios.get(`${API_BASE}/marketplaces/connections/${connectionId}/product-statuses`, { headers: getHeaders() });
  return response.data;
};

export const retryProductSync = async (productId: string) => {
  const response = await axios.post(`${API_BASE}/marketplaces/products/${productId}/retry-sync`, {}, { headers: getHeaders() });
  return response.data;
};

export const retryFailedSyncs = async (connectionId: string) => {
  const response = await axios.post(`${API_BASE}/marketplaces/connections/${connectionId}/retry-failed`, {}, { headers: getHeaders() });
  return response.data;
};

