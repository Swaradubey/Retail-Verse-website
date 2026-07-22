import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ChevronLeft, RefreshCw, Activity, Power, Settings2, ShieldAlert, CheckCircle2, AlertTriangle, XCircle, Clock, Package, ShoppingBag, AlertCircle, Loader2, Send, RotateCcw, Eye, Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import api from '../../api/apiService';
import { marketplaceApi } from '@/app/services/marketplaceApi';

// TypeScript interfaces for safety and correctness
export interface SyncSettings {
  orders: boolean;
  inventory: boolean;
  products: boolean;
  pricing: boolean;
}

export interface ApiHealth {
  status: 'unknown' | 'healthy' | 'warning' | 'error' | 'degraded';
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
}

export interface MarketplaceConnectionDetail {
  id: string;
  marketplace: string;
  sellerAccountName: string;
  sellerId: string;
  storeUrl?: string;
  shopDomain?: string;
  status: 'configuration_missing' | 'disconnected' | 'connecting' | 'connected' | 'token_expired' | 'connection_error' | 'approval_required' | 'network_onboarding_required' | 'sync_paused' | 'error';
  apiHealth?: ApiHealth | string | null;
  health?: {
    status: 'unknown' | 'healthy' | 'warning' | 'error';
    lastCheckedAt?: string;
    lastError?: string;
  };
  syncSettings: SyncSettings;
  createdAt: string;
  lastSuccessfulSync?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  lastHealthCheck?: string | null;
}

export interface MarketplaceStats {
  products: number;
  orders: number;
  inventoryItems: number;
  failedSyncs: number;
}

export interface SyncStatus {
  queued: number;
  processing: number;
  synced: number;
  failed: number;
  notSynced?: number;
}

export interface ProductSyncStatus {
  _id: string;
  name: string;
  sku: string;
  image?: string;
  status: 'not_synced' | 'syncing' | 'synced' | 'failed';
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  error?: string | null;
  lastSyncedAt?: string | null;
  price?: number;
  stock?: number;
}

export interface PublishResult {
  status: string;
  productId: string;
  sku: string;
  error?: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
}

// Error Boundary definition
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class MarketplaceDetailErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in MarketplaceDetail:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <a href="/dashboard/marketplaces" className="inline-flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 p-2 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-200">
                <ChevronLeft className="w-5 h-5" />
              </a>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">Marketplace Details</h1>
                <p className="text-muted-foreground mt-1">An unexpected error occurred.</p>
              </div>
            </div>
          </div>

          <Card className="border-rose-200/60 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20 shadow-sm max-w-lg mx-auto mt-8">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-rose-900 dark:text-rose-100">Marketplace details could not be displayed</h3>
              <p className="text-sm text-rose-600/80 dark:text-rose-400/80">We encountered an unexpected problem rendering this page.</p>
              <div className="flex items-center justify-center gap-4 pt-2">
                <a href="/dashboard/marketplaces" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                  Back to Marketplaces
                </a>
                <button onClick={() => window.location.reload()} className="inline-flex items-center justify-center rounded-md bg-[#d4af37] px-4 py-2 text-sm font-medium text-white hover:bg-[#b8860b]">
                  Retry
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Shell wrapper exporting original name
export function MarketplaceDetail() {
  return (
    <MarketplaceDetailErrorBoundary>
      <MarketplaceDetailContent />
    </MarketplaceDetailErrorBoundary>
  );
}

const normalizeString = (value: unknown, fallback = "Not available"): string => {
  return typeof value === 'string' && value.trim() ? value : fallback;
};

const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
};

const formatTime = (value: string | Date | null | undefined): string => {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleTimeString();
};

