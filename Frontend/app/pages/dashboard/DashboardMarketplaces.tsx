import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Store, CheckCircle2, AlertTriangle, XCircle, Search, RefreshCw, Link2, AlertCircle, Activity, ShoppingCart, Loader2, HelpCircle, UserCheck, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import api from '../../api/apiService';
import * as marketplaceApi from '../../services/marketplaceApi';
// Frontend logo map – ensures we always serve local official logo assets
// regardless of what path the backend returns, preventing broken-image placeholders.
const marketplaceLogoMap: Record<string, string> = {
  amazon: '/marketplace-logos/amazon.svg',
  'amazon-sp-api': '/marketplace-logos/amazon.svg',
  shopify: '/marketplace-logos/shopify.svg',
  flipkart: '/marketplace-logos/flipkart.svg',
};

export function DashboardMarketplaces() {
  const [search, setSearch] = useState('');
  const [marketplaces, setMarketplaces] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [ordersSyncedCount, setOrdersSyncedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [shopifyShop, setShopifyShop] = useState('');
  const [shopifySyncState, setShopifySyncState] = useState<any>(null);
  const [isPollingSync, setIsPollingSync] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Custom credential connection mode states
  const [shopifyConnectMode, setShopifyConnectMode] = useState<'oauth' | 'credentials'>('oauth');
  const [shopifyStoreName, setShopifyStoreName] = useState('');
  const [shopifyStoreDomain, setShopifyStoreDomain] = useState('');
  const [shopifyAccessToken, setShopifyAccessToken] = useState('');

  // Flipkart connection states
  const [flipkartConnectMode, setFlipkartConnectMode] = useState<'oauth' | 'credentials'>('oauth');
  const [flipkartAccountLabel, setFlipkartAccountLabel] = useState('Flipkart Store');
  const [flipkartSellerId, setFlipkartSellerId] = useState('');
  const [flipkartClientId, setFlipkartClientId] = useState('');
  const [flipkartClientSecret, setFlipkartClientSecret] = useState('');



  const handleFlipkartConnect = async () => {
    try {
      setActionLoading('flipkart');
      if (flipkartConnectMode === 'oauth') {
        const res = await marketplaceApi.connectFlipkart({
          accountLabel: flipkartAccountLabel.trim(),
          mode: 'THIRD_PARTY_OAUTH'
        });
        if (res.authUrl) {
          window.location.assign(res.authUrl);
          return;
        }
        throw new Error(res.message || "Failed to initiate OAuth flow");
      } else {
        if (!flipkartSellerId.trim() || !flipkartClientId.trim() || !flipkartClientSecret.trim()) {
          toast.error("Please enter Seller ID, Client ID, and Client Secret.");
          setActionLoading(null);
          return;
        }
        const res = await marketplaceApi.connectFlipkart({
          accountLabel: flipkartAccountLabel.trim(),
          mode: 'SELF_ACCESS',
          sellerId: flipkartSellerId.trim(),
          clientId: flipkartClientId.trim(),
          clientSecret: flipkartClientSecret.trim()
        });
        if (res.success) {
          toast.success("Flipkart connected successfully!");
          setActiveModal(null);
          setFlipkartSellerId('');
          setFlipkartClientId('');
          setFlipkartClientSecret('');
          fetchMarketplaces();
        } else {
          throw new Error(res.message || "Connection failed.");
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Flipkart connection failed.");
    } finally {
      setActionLoading(null);
    }
  };



  const handleShopifyCredentialsConnect = async () => {
    if (!shopifyStoreDomain.trim() || !shopifyAccessToken.trim()) {
      toast.error("Please enter both Store Domain and Access Token.");
      return;
    }
    try {
      setActionLoading('shopify');
      const res = await marketplaceApi.connectMarketplaceWithCredentials('shopify', {
        storeName: shopifyStoreName.trim(),
        storeDomain: shopifyStoreDomain.trim(),
        accessToken: shopifyAccessToken.trim()
      });
      if (res.success) {
        toast.success("Shopify connected successfully!");
        setActiveModal(null);
        setShopifyStoreName('');
        setShopifyStoreDomain('');
        setShopifyAccessToken('');
        fetchMarketplaces();
      } else {
        throw new Error(res.message || "Failed to connect Shopify using credentials.");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to connect.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleShopifyConnect = () => {
    const normalizedInput = shopifyShop.trim();
    if (!normalizedInput) {
      toast.error("Please enter your Shopify shop name or domain.");
      return;
    }
    const token = localStorage.getItem('eco_shop_token');
    const rawBase = (String(import.meta.env.VITE_API_BASE_URL ?? "").trim() || "http://localhost:5000").replace(/\/+$/, "");
    const apiBase = rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;
    
    const tokenQuery = token ? `&token=${token}` : '';
    const connectUrl = `${apiBase}/marketplaces/shopify/connect?shop=${encodeURIComponent(normalizedInput)}${tokenQuery}`;

    window.location.assign(connectUrl);
  };

  const handleCredentialChange = (field: string, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  const navigate = useNavigate();

  useEffect(() => {
    // Process post-redirect params
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const errorMsg = params.get('error');
    const connectedAccount = params.get('account') || params.get('connected');
    const shopifyParam = params.get('shopify');
    const flipkartParam = params.get('flipkart');

    if (success === 'true' || shopifyParam === 'connected' || flipkartParam === 'connected') {
      let marketplaceName = '';
      if (shopifyParam === 'connected') {
        marketplaceName = 'Shopify';
      } else if (flipkartParam === 'connected') {
        marketplaceName = 'Flipkart';
      } else if (connectedAccount) {
        const lowerAccount = connectedAccount.toLowerCase();
        if (lowerAccount.includes('shopify')) {
          marketplaceName = 'Shopify';
        } else if (lowerAccount.includes('flipkart')) {
          marketplaceName = 'Flipkart';
        } else if (lowerAccount.includes('amazon')) {
          marketplaceName = 'Amazon';
        } else {
          marketplaceName = connectedAccount
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      } else {
        for (const [key, value] of params.entries()) {
          if (value === 'connected') {
            const lowerKey = key.toLowerCase();
            if (lowerKey === 'shopify') {
              marketplaceName = 'Shopify';
            } else if (lowerKey === 'flipkart') {
              marketplaceName = 'Flipkart';
            } else {
              marketplaceName = key.charAt(0).toUpperCase() + key.slice(1);
            }
            break;
          }
        }
      }

      if (!marketplaceName) {
        marketplaceName = 'Marketplace';
      }

      toast.success(`Successfully connected to ${marketplaceName}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorMsg || shopifyParam === 'error' || flipkartParam === 'error') {
      const displayMsg = params.get('message') || errorMsg || "Connection failed";
      toast.error(`Connection failed: ${displayMsg}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    fetchMarketplaces();
    pollShopifySyncStatus();
  }, []);

  const fetchMarketplaces = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch cards/registry
      const registryData = await marketplaceApi.getMarketplaces();
      setMarketplaces(Array.isArray(registryData) ? registryData : []);

      // Fetch connections & synced orders
      const connData = await marketplaceApi.getMarketplaceConnections();

      setConnections(
        Array.isArray(connData)
          ? connData
          : Array.isArray(connData?.connections)
            ? connData.connections
            : []
      );

      if (!Array.isArray(connData) && connData?.ordersSynced !== undefined) {
        setOrdersSyncedCount(connData.ordersSynced);
      }
    } catch (error) {
      console.error("Failed to load marketplaces registry:", error);
      setError("Marketplace registry data could not be loaded. Please ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (marketplaceCode: string) => {
    try {
      setActionLoading(marketplaceCode);
      const res = await marketplaceApi.connectMarketplaceWithCredentials(marketplaceCode, credentials);
      if (res.authUrl) {
        window.location.href = res.authUrl;
        return;
      }
      toast.success(`${formatStatus(marketplaceCode)} connected successfully!`);
      setActiveModal(null);
      setCredentials({});
      fetchMarketplaces();
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || "Failed to connect.";
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const openModal = (marketplaceCode: string) => {
    setCredentials({}); // reset
    setActiveModal(marketplaceCode);
  };

  const handleDisconnect = async (connId: string) => {
    try {
      setActionLoading(connId);
      await marketplaceApi.disconnectMarketplace(connId);
      toast.success("Disconnected successfully.");
      fetchMarketplaces();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Disconnection failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteClick = (conn: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(conn);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      await marketplaceApi.deleteMarketplaceConnection(deleteTarget._id);
      toast.success(`"${deleteTarget.sellerAccountName || deleteTarget.marketplace}" account removed successfully.`);
      setDeleteTarget(null);
      fetchMarketplaces();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to remove account.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleHealthCheck = async (connId: string) => {
    try {
      setActionLoading(`health-${connId}`);
      const data = await marketplaceApi.testMarketplaceConnection(connId);
      toast.success(`Health status: ${data.success ? 'HEALTHY' : 'ERROR'} - ${data.message}`);
      fetchMarketplaces();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Health check request failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSync = async (connId: string) => {
    try {
      setActionLoading(`sync-${connId}`);
      await marketplaceApi.syncMarketplaceConnection(connId);
      toast.success("Shopify sync triggered in backend.");
      fetchMarketplaces();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Sync failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleShopifySync = async () => {
    try {
      setActionLoading('shopify-sync');
      const data = await marketplaceApi.syncShopifyProducts();
      
      if (data.stats && data.stats.total === 0) {
        toast.info(data.message || "No eligible Retail Verse inventory products were found for this merchant.");
      } else if (data.stats && data.stats.failed > 0 && data.stats.synced === 0) {
        toast.error(data.message || "Sync failed for all products.");
      } else {
        toast.success(data.message || "Shopify sync completed successfully.");
      }
      
      setIsPollingSync(true);
      const initialStatus = await marketplaceApi.getShopifySyncStatus();
      setShopifySyncState(initialStatus);
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message || "Sync failed.";
      if (errMsg.includes('MISSING_SCOPES') || errMsg.includes('Missing Shopify scopes')) {
        toast.error("Missing Shopify permissions: " + errMsg, { duration: 8000 });
      } else if (errMsg.includes('No connected Shopify connection')) {
        toast.error("Shopify is not connected. Please connect your store first.");
      } else if (errMsg.includes('No eligible')) {
        toast.info("No eligible inventory products found to sync.");
      } else {
        toast.error(errMsg);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const pollShopifySyncStatus = async () => {
    try {
      const data = await marketplaceApi.getShopifySyncStatus();
      setShopifySyncState(data);
      if (data && (data.queued > 0 || data.processing > 0)) {
        setIsPollingSync(true);
      } else {
        setIsPollingSync(false);
        if (data && data.syncStatus === 'connected') {
          fetchMarketplaces();
        }
      }
    } catch (error) {
      console.error("Error polling shopify sync status:", error);
    }
  };

  useEffect(() => {
    let intervalId: any;
    if (isPollingSync) {
      intervalId = setInterval(pollShopifySyncStatus, 2000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPollingSync]);

  const filteredConnections = connections.filter(c =>
    c.marketplace &&
    c.marketplace.toLowerCase() !== 'blinkit' &&
    (c.marketplace.toLowerCase().includes(search.toLowerCase()) ||
    (c.sellerAccountName && c.sellerAccountName.toLowerCase().includes(search.toLowerCase())))
  );

  const stats = {
    total: connections.length,
    healthy: connections.filter(c => c.apiHealth === 'healthy' || c.health?.status === 'healthy').length,
    degraded: connections.filter(c => c.apiHealth === 'degraded' || c.health?.status === 'warning').length,
    reconnect: connections.filter(c => c.status === 'reconnect_required').length,
    errors: connections.filter(c => c.status === 'error').length,
    ordersSynced: ordersSyncedCount,
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">Marketplace Integrations</h1>
          <p className="text-muted-foreground mt-1">Manage and sync your external sales channels seamlessly.</p>
        </div>
        <Button onClick={fetchMarketplaces} variant="outline" className="gap-2 rounded-xl">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl flex items-start gap-3 text-red-800 dark:text-red-200">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Total Connected" value={stats.total} icon={<Store className="w-5 h-5 text-blue-500" />} />
        <StatCard title="Healthy" value={stats.healthy} icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} />
        <StatCard title="Warning/Degraded" value={stats.degraded} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} />
        <StatCard title="Reconnect Req." value={stats.reconnect} icon={<Link2 className="w-5 h-5 text-orange-500" />} />
        <StatCard title="API Errors" value={stats.errors} icon={<XCircle className="w-5 h-5 text-rose-500" />} />
        <StatCard title="Orders Synced" value={stats.ordersSynced} icon={<ShoppingCart className="w-5 h-5 text-indigo-500" />} />
      </div>

      {/* Dynamic Available Marketplaces */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Available Channels</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {marketplaces.map(mp => {
            const hasConnection = mp.connectionId !== null;
            const statusDisplay = formatStatus(mp.status);

            return (
              <Card key={mp.code} className="overflow-hidden border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.15)] transition-all duration-300 hover:-translate-y-1 hover:border-zinc-300 dark:hover:border-zinc-700" style={{ borderRadius: '18px' }}>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div className="w-[56px] h-[56px] bg-white rounded-[16px] p-2 flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] border border-zinc-100 dark:border-zinc-800 overflow-hidden shrink-0">
                      <img
                        src={marketplaceLogoMap[mp.code] || mp.logo}
                        alt={mp.displayName}
                        loading="lazy"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="%23f3f4f6"/><text x="50%" y="50%" font-family="Arial" font-size="14" font-weight="bold" fill="%236b7280" text-anchor="middle" dy=".3em">${mp.displayName.substring(0, 3)}</text></svg>`;
                        }}
                      />
                    </div>
                    <Badge variant="outline" className={statusBadgeClass(mp.status)}>
                      {statusDisplay}
                    </Badge>
                  </div>
                  <CardTitle className="mt-4 text-[18px] font-[600] tracking-tight">{mp.displayName}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs mt-1 min-h-[32px]">{mp.description}</CardDescription>
                </CardHeader>

                <CardContent className="py-0 text-xs min-h-[38px] space-y-1">
                  {hasConnection && (mp.code === 'shopify' || mp.code === 'flipkart') ? (
                    <div className="bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-lg text-muted-foreground space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-zinc-500">Account:</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{mp.accountName || 'Connected Store'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-zinc-500">{mp.code === 'shopify' ? 'Shop Domain' : 'Seller ID'}:</span>
                        <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200 truncate">{mp.storeUrl || mp.sellerAccountId || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-zinc-500">Connected:</span>
                        <span className="text-zinc-800 dark:text-zinc-200">{mp.connectedAt ? new Date(mp.connectedAt).toLocaleDateString() : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-zinc-500">Last Sync:</span>
                        <span className="text-zinc-800 dark:text-zinc-200">{mp.lastSyncAt ? new Date(mp.lastSyncAt).toLocaleString() : 'Never'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-zinc-500">Sync Status:</span>
                        <span className={`font-semibold ${mp.apiHealth?.status === 'healthy' || mp.status === 'connected' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {mp.apiHealth?.status ? mp.apiHealth.status.toUpperCase() : (mp.status || 'UNKNOWN').toUpperCase()}
                        </span>
                      </div>
                      {mp.code === 'shopify' && shopifySyncState && shopifySyncState.syncStatus !== 'not_connected' && (
                        <div className="mt-2.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
                          <div className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">Sync Activity:</div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="flex justify-between bg-zinc-100 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded text-[10px]">
                              <span className="text-zinc-500">Queued:</span>
                              <span className="font-bold text-zinc-700 dark:text-zinc-300">{shopifySyncState.queued}</span>
                            </div>
                            <div className="flex justify-between bg-blue-50 dark:bg-blue-950/20 px-1.5 py-0.5 rounded text-[10px] text-blue-700 dark:text-blue-300">
                              <span className="text-blue-500">Active:</span>
                              <span className="font-bold">{shopifySyncState.processing}</span>
                            </div>
                            <div className="flex justify-between bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded text-[10px] text-emerald-700 dark:text-emerald-300">
                              <span className="text-emerald-500">Synced:</span>
                              <span className="font-bold">{shopifySyncState.successful}</span>
                            </div>
                            <div className="flex justify-between bg-rose-50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded text-[10px] text-rose-700 dark:text-rose-300">
                              <span className="text-rose-500">Failed:</span>
                              <span className="font-bold">{shopifySyncState.failed}</span>
                            </div>
                          </div>
                          {isPollingSync && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 animate-pulse font-medium">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Syncing products...
                            </div>
                          )}
                          {(shopifySyncState.failed > 0 || (shopifySyncState.errors && shopifySyncState.errors.length > 0)) && !isPollingSync && (
                            <button
                              onClick={() => {
                                const errMsg = (shopifySyncState.errors || [])
                                  .map((e: any) => `${e.productName || e.sku || ''}: ${e.error}`)
                                  .join('\n');
                                toast.error(`Sync Errors:\n${errMsg}`, { duration: 10000 });
                              }}
                              className="text-[10px] text-rose-500 hover:text-rose-700 underline mt-1"
                            >
                              View errors ({shopifySyncState.failed})
                            </button>
                          )}
                          {shopifySyncState.lastSyncAt && !isPollingSync && !shopifySyncState.queued && !shopifySyncState.processing && (
                            <div className="text-[10px] text-zinc-400 mt-1">
                              Last sync: {new Date(shopifySyncState.lastSyncAt).toLocaleString()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    hasConnection && mp.sellerAccountName && (
                      <div className="bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded-lg text-muted-foreground truncate">
                        Account: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{mp.sellerAccountName}</span>
                      </div>
                    )
                  )}
                </CardContent>

                <CardFooter className="pt-4 flex flex-col gap-2">
                  {mp.status === 'connected' ? (
                    <div className="flex flex-col w-full gap-2">
                      <div className="flex w-full gap-2">
                        {mp.code === 'shopify' ? (
                          <Button className="w-full h-[40px] rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs" disabled={actionLoading === 'shopify-sync' || isPollingSync} onClick={handleShopifySync}>
                            {actionLoading === 'shopify-sync' || isPollingSync ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Sync Now'}
                          </Button>
                        ) : (
                          <Button variant="outline" className="w-full h-[40px] rounded-xl text-xs" onClick={() => navigate(`/dashboard/marketplaces/${mp.connectionId}`)}>
                            View Account
                          </Button>
                        )}
                        {mp.code !== 'shopify' && (
                          <Button className="w-full h-[40px] rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs" disabled={actionLoading === `sync-${mp.connectionId}`} onClick={() => handleSync(mp.connectionId)}>
                            {actionLoading === `sync-${mp.connectionId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Sync'}
                          </Button>
                        )}
                      </div>
                      <div className="flex w-full gap-2">
                        {mp.code === 'shopify' ? (
                          <Button variant="ghost" className="w-full h-[36px] rounded-xl text-[11px] text-zinc-500 hover:text-zinc-800" onClick={() => openModal('shopify')}>
                            Reconnect
                          </Button>
                        ) : (
                          <Button variant="ghost" className="w-full h-[36px] rounded-xl text-[11px] text-zinc-500 hover:text-zinc-800" disabled={actionLoading === `health-${mp.connectionId}`} onClick={() => handleHealthCheck(mp.connectionId)}>
                            Check Health
                          </Button>
                        )}
                        <Button variant="ghost" className="w-full h-[36px] rounded-xl text-[11px] text-rose-500 hover:text-rose-700 hover:bg-rose-50/50" disabled={actionLoading === mp.connectionId} onClick={() => handleDisconnect(mp.connectionId)}>
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Disconnected or Available state
                    <Button
                      onClick={() => openModal(mp.code)}
                      disabled={actionLoading !== null}
                      className="w-full h-[44px] rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md hover:shadow-lg group flex items-center justify-center gap-2"
                    >
                      {actionLoading === mp.code ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Store className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      )}
                      {mp.status === 'reconnect_required' ? 'Reconnect' : 'Connect'}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Connected Accounts Table */}
      <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold tracking-tight">Connected Accounts</h2>
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/50">
              <TableRow>
                <TableHead>Marketplace</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Seller ID / Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>API Health</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#d4af37]" />
                  </TableCell>
                </TableRow>
              ) : filteredConnections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No connected accounts found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredConnections.map((conn) => (
                  <TableRow key={conn._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30 cursor-pointer" onClick={() => navigate(`/dashboard/marketplaces/${conn._id}`)}>
                    <TableCell className="font-medium capitalize">{conn.marketplace}</TableCell>
                    <TableCell>{conn.sellerAccountName}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs max-w-[200px] truncate">
                      {conn.account?.shopDomain || conn.sellerId || conn.account?.storeUrl}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={conn.status} />
                    </TableCell>
                    <TableCell>
                      <HealthBadge health={conn.apiHealth?.status || conn.health?.status || 'unknown'} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {conn.lastSuccessfulSync ? new Date(conn.lastSuccessfulSync).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/marketplaces/${conn._id}`); }}>View</Button>
                      <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-700 hover:bg-rose-50/50 ml-1" onClick={(e) => handleDeleteClick(conn, e)} disabled={actionLoading === conn._id}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5" />
              Remove Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the <strong>{deleteTarget?.sellerAccountName || deleteTarget?.marketplace}</strong> connection?
              <br /><br />
              This will permanently delete the marketplace account record and all associated sync data. 
              Your Retail Verse products and orders will not be affected.
              <br /><br />
              You can connect this marketplace again after removal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- MODALS SECTION --- */}

      {/* Amazon Modal */}
      <Dialog open={activeModal === 'amazon'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Amazon SP-API</DialogTitle>
            <DialogDescription>Enter your Amazon Seller Central credentials.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>LWA Client ID</Label>
              <Input value={credentials.lwaClientId || ''} onChange={(e) => handleCredentialChange('lwaClientId', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>LWA Client Secret</Label>
              <Input type="password" value={credentials.lwaClientSecret || ''} onChange={(e) => handleCredentialChange('lwaClientSecret', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>SP-API App ID</Label>
              <Input value={credentials.spApiAppId || ''} onChange={(e) => handleCredentialChange('spApiAppId', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Region</Label>
                <Input placeholder="e.g. eu-west-1" value={credentials.region || ''} onChange={(e) => handleCredentialChange('region', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Redirect URI</Label>
                <Input value={credentials.redirectUri || ''} onChange={(e) => handleCredentialChange('redirectUri', e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button disabled={actionLoading === 'amazon'} onClick={() => handleConnect('amazon')}>
              {actionLoading === 'amazon' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Store className="w-4 h-4 mr-1" />} Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shopify Modal */}
      <Dialog open={activeModal === 'shopify'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Connect Shopify Store</DialogTitle>
            <DialogDescription>Choose your preferred connection method to sync Shopify products.</DialogDescription>
          </DialogHeader>
          
          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-900 p-1 mb-4">
            <button
              type="button"
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${shopifyConnectMode === 'oauth' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShopifyConnectMode('oauth')}
            >
              OAuth (Standard)
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${shopifyConnectMode === 'credentials' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShopifyConnectMode('credentials')}
            >
              Access Token (Advanced)
            </button>
          </div>

          {shopifyConnectMode === 'oauth' ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="shopify-shop-name">Store Domain / Shop Name</Label>
                <Input
                  id="shopify-shop-name"
                  placeholder="my-cool-store.myshopify.com or my-cool-store"
                  value={shopifyShop}
                  onChange={(e) => setShopifyShop(e.target.value)}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800"
                />
                <p className="text-[11px] text-muted-foreground">
                  You will be redirected to Shopify to authorize and install the Retail Verse sync app.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="shopify-store-name">Store Name (Friendly Label)</Label>
                <Input
                  id="shopify-store-name"
                  placeholder="e.g. My Shopify Store"
                  value={shopifyStoreName}
                  onChange={(e) => setShopifyStoreName(e.target.value)}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopify-store-domain">Shop URL / Store Domain</Label>
                <Input
                  id="shopify-store-domain"
                  placeholder="e.g. my-store-name.myshopify.com"
                  value={shopifyStoreDomain}
                  onChange={(e) => setShopifyStoreDomain(e.target.value)}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopify-access-token">Admin API Access Token</Label>
                <Input
                  id="shopify-access-token"
                  type="password"
                  placeholder="shpat_..."
                  value={shopifyAccessToken}
                  onChange={(e) => setShopifyAccessToken(e.target.value)}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800"
                />
                <p className="text-[11px] text-muted-foreground">
                  Generate this token inside Shopify Admin &gt; Settings &gt; Apps and sales channels &gt; Develop apps.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setActiveModal(null)}>Cancel</Button>
            {shopifyConnectMode === 'oauth' ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                disabled={actionLoading === 'shopify' || !shopifyShop.trim()}
                onClick={handleShopifyConnect}
              >
                {actionLoading === 'shopify' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Store className="w-4 h-4 mr-1" />} Connect Shopify
              </Button>
            ) : (
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                disabled={actionLoading === 'shopify' || !shopifyStoreDomain.trim() || !shopifyAccessToken.trim()}
                onClick={handleShopifyCredentialsConnect}
              >
                {actionLoading === 'shopify' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Link2 className="w-4 h-4 mr-1" />} Save &amp; Connect
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Flipkart Modal */}
      <Dialog open={activeModal === 'flipkart'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Connect Flipkart Seller Account</DialogTitle>
            <DialogDescription>Choose your preferred connection method to sync Flipkart listings.</DialogDescription>
          </DialogHeader>

          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-900 p-1 mb-4">
            <button
              type="button"
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${flipkartConnectMode === 'oauth' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setFlipkartConnectMode('oauth')}
            >
              OAuth (Standard)
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${flipkartConnectMode === 'credentials' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setFlipkartConnectMode('credentials')}
            >
              Self-Access (Advanced)
            </button>
          </div>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="flipkart-account-label">Account Label</Label>
              <Input
                id="flipkart-account-label"
                placeholder="e.g. My Flipkart Store"
                value={flipkartAccountLabel}
                onChange={(e) => setFlipkartAccountLabel(e.target.value)}
                className="rounded-xl border-zinc-200 dark:border-zinc-800"
              />
            </div>

            {flipkartConnectMode === 'oauth' ? (
              <p className="text-[11px] text-muted-foreground">
                You will be redirected to Flipkart to authorize and establish standard OAuth integration.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="flipkart-seller-id">Seller ID</Label>
                  <Input
                    id="flipkart-seller-id"
                    placeholder="Enter Seller ID"
                    value={flipkartSellerId}
                    onChange={(e) => setFlipkartSellerId(e.target.value)}
                    className="rounded-xl border-zinc-200 dark:border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flipkart-client-id">Application ID (Client ID)</Label>
                  <Input
                    id="flipkart-client-id"
                    placeholder="Enter Application ID"
                    value={flipkartClientId}
                    onChange={(e) => setFlipkartClientId(e.target.value)}
                    className="rounded-xl border-zinc-200 dark:border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flipkart-client-secret">Application Secret (Client Secret)</Label>
                  <Input
                    id="flipkart-client-secret"
                    type="password"
                    placeholder="Enter Application Secret"
                    value={flipkartClientSecret}
                    onChange={(e) => setFlipkartClientSecret(e.target.value)}
                    className="rounded-xl border-zinc-200 dark:border-zinc-800"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
              disabled={actionLoading === 'flipkart'}
              onClick={handleFlipkartConnect}
            >
              {actionLoading === 'flipkart' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Link2 className="w-4 h-4 mr-1" />} Connect Flipkart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      



    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: number, icon: React.ReactNode }) {
  return (
    <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm bg-white dark:bg-zinc-900/50">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'connected': return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/20">Connected</Badge>;
    case 'disconnected': return <Badge variant="secondary">Disconnected</Badge>;
    case 'reconnect_required': return <Badge className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-200 dark:border-orange-500/20">Reconnect Required</Badge>;
    case 'expired': return <Badge variant="outline" className="text-amber-600 border-amber-300">Expired</Badge>;
    case 'error': return <Badge variant="destructive">Error</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function HealthBadge({ health }: { health: string }) {
  switch (health) {
    case 'healthy': return <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Healthy</div>;
    case 'degraded':
    case 'warning': return <div className="flex items-center gap-1.5 text-sm font-medium text-amber-500"><div className="w-2 h-2 rounded-full bg-amber-500" /> Warning</div>;
    case 'down':
    case 'unhealthy': return <div className="flex items-center gap-1.5 text-sm font-medium text-rose-500"><div className="w-2 h-2 rounded-full bg-rose-500" /> Unhealthy</div>;
    default: return <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-400"><div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" /> Unknown</div>;
  }
}

function formatStatus(status: string): string {
  if (!status) return 'Available';
  return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'connected': return "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 rounded-full px-3 py-0.5 font-medium shadow-sm";
    case 'configuration_missing': return "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 rounded-full px-3 py-0.5 font-medium border-0";
    case 'approval_required': return "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 rounded-full px-3 py-0.5 font-medium";
    default: return "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20 rounded-full px-3 py-0.5 font-medium";
  }
}
