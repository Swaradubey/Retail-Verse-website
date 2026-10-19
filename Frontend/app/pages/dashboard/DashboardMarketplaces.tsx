import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Store, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Search, 
  RefreshCw, 
  Link2, 
  AlertCircle, 
  ShoppingCart, 
  Loader2, 
  Trash2,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import * as marketplaceApi from '../../services/marketplaceApi';
import { MarketplaceCard, MarketplaceItem } from '../../components/marketplace/MarketplaceCard';
import { SyncLogModal } from '../../components/marketplace/SyncLogModal';
import { ConnectMarketplaceModal } from '../../components/marketplace/ConnectMarketplaceModal';

export function DashboardMarketplaces() {
  const [search, setSearch] = useState('');
  const [marketplaces, setMarketplaces] = useState<MarketplaceItem[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [ordersSyncedCount, setOrdersSyncedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Connect Marketplace Modal state (Self-Serve Setup for Clients)
  const [selectedConnectModalChannel, setSelectedConnectModalChannel] = useState<string | null>(null);

  // Sync Log Drawer / Modal state
  const [selectedSyncLogChannel, setSelectedSyncLogChannel] = useState<string | null>(null);

  // Shopify untouched modal states
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [shopifyShop, setShopifyShop] = useState('');
  const [shopifyConnectMode, setShopifyConnectMode] = useState<'oauth' | 'credentials'>('oauth');
  const [shopifyStoreName, setShopifyStoreName] = useState('');
  const [shopifyStoreDomain, setShopifyStoreDomain] = useState('');
  const [shopifyAccessToken, setShopifyAccessToken] = useState('');
  const [shopifySyncState, setShopifySyncState] = useState<any>(null);
  const [isPollingSync, setIsPollingSync] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    // Process post-redirect params
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const errorMsg = params.get('error');
    const connectedChannel = params.get('connected') || params.get('channel') || params.get('account');
    const statusParam = params.get('status');

    if (success === 'true' || statusParam === 'connected' || connectedChannel) {
      if (connectedChannel) {
        const channelDisplayName = connectedChannel.charAt(0).toUpperCase() + connectedChannel.slice(1);
        toast.success(`Successfully connected with ${channelDisplayName}!`);
      } else {
        toast.success('Marketplace connected successfully!');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorMsg || statusParam === 'error') {
      const displayMsg = params.get('message') || errorMsg || 'Connection failed';
      toast.error(`Marketplace connection error: ${displayMsg}`);
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
      const conns = Array.isArray(connData)
        ? connData
        : Array.isArray(connData?.connections)
          ? connData.connections
          : [];
      setConnections(conns);

      if (!Array.isArray(connData) && connData?.ordersSynced !== undefined) {
        setOrdersSyncedCount(connData.ordersSynced);
      }
    } catch (err: any) {
      console.error('Failed to load marketplaces registry:', err);
      setError('Marketplace registry data could not be loaded. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Primary Action: Connect Marketplace
   * Opens Self-Serve Client Modal where the client can enter their store details,
   * choose sync preferences (inventory, products, pricing), and connect via OAuth or Direct API.
   */
  const handleConnect = (channel: string) => {
    setSelectedConnectModalChannel(channel);
  };

  /**
   * Post-connection control: Sync Inventory
   */
  const handleSyncInventory = async (channel: string) => {
    try {
      setActionLoading(`sync-${channel}`);

      if (channel === 'shopify') {
        await handleShopifySync();
        return;
      }

      const res = await marketplaceApi.syncMarketplaceInventory(channel);
      if (res && res.success) {
        const synced = res.stats?.syncedProducts ?? 0;
        const total = res.stats?.totalProducts ?? 0;
        toast.success(`Inventory synced successfully with ${channel.toUpperCase()}! (${synced}/${total} products synced)`);
        fetchMarketplaces();
      } else {
        toast.error(res?.message || 'Inventory sync failed.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Inventory sync failed.');
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Post-connection control: Auto-Sync Toggle (Active/Inactive)
   */
  const handleToggleAutoSync = async (channel: string, currentVal: boolean) => {
    try {
      setActionLoading(`toggle-${channel}`);
      const nextVal = !currentVal;
      const res = await marketplaceApi.toggleMarketplaceAutoSync(channel, nextVal);
      if (res && res.success) {
        toast.success(`Auto-sync is now ${nextVal ? 'Active' : 'Inactive'} for ${channel.toUpperCase()}`);
        // Optimistically update marketplaces
        setMarketplaces(prev => prev.map(m => m.code === channel ? { ...m, autoSync: nextVal } : m));
        fetchMarketplaces();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update auto-sync setting.');
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Post-connection control: Disconnect
   */
  const handleDisconnectChannel = async (channel: string) => {
    try {
      setActionLoading(`disconnect-${channel}`);

      if (channel === 'shopify') {
        const conn = connections.find(c => c.marketplace === 'shopify' || c.channel === 'shopify');
        if (conn?._id) {
          await marketplaceApi.disconnectMarketplace(conn._id);
        }
      } else {
        await marketplaceApi.disconnectMarketplaceChannel(channel);
      }

      toast.success(`Disconnected from ${channel.toUpperCase()} successfully.`);
      fetchMarketplaces();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Disconnection failed.');
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Post-connection control: Open Sync Log Drawer / Modal
   */
  const handleOpenSyncLogs = (channel: string) => {
    setSelectedSyncLogChannel(channel);
  };

  // ── Existing Shopify flow functions (Untouched) ──────────────────────────

  const handleShopifyConnect = () => {
    const normalizedInput = shopifyShop.trim();
    if (!normalizedInput) {
      toast.error('Please enter your Shopify shop name or domain.');
      return;
    }
    const token = localStorage.getItem('eco_shop_token');
    const rawBase = (String(import.meta.env.VITE_API_BASE_URL ?? '').trim() || 'http://localhost:5000').replace(/\/+$/, '');
    const apiBase = rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;
    
    const tokenQuery = token ? `&token=${token}` : '';
    const connectUrl = `${apiBase}/marketplaces/shopify/connect?shop=${encodeURIComponent(normalizedInput)}${tokenQuery}`;

    window.location.assign(connectUrl);
  };

  const handleShopifyCredentialsConnect = async () => {
    if (!shopifyStoreDomain.trim() || !shopifyAccessToken.trim()) {
      toast.error('Please enter both Store Domain and Access Token.');
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
        toast.success('Shopify connected successfully!');
        setActiveModal(null);
        setShopifyStoreName('');
        setShopifyStoreDomain('');
        setShopifyAccessToken('');
        fetchMarketplaces();
      } else {
        throw new Error(res.message || 'Failed to connect Shopify using credentials.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to connect.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleShopifySync = async () => {
    try {
      setActionLoading('shopify-sync');
      const data = await marketplaceApi.syncShopifyProducts();
      
      if (data.stats && data.stats.total === 0) {
        toast.info(data.message || 'No eligible Retail Verse inventory products found.');
      } else if (data.stats && data.stats.failed > 0 && data.stats.synced === 0) {
        toast.error(data.message || 'Sync failed for all products.');
      } else {
        toast.success(data.message || 'Shopify sync completed successfully.');
      }
      
      setIsPollingSync(true);
      const initialStatus = await marketplaceApi.getShopifySyncStatus();
      setShopifySyncState(initialStatus);
      fetchMarketplaces();
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message || 'Sync failed.';
      toast.error(errMsg);
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
      }
    } catch (error) {
      console.error('Error polling shopify sync status:', error);
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

  // ── Connected Accounts Table Helpers ─────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteLoading(true);
      await marketplaceApi.deleteMarketplaceConnection(deleteTarget._id);
      toast.success(`"${deleteTarget.sellerAccountName || deleteTarget.marketplace}" account removed successfully.`);
      setDeleteTarget(null);
      fetchMarketplaces();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to remove account.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredConnections = connections.filter(c => {
    const channelName = c.channel || c.marketplace || '';
    if (channelName.toLowerCase() === 'blinkit') return false;
    const searchLower = search.toLowerCase();
    return (
      channelName.toLowerCase().includes(searchLower) ||
      (c.sellerAccountName && c.sellerAccountName.toLowerCase().includes(searchLower)) ||
      (c.sellerId && c.sellerId.toLowerCase().includes(searchLower))
    );
  });

  const stats = {
    total: connections.length,
    healthy: connections.filter(c => (c.status || '').toUpperCase() === 'CONNECTED' || c.apiHealth?.status === 'healthy').length,
    syncing: connections.filter(c => (c.status || '').toUpperCase() === 'SYNCING').length,
    errors: connections.filter(c => (c.status || '').toUpperCase() === 'FAILED' || c.status === 'error').length,
    ordersSynced: ordersSyncedCount,
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Marketplace Integrations &amp; Inventory Sync
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            One-Click OAuth integration and real-time bidirectional inventory sync for your sales channels.
          </p>
        </div>
        <Button onClick={fetchMarketplaces} variant="outline" className="gap-2 rounded-xl text-xs h-9">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl flex items-start gap-3 text-red-800 dark:text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Top Level KPI Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Channels" value={stats.total} icon={<Store className="w-5 h-5 text-blue-500" />} />
        <StatCard title="Healthy & Connected" value={stats.healthy} icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} />
        <StatCard title="Sync Operations" value={stats.syncing} icon={<RefreshCw className="w-5 h-5 text-amber-500" />} />
        <StatCard title="Sync Errors" value={stats.errors} icon={<XCircle className="w-5 h-5 text-rose-500" />} />
      </div>

      {/* Available Marketplace Channels */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              One-Click Marketplace Channels
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Direct connection without manual App ID or App Secret inputs.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {marketplaces.map(mp => (
            <MarketplaceCard
              key={mp.code}
              marketplace={mp}
              onConnect={handleConnect}
              onSyncInventory={handleSyncInventory}
              onToggleAutoSync={handleToggleAutoSync}
              onDisconnect={handleDisconnectChannel}
              onOpenSyncLogs={handleOpenSyncLogs}
              loadingAction={actionLoading}
            />
          ))}
        </div>
      </div>

      {/* Connected Accounts Table */}
      <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden rounded-2xl">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Connected Marketplace Accounts
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Live authorization credentials and sync health details.
            </p>
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts or seller IDs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50/60 dark:bg-zinc-900/50">
              <TableRow>
                <TableHead className="text-xs font-semibold">Channel</TableHead>
                <TableHead className="text-xs font-semibold">Seller ID / Domain</TableHead>
                <TableHead className="text-xs font-semibold">Connection Status</TableHead>
                <TableHead className="text-xs font-semibold">Auto-Sync</TableHead>
                <TableHead className="text-xs font-semibold">Last Sync Timestamp</TableHead>
                <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                  </TableCell>
                </TableRow>
              ) : filteredConnections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground text-xs">
                    No active marketplace connections found. Use the cards above to connect with one click.
                  </TableCell>
                </TableRow>
              ) : (
                filteredConnections.map((conn) => {
                  const channel = conn.channel || conn.marketplace;
                  const isConnected = (conn.status || '').toUpperCase() === 'CONNECTED';
                  const isSyncing = (conn.status || '').toUpperCase() === 'SYNCING';

                  return (
                    <TableRow key={conn._id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40">
                      <TableCell className="font-semibold text-xs capitalize text-zinc-900 dark:text-zinc-100">
                        {channel}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {conn.sellerId || conn.sellerAccountId || conn.shopDomain || conn.storeUrl || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {isConnected ? (
                          <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold">
                            Connected
                          </Badge>
                        ) : isSyncing ? (
                          <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold">
                            Syncing
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-zinc-500 text-[11px]">
                            {conn.status || 'Disconnected'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[11px] ${conn.autoSync !== false ? 'text-blue-600 border-blue-200 dark:text-blue-400' : 'text-zinc-400'}`}>
                          {conn.autoSync !== false ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-medium">
                        {conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString() : 'Never'}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenSyncLogs(channel)}
                          className="h-8 text-xs font-medium"
                        >
                          Logs
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSyncInventory(channel)}
                          disabled={actionLoading === `sync-${channel}`}
                          className="h-8 text-xs text-blue-600 hover:text-blue-700 font-semibold"
                        >
                          Sync
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50/50"
                          onClick={() => setDeleteTarget(conn)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Client Self-Serve Marketplace Connection Modal ────────────────── */}
      <ConnectMarketplaceModal
        isOpen={!!selectedConnectModalChannel}
        channel={selectedConnectModalChannel}
        marketplaceItem={marketplaces.find(m => m.code === selectedConnectModalChannel)}
        onClose={() => setSelectedConnectModalChannel(null)}
        onSuccess={() => {
          fetchMarketplaces();
          if (selectedConnectModalChannel === 'shopify') {
            pollShopifySyncStatus();
          }
        }}
      />

      {/* ── Sync Log Drawer / Modal ───────────────────────────────────────── */}
      <SyncLogModal
        channel={selectedSyncLogChannel}
        isOpen={!!selectedSyncLogChannel}
        onClose={() => setSelectedSyncLogChannel(null)}
        onTriggerSync={handleSyncInventory}
        isSyncing={actionLoading === `sync-${selectedSyncLogChannel}`}
      />

      {/* ── Shopify Modal (Untouched flow) ─────────────────────────────────── */}
      <Dialog open={activeModal === 'shopify'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Connect Shopify Store</DialogTitle>
            <DialogDescription>Choose your preferred connection method to sync Shopify products.</DialogDescription>
          </DialogHeader>
          
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

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5" />
              Remove Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the <strong>{deleteTarget?.sellerAccountName || deleteTarget?.channel || deleteTarget?.marketplace}</strong> connection?
              <br /><br />
              This will revoke tokens and remove active synchronization.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="destructive" className="rounded-xl" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="border border-zinc-200/80 dark:border-zinc-800 shadow-xs bg-white dark:bg-zinc-900 rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{title}</p>
            <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">{value}</p>
          </div>
          <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700/60">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