// Inner component containing the actual implementation logic
function MarketplaceDetailContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Safe initial state definitions
  const [connection, setConnection] = useState<MarketplaceConnectionDetail | null>(null);
  const [stats, setStats] = useState<MarketplaceStats>({
    products: 0,
    orders: 0,
    inventoryItems: 0,
    failedSyncs: 0
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    queued: 0,
    processing: 0,
    synced: 0,
    failed: 0
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isPollingSync, setIsPollingSync] = useState(false);

  // Publish/Sync state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<PublishResult[]>([]);
  const [productStatuses, setProductStatuses] = useState<ProductSyncStatus[]>([]);
  const [showProductStatuses, setShowProductStatuses] = useState(false);
  const [productStatusLoading, setProductStatusLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<any | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'mappings'>('overview');
  const [mappings, setMappings] = useState<any[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  
  // Flipkart catalogue search
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchTargetProduct, setSearchTargetProduct] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [manualFsn, setManualFsn] = useState('');

  // Editing Flipkart-specific attributes
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTargetProduct, setEditTargetProduct] = useState<any>(null);
  const [hsn, setHsn] = useState('');
  const [weight, setWeight] = useState(0.5);
  const [length, setLength] = useState(10);
  const [width, setWidth] = useState(10);
  const [height, setHeight] = useState(10);

  // Manual Sync Stats inside Page (for progress bar display)
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [syncJobState, setSyncJobState] = useState<any | null>(null);
  const [pollingSyncJob, setPollingSyncJob] = useState(false);

  const fetchFlipkartMappings = async () => {
    try {
      setLoadingMappings(true);
      const data = await marketplaceApi.getFlipkartProducts();
      if (data.success && Array.isArray(data.data)) {
        setMappings(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch flipkart product mappings:', err);
      toast.error('Could not load Flipkart product mappings.');
    } finally {
      setLoadingMappings(false);
    }
  };

  const handleSearchCatalog = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query.");
      return;
    }
    try {
      setSearchingCatalog(true);
      const data = await marketplaceApi.searchFlipkartCatalogue(searchQuery);
      if (data.success && Array.isArray(data.data)) {
        setSearchResults(data.data);
      } else {
        setSearchResults([]);
        toast.info("No matching products found in Flipkart catalogue.");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to search Flipkart catalogue.");
    } finally {
      setSearchingCatalog(false);
    }
  };

  const handleSaveMapping = async (fsnValue: string) => {
    if (!searchTargetProduct) return;
    if (!fsnValue.trim()) {
      toast.error("Flipkart FSN is required.");
      return;
    }
    try {
      const res = await marketplaceApi.mapFlipkartProduct({
        retailVerseProductId: searchTargetProduct._id,
        flipkartFsn: fsnValue.trim(),
        sellerSku: searchTargetProduct.sku
      });
      if (res.success) {
        toast.success("Product mapped successfully.");
        setShowSearchDialog(false);
        setSearchTargetProduct(null);
        setSearchQuery('');
        setSearchResults([]);
        setManualFsn('');
        fetchFlipkartMappings();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to save mapping.");
    }
  };

  const handleUnmapProduct = async (mappingId: string) => {
    try {
      const res = await marketplaceApi.unmapFlipkartProduct(mappingId);
      if (res.success) {
        toast.success("Product mapping removed.");
        fetchFlipkartMappings();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to remove mapping.");
    }
  };

  const handleSyncSingleProduct = async (productId: string) => {
    try {
      setActionLoading(`sync-product-${productId}`);
      const res = await marketplaceApi.syncFlipkartProducts({ productIds: [productId] });
      if (res.success && res.jobId) {
        toast.success("Sync job started for this product.");
        setSyncJobId(res.jobId);
        setPollingSyncJob(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to sync product.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkSyncProducts = async () => {
    try {
      setActionLoading('bulk-sync');
      const res = await marketplaceApi.syncFlipkartProducts();
      if (res.success && res.jobId) {
        toast.success("Bulk sync job started successfully.");
        setSyncJobId(res.jobId);
        setPollingSyncJob(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to trigger bulk sync.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveAttributes = async () => {
    if (!editTargetProduct) return;
    try {
      const res = await marketplaceApi.updateFlipkartProductAttributes({
        productId: editTargetProduct._id,
        hsn: hsn.trim(),
        weight: Number(weight),
        length: Number(length),
        width: Number(width),
        height: Number(height)
      });
      if (res.success) {
        toast.success("Product attributes updated successfully.");
        setShowEditDialog(false);
        setEditTargetProduct(null);
        fetchFlipkartMappings();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to update attributes.");
    }
  };

  const pollSyncJobStatus = async (jobId: string) => {
    try {
      const res = await api.get(`/marketplace-sync/jobs/${jobId}`);
      if (res.success && res.data) {
        const job = res.data;
        setSyncJobState(job);
        
        if (job.status === 'completed' || job.status === 'failed') {
          setPollingSyncJob(false);
          toast.success("Flipkart synchronization finished.");
          fetchData();
          fetchFlipkartMappings();
        } else {
          setPollingSyncJob(true);
        }
      }
    } catch (err) {
      console.error("Failed to poll sync job status:", err);
    }
  };

  useEffect(() => {
    let intervalId: any;
    if (pollingSyncJob && syncJobId) {
      intervalId = setInterval(() => pollSyncJobStatus(syncJobId), 2000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollingSyncJob, syncJobId]);

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    if (connection?.marketplace === 'shopify') {
      pollSyncStatus();
    }
  }, [connection?.id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!id) {
        setError('Marketplace connection ID is missing.');
        return;
      }

      let rawData: any = null;
      try {
        rawData = await api.get(`/marketplaces/connections/${id}`);
      } catch (err: any) {
        console.error('Connection detail fetch error:', err);
        setError(err.message || 'Unable to load marketplace details.');
        setLoading(false);
        return;
      }

      let logsData: any = [];
      try {
        logsData = await api.get(`/marketplaces/connections/${id}/logs`);
      } catch (err) {
        console.error('Connection logs fetch error:', err);
      }

      if (!rawData) {
        setError('Unable to load marketplace details.');
        return;
      }

      let connectionData: MarketplaceConnectionDetail | null = null;
      let statsData: MarketplaceStats | null = null;
      let syncStatusData: SyncStatus | null = null;

      if (rawData.success && rawData.data) {
        connectionData = rawData.data.connection;
        statsData = rawData.data.stats;
        syncStatusData = rawData.data.syncStatus;
        if (rawData.data.lastSyncAt) setLastSyncAt(rawData.data.lastSyncAt);
      } else {
        // Fallback for raw connection object
        connectionData = rawData;
      }

      if (!connectionData || !connectionData.marketplace) {
        setError('Marketplace account not found.');
        return;
      }

      // Safe normalization of optional nested fields
      const normalizedConnection: MarketplaceConnectionDetail = {
        ...connectionData,
        syncSettings: {
          orders: connectionData.syncSettings?.orders ?? true,
          inventory: connectionData.syncSettings?.inventory ?? true,
          products: connectionData.syncSettings?.products ?? true,
          pricing: connectionData.syncSettings?.pricing ?? true,
        }
      };

      setConnection(normalizedConnection);

      if (statsData) {
        setStats({
          products: Number(statsData.products ?? 0),
          orders: Number(statsData.orders ?? 0),
          inventoryItems: Number(statsData.inventoryItems ?? 0),
          failedSyncs: Number(statsData.failedSyncs ?? 0),
        });
      } else {
        setStats({
          products: 0,
          orders: 0,
          inventoryItems: 0,
          failedSyncs: 0
        });
      }

      if (syncStatusData) {
        setSyncStatus({
          queued: Number(syncStatusData.queued ?? 0),
          processing: Number(syncStatusData.processing ?? 0),
          synced: Number(syncStatusData.synced ?? 0),
          failed: Number(syncStatusData.failed ?? 0),
        });
      }

      if (Array.isArray(logsData)) {
        setLogs(logsData);
      } else {
        setLogs([]);
      }
    } catch (err: any) {
      console.error('fetchData error:', err);
      setError('Unable to load marketplace details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDataSilent = async () => {
    try {
      const connRes = await api.get(`/marketplaces/connections/${id}`).catch(() => null);
      if (connRes && connRes.success && connRes.data) {
        setConnection(connRes.data.connection);
        setStats(connRes.data.stats);
        if (connRes.data.lastSyncAt) setLastSyncAt(connRes.data.lastSyncAt);
      }
    } catch (err) {
      console.error('fetchDataSilent error:', err);
    }
  };

  const pollSyncStatus = async () => {
    try {
      const data = await api.get('/marketplaces/shopify/sync/status');
      if (data) {
        setSyncStatus({
          queued: Number(data.queued ?? 0),
          processing: Number(data.processing ?? 0),
          synced: Number(data.successful ?? data.synced ?? 0),
          failed: Number(data.failed ?? 0),
        });

        if (data.lastSyncAt && connection) {
          setConnection(prev => prev ? { ...prev, lastSuccessfulSync: data.lastSyncAt, lastSyncAt: data.lastSyncAt } : null);
        }

        if (data.queued > 0 || data.processing > 0) {
          setIsPollingSync(true);
        } else {
          setIsPollingSync(false);
          fetchDataSilent();
        }
      }
    } catch (error) {
      console.error('Error polling sync status:', error);
    }
  };

  useEffect(() => {
    let intervalId: any;
    if (isPollingSync) {
      intervalId = setInterval(pollSyncStatus, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPollingSync]);

  const handlePublishToShopify = async () => {
    if (!id) return;
    try {
      setIsPublishing(true);
      setPublishProgress('Publishing products to Shopify...');
      setPublishResults([]);

      const data = await marketplaceApi.publishToShopify(id);
      setPublishProgress(null);

      if (data.success) {
        const results: PublishResult[] = data.results || [];
        setPublishResults(results);
        const synced = results.filter(r => r.status === 'synced').length;
        const failed = results.filter(r => r.status === 'failed').length;
        const hasErrors = results.filter(r => r.error).map(r => ({ sku: r.sku, error: r.error }));
        if (hasErrors.length > 0) {
          console.error('[PublishToShopify] Product errors:', hasErrors);
        }
        if (data.lastSyncAt) {
          setLastSyncAt(data.lastSyncAt);
        }
        toast.success(data.message || `Published ${data.published || 0} products, updated ${data.updated || 0}`);
        fetchData();
        if (failed > 0) {
          toast.error(`${failed} product(s) failed to sync. Check Product Statuses for details.`);
        }
      } else {
        toast.error(data.message || 'Publishing failed');
        if (data.shopifyError) {
          console.error('[PublishToShopify] Shopify raw error:', data.shopifyError);
        }
      }
    } catch (error: any) {
      setPublishProgress(null);
      const errResponse = error?.response?.data;
      const errStatus = error?.response?.status;
      const errMessage = errResponse?.message || error?.message || 'Unknown error';
      console.error('[PublishToShopify] Request failed:', {
        status: errStatus,
        message: errMessage,
        shopifyError: errResponse?.shopifyError,
        fullError: error
      });
      toast.error(`Publish failed (${errStatus || 'network'}): ${errMessage}`);
      if (errResponse?.shopifyError) {
        toast.error('Shopify API details logged to console');
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleViewProductStatuses = async () => {
    if (!id) return;
    try {
      setProductStatusLoading(true);
      setShowProductStatuses(true);
      const data = await marketplaceApi.getProductSyncStatuses(id);
      if (data.success) {
        setProductStatuses(data.products || []);
      } else {
        console.error('[ProductStatuses] API error:', data.message);
      }
    } catch (error: any) {
      console.error('[ProductStatuses] Error:', error?.response?.status, error?.response?.data?.message || error.message);
      toast.error(`Failed to load product sync statuses: ${error?.response?.data?.message || error.message}`);
    } finally {
      setProductStatusLoading(false);
    }
  };

  const handleRetryProduct = async (productId: string) => {
    try {
      const data = await marketplaceApi.retryProductSync(productId);
      if (data.success) {
        toast.success(data.message || 'Product retry initiated');
        handleViewProductStatuses();
      } else {
        toast.error(data.message || 'Retry failed');
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || error?.message || 'Unknown error';
      console.error('[RetryProduct] Error:', error?.response?.status, errMsg);
      toast.error(`Retry failed (${error?.response?.status || 'network'}): ${errMsg}`);
    }
  };

  const handleRetryFailed = async () => {
    if (!id) return;
    try {
      setActionLoading('retry-failed');
      const data = await marketplaceApi.retryFailedSyncs(id);
      if (data.success) {
        toast.success(data.message || `Retried ${data.retried} products`);
        fetchData();
        if (showProductStatuses) handleViewProductStatuses();
      } else {
        toast.error(data.message || 'Retry failed');
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || error?.message || 'Unknown error';
      console.error('[RetryFailed] Error:', error?.response?.status, errMsg);
      toast.error(`Retry failed (${error?.response?.status || 'network'}): ${errMsg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (action: 'health-check' | 'sync' | 'disconnect' | 'reconnect') => {
    try {
      setActionLoading(action);
      if (action === 'disconnect') {
        await api.patch(`/marketplaces/connections/${id}/disconnect`, {});
        toast.success('Disconnected successfully');
        fetchData();
      } else if (action === 'reconnect') {
        const response = await api.post(`/marketplaces/connections/${id}/reconnect`, {});
        const data = response?.data || response;
        if (data?.authUrl) window.location.href = data.authUrl;
      } else if (action === 'sync' && connection?.marketplace === 'shopify') {
        // Shopify sync: publish Retail Verse products → Shopify
        setIsPublishing(true);
        setPublishProgress('Syncing products to Shopify...');
        setPublishResults([]);
        setSyncSummary(null);
        try {
          const data = await marketplaceApi.syncToShopify(id);
          if (data.success) {
            if (data.lastSyncAt) setLastSyncAt(data.lastSyncAt);
            setSyncSummary(data);
            setPublishProgress(null);
            fetchData();
          } else {
            toast.error(data.message || 'Sync failed');
            if (data.shopifyError) {
              console.error('[SyncToShopify] Shopify raw error:', data.shopifyError);
            }
          }
        } catch (syncErr: any) {
          const syncErrMsg = syncErr?.response?.data?.message || syncErr?.message || 'Unknown error';
          const syncErrStatus = syncErr?.response?.status;
          console.error('[SyncToShopify] Request failed:', syncErrStatus, syncErrMsg);
          toast.error(`Sync failed (${syncErrStatus || 'network'}): ${syncErrMsg}`);
        } finally {
          setIsPublishing(false);
          setPublishProgress(null);
        }
      } else {
        await api.post(`/marketplaces/connections/${id}/${action}`, {});
        toast.success(`${action === 'sync' ? 'Sync' : 'Health check'} completed`);
        fetchData();
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || error?.message || `Failed to perform ${action}`;
      const errStatus = error?.response?.status;
      console.error(`[${action}] Error:`, errStatus, errMsg);
      toast.error(`${errMsg}${errStatus ? ` (HTTP ${errStatus})` : ''}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-[#d4af37]" />
      </div>
    );
  }

  if (error || !connection) {
    let errorTitle = 'Unable to load marketplace details';
    let errorMessage = error || 'Connection not found';

    const lowerErr = String(errorMessage).toLowerCase();
    if (lowerErr.includes('invalid') || lowerErr.includes('malformed') || lowerErr.includes('400')) {
      errorTitle = 'Invalid Marketplace Account';
      errorMessage = 'The marketplace account ID is invalid.';
    } else if (lowerErr.includes('forbidden') || lowerErr.includes('access') || lowerErr.includes('authorized') || lowerErr.includes('403')) {
      errorTitle = 'Forbidden';
      errorMessage = 'You do not have access to this marketplace account.';
    } else if (lowerErr.includes('not found') || lowerErr.includes('missing') || lowerErr.includes('404')) {
      errorTitle = 'Not Found';
      errorMessage = 'This connected marketplace account could not be found.';
    }

    return (
      <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/marketplaces')} className="rounded-full bg-zinc-100 dark:bg-zinc-800">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">Marketplace Details</h1>
              <p className="text-muted-foreground mt-1">Error loading integration information.</p>
            </div>
          </div>
        </div>

        <Card className="border-rose-200/60 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20 shadow-sm max-w-lg mx-auto mt-8">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-rose-900 dark:text-rose-100">{errorTitle}</h3>
            <p className="text-sm text-rose-600/80 dark:text-rose-400/80">{errorMessage}</p>
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button onClick={() => navigate('/dashboard/marketplaces')} variant="outline">
                Back to Marketplaces
              </Button>
              <Button onClick={fetchData} className="bg-[#d4af37] text-white hover:bg-[#b8860b]">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const healthStatus = typeof connection.apiHealth === 'string' ? connection.apiHealth : (connection.apiHealth?.status || connection.health?.status || 'unknown');

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/marketplaces')} className="rounded-full bg-zinc-100 dark:bg-zinc-800">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 capitalize">
                {connection.marketplace === 'shopify' ? 'Shopify' : connection.marketplace} — {connection.sellerAccountName || connection.accountName || 'Connected Store'}
              </h1>
              <StatusBadge status={connection.status} />
            </div>
            <p className="text-muted-foreground mt-1">Manage connection settings and view activity logs.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {connection.status === 'connected' ? (
            <>
              {connection.marketplace === 'shopify' && (
                <Button
                  onClick={handlePublishToShopify}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={isPublishing}
                >
                  {isPublishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {isPublishing ? 'Publishing...' : 'Publish/Sync to Shopify'}
                </Button>
              )}
              <Button onClick={() => handleAction('health-check')} variant="outline" disabled={!!actionLoading}>
                {actionLoading === 'health-check' ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
                Health Check
              </Button>
              <Button onClick={() => handleAction('sync')} className="bg-[#d4af37] text-white hover:bg-[#b8860b]" disabled={!!actionLoading || isPollingSync}>
                {actionLoading === 'sync' || isPollingSync ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                {isPollingSync || actionLoading === 'sync' ? 'Syncing...' : 'Sync Now'}
              </Button>
            </>
          ) : (
            <Button onClick={() => handleAction('reconnect')} disabled={!!actionLoading}>
              <Power className="w-4 h-4 mr-2" /> Reconnect
            </Button>
          )}
        </div>
      </div>      {connection.marketplace === 'flipkart' && connection.status === 'connected' && (
        <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-900 p-1 max-w-xs mb-4">
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'overview' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'mappings' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => {
              setActiveTab('mappings');
              fetchFlipkartMappings();
            }}
          >
            Product Mappings
          </button>
        </div>
      )}

      {(activeTab === 'overview' || connection.marketplace !== 'flipkart') ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="md:col-span-2 space-y-6">
            {/* Account Info */}
            <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Account Name</p>
                  <p className="font-semibold">{connection.sellerAccountName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Seller ID / Shop Domain</p>
                  <p className="font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded inline-block truncate max-w-full">{connection.sellerId || connection.shopDomain || connection.storeUrl || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Connected On</p>
                  <p>{formatDate(connection.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Last Sync</p>
                  <p>{formatDate(lastSyncAt || connection.lastSuccessfulSync)}</p>
                </div>
                {connection.lastError && (
                  <div className="col-span-2 mt-2 p-3 bg-rose-50 dark:bg-rose-500/10 rounded-md border border-rose-200 dark:border-rose-500/20">
                    <p className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" /> Last Error:
                    </p>
                    <p className="text-rose-500 dark:text-rose-300 mt-1">{connection.lastError}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sync Statistics */}
            <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Sync Statistics</CardTitle>
                  <CardDescription>Catalog and order synchronization metrics.</CardDescription>
                </div>
                {connection.marketplace === 'shopify' && (
                  <Button variant="outline" size="sm" onClick={handleViewProductStatuses}>
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> View Product Statuses
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 rounded-xl flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-lg">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Mapped Products</p>
                    <p className="text-lg font-bold">{stats.products}</p>
                  </div>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 rounded-xl flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Orders</p>
                    <p className="text-lg font-bold">{stats.orders}</p>
                  </div>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 rounded-xl flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Inventory Items</p>
                    <p className="text-lg font-bold">{stats.inventoryItems}</p>
                  </div>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 rounded-xl flex items-center gap-3">
                  <div className="p-2 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Failed Syncs</p>
                    <p className="text-lg font-bold">{stats.failedSyncs}</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t border-zinc-100 dark:border-zinc-800 py-3 px-6 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last Sync: {formatDate(lastSyncAt)}
                </span>
                <span className="flex items-center gap-3">
                  {syncStatus.synced > 0 && <span className="text-emerald-600 font-medium">{syncStatus.synced} Synced</span>}
                  {syncStatus.failed > 0 && <span className="text-rose-600 font-medium">{syncStatus.failed} Failed</span>}
                  {(syncStatus.notSynced || 0) > 0 && <span className="text-muted-foreground">{syncStatus.notSynced} Not Synced</span>}
                </span>
              </CardFooter>
              {isPublishing && (
                <CardFooter className="bg-blue-500/5 border-t border-blue-500/10 py-3 px-6 flex items-center text-xs text-blue-600 dark:text-blue-400">
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  {publishProgress || 'Publishing products to Shopify...'}
                </CardFooter>
              )}
              {isPollingSync && (
                <CardFooter className="bg-amber-500/5 border-t border-amber-500/10 py-3 px-6 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing in progress...
                  </span>
                  <span className="font-semibold">
                    Queued: {syncStatus.queued} | Active: {syncStatus.processing} | Synced: {syncStatus.synced} | Failed: {syncStatus.failed}
                  </span>
                </CardFooter>
              )}
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* API Health */}
            <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
              <CardHeader className="pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <CardTitle className="flex items-center justify-between">
                  API Health
                  <HealthBadge health={healthStatus} />
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Authentication</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Orders API</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Products API</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Inventory API</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Last Checked</span>
                  <span>{formatTime(connection.lastHealthCheck)}</span>
                </div>
              </CardContent>
            </Card>
            {/* Shopify Configuration */}
            {connection.marketplace === 'shopify' && (
              <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="w-5 h-5"/> Shopify Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Shop Domain</span>
                    <span className="font-mono text-xs">{connection.shopDomain || connection.storeUrl || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">API Version</span>
                    <span className="font-mono text-xs">2024-07</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Shopify Location</span>
                    <span className="font-semibold">
                      {typeof connection.metadata?.locationId === 'string' && connection.metadata.locationId.trim()
                        ? connection.metadata.locationId.split('/').pop()
                        : 'Not configured'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Product Sync Status</span>
                    <span className={`font-semibold ${connection.syncSettings?.products ? 'text-emerald-600' : 'text-zinc-500'}`}>
                      {connection.syncSettings?.products ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Inventory Sync Status</span>
                    <span className={`font-semibold ${connection.syncSettings?.inventory ? 'text-emerald-600' : 'text-zinc-500'}`}>
                      {connection.syncSettings?.inventory ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Automatic Sync Status</span>
                    <span className={`font-semibold ${connection.isSyncEnabled ? 'text-emerald-600' : 'text-zinc-500'}`}>
                      {connection.isSyncEnabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Approved Scopes</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.isArray(connection.metadata?.scopes) && connection.metadata.scopes.length > 0 ? (
                        connection.metadata.scopes.map((scope: string) => (
                          <Badge key={scope} variant="outline" className="text-[10px] bg-zinc-50/50 py-0 px-1.5 font-normal">
                            {scope}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-zinc-400 italic">No approved scopes</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sync Settings */}
            <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5"/> Sync Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sync-orders" className="flex flex-col space-y-1">
                    <span>Orders</span>
                    <span className="font-normal text-xs text-muted-foreground">Import orders automatically</span>
                  </Label>
                  <Switch id="sync-orders" checked={connection.syncSettings?.orders ?? false} disabled />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sync-inventory" className="flex flex-col space-y-1">
                    <span>Inventory</span>
                    <span className="font-normal text-xs text-muted-foreground">Sync stock levels in real-time</span>
                  </Label>
                  <Switch id="sync-inventory" checked={connection.syncSettings?.inventory ?? false} disabled />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sync-products" className="flex flex-col space-y-1">
                    <span>Products</span>
                    <span className="font-normal text-xs text-muted-foreground">Sync catalog and images</span>
                  </Label>
                  <Switch id="sync-products" checked={connection.syncSettings?.products ?? false} disabled />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sync-pricing" className="flex flex-col space-y-1">
                    <span>Pricing</span>
                    <span className="font-normal text-xs text-muted-foreground">Update prices from Retail Verse</span>
                  </Label>
                  <Switch id="sync-pricing" checked={connection.syncSettings?.pricing ?? false} disabled />
                </div>
              </CardContent>
              <CardFooter className="pt-0 justify-center pb-6">
                <p className="text-xs text-muted-foreground text-center">Contact support to change sync settings.</p>
              </CardFooter>
            </Card>

            {/* Danger Zone */}
            <Card className="border-rose-200/60 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20 shadow-sm">
              <CardContent className="p-6 text-center">
                <h3 className="font-bold text-rose-700 dark:text-rose-400 mb-2">Danger Zone</h3>
                <p className="text-sm text-rose-600/80 dark:text-rose-400/80 mb-4">Disconnecting will pause all synchronization immediately.</p>
                <Button 
                  variant="destructive" 
                  className="w-full"
                  onClick={() => handleAction('disconnect')}
                  disabled={connection.status === 'disconnected' || !!actionLoading}
                >
                  Disconnect Account
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Mapping Grid header and search */}
          <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Catalog Mapping Grid</CardTitle>
                <CardDescription>Validate, map, and synchronize your products to Flipkart Seller Central.</CardDescription>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Input
                  placeholder="Search products..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="max-w-xs bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 rounded-xl"
                />
                <Button onClick={handleBulkSyncProducts} className="bg-[#d4af37] text-white hover:bg-[#b8860b] rounded-xl text-xs gap-2 shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" /> Bulk Sync Products
                </Button>
              </div>
            </div>

            {/* Sync Job Progress bar */}
            {pollingSyncJob && syncJobState && (
              <div className="p-6 bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/30 space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold text-blue-700 dark:text-blue-300">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Synchronizing Flipkart listings...
                  </span>
                  <span>{Math.round(((syncJobState.processedCount || 0) / (syncJobState.totalCount || 1)) * 100)}%</span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-full transition-all duration-300"
                    style={{ width: `${Math.round(((syncJobState.processedCount || 0) / (syncJobState.totalCount || 1)) * 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs font-medium text-muted-foreground pt-2">
                  <div>Total: <span className="font-bold text-zinc-900 dark:text-zinc-100">{syncJobState.totalCount || 0}</span></div>
                  <div>Processed: <span className="font-bold text-zinc-900 dark:text-zinc-100">{syncJobState.processedCount || 0}</span></div>
                  <div className="text-emerald-600">Created: <span className="font-bold">{syncJobState.createdCount || 0}</span></div>
                  <div className="text-blue-600">Updated: <span className="font-bold">{syncJobState.updatedCount || 0}</span></div>
                  <div className="text-rose-600">Failed: <span className="font-bold">{syncJobState.failedCount || 0}</span></div>
                </div>
              </div>
            )}

            {/* Mappings Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/50">
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>RV Stock / Price</TableHead>
                    <TableHead>Flipkart Mapping</TableHead>
                    <TableHead>Mapping Status</TableHead>
                    <TableHead>Sync Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingMappings ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#d4af37]" />
                      </TableCell>
                    </TableRow>
                  ) : mappings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                        No Flipkart mappings found. Select a product to connect.
                      </TableCell>
                    </TableRow>
                  ) : (
                    mappings
                      .filter(m => {
                        const prod = m.retailVerseProductId || {};
                        const nameMatch = prod.name && prod.name.toLowerCase().includes(localSearch.toLowerCase());
                        const skuMatch = prod.sku && prod.sku.toLowerCase().includes(localSearch.toLowerCase());
                        const fsnMatch = m.flipkartFsn && m.flipkartFsn.toLowerCase().includes(localSearch.toLowerCase());
                        return nameMatch || skuMatch || fsnMatch;
                      })
                      .map((m) => {
                        const prod = m.retailVerseProductId || {};
                        return (
                          <TableRow key={m._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30">
                            <TableCell className="max-w-[200px]">
                              <div className="flex items-center gap-3">
                                {prod.image ? (
                                  <img src={prod.image} alt="" className="w-10 h-10 rounded-xl object-cover bg-zinc-50 border shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                                    <Package className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-semibold text-zinc-900 dark:text-zinc-50 truncate" title={prod.name}>{prod.name || 'N/A'}</p>
                                  <p className="text-xs text-muted-foreground truncate">{prod.category || 'No Category'}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{prod.sku || 'N/A'}</TableCell>
                            <TableCell className="text-xs">
                              <div>Stock: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{prod.stock !== undefined ? prod.stock : 'N/A'}</span></div>
                              <div className="mt-0.5">Price: <span className="font-semibold text-zinc-955 dark:text-zinc-50">₹{prod.price || '0'}</span></div>
                              {prod.originalPrice > prod.price && (
                                <div className="text-[10px] text-muted-foreground line-through">MRP: ₹{prod.originalPrice}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs space-y-1">
                              {m.flipkartFsn ? (
                                <>
                                  <div>FSN: <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[11px] font-bold text-zinc-800 dark:text-zinc-200">{m.flipkartFsn}</span></div>
                                  {m.flipkartListingId && (
                                    <div className="text-muted-foreground text-[10px]">Listing ID: <span className="font-mono">{m.flipkartListingId}</span></div>
                                  )}
                                </>
                              ) : (
                                <span className="text-amber-500 font-medium italic">Unmapped</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                m.mappingStatus === 'SYNCED' ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/20 rounded-full font-medium' :
                                m.mappingStatus === 'READY' || m.mappingStatus === 'READY_TO_SYNC' ? 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-200 dark:border-blue-500/20 rounded-full font-medium' :
                                m.mappingStatus === 'NEEDS_FSN_MAPPING' ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-200 dark:border-amber-500/20 rounded-full font-medium' :
                                'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border-rose-200 dark:border-rose-500/20 rounded-full font-medium'
                              }>
                                {m.mappingStatus?.replace(/_/g, ' ') || 'NEEDS MAPPING'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {m.lastSyncedAt ? (
                                <>
                                  <div className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Synced</div>
                                  <div className="text-muted-foreground text-[10px] mt-0.5">{new Date(m.lastSyncedAt).toLocaleString()}</div>
                                </>
                              ) : (
                                <span className="text-zinc-400">Never synced</span>
                              )}
                              {m.lastErrorMessage && (
                                <div className="text-[10px] text-rose-500 mt-1 max-w-[150px] truncate" title={m.lastErrorMessage}>
                                  Err: {m.lastErrorMessage}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right space-y-1 sm:space-y-0 shrink-0">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => {
                                  setSearchTargetProduct(prod);
                                  setSearchQuery(prod.name || '');
                                  setManualFsn(m.flipkartFsn || '');
                                  setSearchResults([]);
                                  setShowSearchDialog(true);
                                }}>
                                  Map FSN
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => {
                                  setEditTargetProduct(prod);
                                  setHsn(prod.hsn || '');
                                  setWeight(prod.weight || 0.5);
                                  setLength(prod.dimensions?.length || 10);
                                  setWidth(prod.dimensions?.width || 10);
                                  setHeight(prod.dimensions?.height || 10);
                                  setShowEditDialog(true);
                                }}>
                                  Attributes
                                </Button>
                                {m.flipkartFsn && (
                                  <Button size="sm" className="h-8 bg-[#d4af37] text-white hover:bg-[#b8860b] rounded-xl text-xs" onClick={() => handleSyncSingleProduct(prod._id)} disabled={actionLoading === `sync-product-${prod._id}`}>
                                    {actionLoading === `sync-product-${prod._id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sync'}
                                  </Button>
                                )}
                                {m.flipkartFsn && (
                                  <Button size="sm" variant="ghost" className="h-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50/50 rounded-xl" onClick={() => handleUnmapProduct(m._id)}>
                                    Unmap
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* Product Sync Statuses Dialog */}
      <Dialog open={showProductStatuses} onOpenChange={(open) => { if (!open) setShowProductStatuses(false); }}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Product Sync Statuses</DialogTitle>
            <DialogDescription>
              Per-product sync status for {connection.marketplace === 'shopify' ? 'Shopify' : connection.marketplace}.
              {productStatuses.filter(p => p.status === 'synced').length} synced,
              {productStatuses.filter(p => p.status === 'failed').length} failed,
              {productStatuses.filter(p => p.status === 'syncing').length} syncing,
              {productStatuses.filter(p => p.status === 'not_synced').length} not synced
            </DialogDescription>
          </DialogHeader>

          {connection.marketplace === 'shopify' && productStatuses.filter(p => p.status === 'failed').length > 0 && (
            <div className="flex justify-end mb-2">
              <Button size="sm" variant="outline" className="text-rose-600 border-rose-300" onClick={handleRetryFailed} disabled={actionLoading === 'retry-failed'}>
                {actionLoading === 'retry-failed' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                Retry All Failed
              </Button>
            </div>
          )}

          {productStatusLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#d4af37]" /></div>
          ) : productStatuses.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No products found.</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Shopify ID</TableHead>
                    <TableHead>Last Synced</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productStatuses.map((p, idx) => (
                    <TableRow key={p._id}>
                      <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {p.image && (
                            <img src={p.image} alt="" className="w-8 h-8 rounded object-cover bg-zinc-100" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          )}
                          <span className="font-medium truncate max-w-[180px]">{p.name || 'Untitled'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.sku || '-'}</TableCell>
                      <TableCell>
                        <ProductStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        {p.shopifyProductId ? (
                          <span className="font-mono text-[10px] text-muted-foreground truncate block max-w-[120px]" title={p.shopifyProductId}>
                            {p.shopifyProductId.split('/').pop()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.lastSyncedAt ? new Date(p.lastSyncedAt).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.status === 'failed' && (
                          <Button size="sm" variant="ghost" className="text-rose-600 h-7 text-xs" onClick={() => handleRetryProduct(p._id)}>
                            <RotateCcw className="w-3 h-3 mr-1" /> Retry
                          </Button>
                        )}
                        {p.error && (
                          <span className="text-[10px] text-rose-500 block max-w-[150px] truncate" title={p.error}>
                            {p.error}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductStatuses(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Results Dialog */}
      <Dialog open={publishResults.length > 0} onOpenChange={(open) => { if (!open) setPublishResults([]); }}>
        <DialogContent className="sm:max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Publishing Results</DialogTitle>
            <DialogDescription>
              {publishResults.filter(r => r.status === 'synced').length} products published successfully,
              {publishResults.filter(r => r.status === 'failed').length} failed
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Shopify Product ID</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publishResults.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs">{r.sku || '-'}</TableCell>
                    <TableCell>
                      <ProductStatusBadge status={r.status as any} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.shopifyProductId ? r.shopifyProductId.split('/').pop() : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-rose-500 max-w-[200px] truncate" title={r.error}>
                      {r.error || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishResults([])}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Summary Dialog */}
      <Dialog open={!!syncSummary} onOpenChange={(open) => { if (!open) setSyncSummary(null); }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Sync Completed</DialogTitle>
            <DialogDescription>Shopify catalog synchronization stats:</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <span className="text-muted-foreground">Total Products Checked:</span>
              <span className="font-bold">{syncSummary?.total || 0}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 text-emerald-600 dark:text-emerald-400">
              <span className="font-medium">Created (New on Shopify):</span>
              <span className="font-bold">{syncSummary?.created || 0}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 text-blue-600 dark:text-blue-400">
              <span className="font-medium">Updated:</span>
              <span className="font-bold">{syncSummary?.updated || 0}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 text-amber-600 dark:text-amber-400">
              <span className="font-medium">Skipped:</span>
              <span className="font-bold">{syncSummary?.skipped || 0}</span>
            </div>
            <div className="flex justify-between text-rose-600 dark:text-rose-400">
              <span className="font-medium">Failed:</span>
              <span className="font-bold">{syncSummary?.failed || 0}</span>
            </div>
            {syncSummary?.errors?.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="font-bold text-rose-600 dark:text-rose-400">Sync Details &amp; Errors:</div>
                <div className="max-h-[180px] overflow-y-auto space-y-2 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs">
                  {syncSummary.errors.map((err: any, idx: number) => (
                    <div key={idx} className="flex justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800/60 pb-1.5 last:border-0 last:pb-0">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">{err.sku || 'N/A'}:</span>
                      <span className="text-muted-foreground text-right">{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setSyncSummary(null)} className="rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flipkart Catalog Search Dialog */}
      <Dialog open={showSearchDialog} onOpenChange={(open) => { if (!open) setShowSearchDialog(false); }}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Map Flipkart Catalog (FSN)</DialogTitle>
            <DialogDescription>
              Link Retail Verse product <strong>{searchTargetProduct?.name}</strong> (SKU: {searchTargetProduct?.sku}) to a Flipkart FSN.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Manual FSN Input */}
            <div className="space-y-2 border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <Label htmlFor="manual-fsn" className="font-semibold text-zinc-900 dark:text-zinc-100">Manual FSN Entry</Label>
              <div className="flex gap-2">
                <Input
                  id="manual-fsn"
                  placeholder="Enter 10-character Flipkart FSN"
                  value={manualFsn}
                  onChange={(e) => setManualFsn(e.target.value.toUpperCase())}
                  maxLength={10}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800"
                />
                <Button className="bg-[#d4af37] text-white hover:bg-[#b8860b] rounded-xl shrink-0 text-xs" onClick={() => handleSaveMapping(manualFsn)}>
                  Save Mapping
                </Button>
              </div>
            </div>

            {/* Catalog Search */}
            <div className="space-y-2">
              <Label htmlFor="catalog-query" className="font-semibold text-zinc-900 dark:text-zinc-100">Search Flipkart Catalogue</Label>
              <div className="flex gap-2">
                <Input
                  id="catalog-query"
                  placeholder="Search keywords or titles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800"
                />
                <Button className="rounded-xl gap-1 shrink-0 text-xs" variant="secondary" onClick={handleSearchCatalog} disabled={searchingCatalog}>
                  {searchingCatalog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Search
                </Button>
              </div>
            </div>

            {/* Catalog Search Results */}
            {searchingCatalog ? (
              <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-[#d4af37]" /></div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-3 max-h-[250px] overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 bg-zinc-50/50 dark:bg-zinc-900/30">
                {searchResults.map((res: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center gap-4 pb-2 border-b last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">{res.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">FSN: {res.fsn} • Category: {res.category}</p>
                    </div>
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shrink-0" onClick={() => handleSaveMapping(res.fsn)}>
                      Select
                    </Button>
                  </div>
                ))}
              </div>
            ) : searchQuery && !searchingCatalog && (
              <p className="text-center text-xs text-muted-foreground py-4">No search results display. Enter FSN manually above.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowSearchDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Flipkart Attributes Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) setShowEditDialog(false); }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product Sync Attributes</DialogTitle>
            <DialogDescription>
              Set package weight, dimensions and HSN code for SKU <strong>{editTargetProduct?.sku}</strong> to comply with Flipkart eligibility requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="hsn-code" className="font-semibold text-zinc-850 dark:text-zinc-100">HSN Code</Label>
              <Input
                id="hsn-code"
                placeholder="Enter HSN Code"
                value={hsn}
                onChange={(e) => setHsn(e.target.value)}
                className="rounded-xl border-zinc-200 dark:border-zinc-800"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pkg-weight" className="font-semibold text-zinc-850 dark:text-zinc-100">Package Weight (kg)</Label>
              <Input
                id="pkg-weight"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 0.50"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="rounded-xl border-zinc-200 dark:border-zinc-800"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pkg-length" className="font-semibold text-xs">Length (cm)</Label>
                <Input
                  id="pkg-length"
                  type="number"
                  placeholder="L"
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pkg-width" className="font-semibold text-xs">Width (cm)</Label>
                <Input
                  id="pkg-width"
                  type="number"
                  placeholder="W"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pkg-height" className="font-semibold text-xs">Height (cm)</Label>
                <Input
                  id="pkg-height"
                  type="number"
                  placeholder="H"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="rounded-xl border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button className="bg-[#d4af37] text-white hover:bg-[#b8860b] rounded-xl" onClick={handleSaveAttributes}>
              Save Attributes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'synced': return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-500/20">Synced</Badge>;
    case 'syncing': return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing</Badge>;
    case 'failed': return <Badge variant="destructive">Failed</Badge>;
    case 'not_synced': return <Badge variant="outline" className="text-muted-foreground">Not Synced</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
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
    case 'healthy': return <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-600">Healthy</Badge>;
    case 'degraded':
    case 'warning': return <Badge className="bg-amber-500 text-white hover:bg-amber-600 border-amber-600">Warning</Badge>;
    case 'down':
    case 'unhealthy': return <Badge className="bg-rose-500 text-white hover:bg-rose-600 border-rose-600">Unhealthy</Badge>;
    default: return <Badge variant="outline">Unknown</Badge>;
  }
}
