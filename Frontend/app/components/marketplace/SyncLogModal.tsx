import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  Search, 
  Package, 
  AlertCircle, 
  ExternalLink,
  Loader2,
  X
} from 'lucide-react';
import * as marketplaceApi from '../../services/marketplaceApi';
import { marketplaceLogoMap } from './MarketplaceCard';

interface SyncListingItem {
  _id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  imageUrl?: string;
  category?: string;
  marketplace: string;
  externalProductId: string;
  syncStatus: 'SYNCED' | 'FAILED' | 'PENDING' | string;
  lastError: string;
  updatedAt: string;
}

interface SyncLogModalProps {
  channel: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTriggerSync: (channel: string) => Promise<void>;
  isSyncing: boolean;
}

export function SyncLogModal({
  channel,
  isOpen,
  onClose,
  onTriggerSync,
  isSyncing
}: SyncLogModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    stats: { totalProducts: number; syncedProducts: number; failedProducts: number; pendingProducts: number };
    lastSyncAt: string | null;
    status: string;
    listings: SyncListingItem[];
  } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'SYNCED' | 'FAILED' | 'PENDING'>('ALL');

  const fetchLogs = async () => {
    if (!channel) return;
    try {
      setLoading(true);
      const res = await marketplaceApi.getMarketplaceSyncLogs(channel);
      if (res && res.success) {
        setData(res);
      }
    } catch (err) {
      console.error('Failed to load sync logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && channel) {
      fetchLogs();
    } else {
      setData(null);
      setSearch('');
      setFilter('ALL');
    }
  }, [isOpen, channel]);

  if (!channel) return null;

  const channelDisplayName = channel.charAt(0).toUpperCase() + channel.slice(1);
  const logoSrc = marketplaceLogoMap[channel] || '/marketplace-logos/amazon.svg';

  const stats = data?.stats || {
    totalProducts: 0,
    syncedProducts: 0,
    failedProducts: 0,
    pendingProducts: 0
  };

  const listings = data?.listings || [];

  const filteredListings = listings.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      (item.externalProductId && item.externalProductId.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (filter === 'ALL') return true;
    return item.syncStatus === filter;
  });

  const lastSyncDateFormatted = data?.lastSyncAt 
    ? new Date(data.lastSyncAt).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'Never';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-white dark:bg-zinc-800 rounded-xl p-2 flex items-center justify-center border border-zinc-200/80 dark:border-zinc-700 shadow-xs shrink-0">
              <img src={logoSrc} alt={channelDisplayName} className="w-full h-full object-contain" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                <span>{channelDisplayName} Inventory Sync Log</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Last Synced: <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{lastSyncDateFormatted}</strong></span>
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
              className="rounded-xl text-xs h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isSyncing}
              onClick={() => onTriggerSync(channel).then(fetchLogs)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs h-9 font-semibold"
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Sync Inventory Now
            </Button>
          </div>
        </div>

        {/* Real-time KPI summary counters */}
        <div className="px-6 py-4 bg-zinc-100/50 dark:bg-zinc-800/20 border-b border-zinc-100 dark:border-zinc-800 grid grid-cols-4 gap-3">
          <div className="bg-white dark:bg-zinc-800/70 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Total Products</span>
            <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">{stats.totalProducts}</span>
          </div>

          <div className="bg-white dark:bg-zinc-800/70 p-3 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 flex flex-col">
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Synced
            </span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.syncedProducts}</span>
          </div>

          <div className="bg-white dark:bg-zinc-800/70 p-3 rounded-xl border border-rose-200/60 dark:border-rose-800/40 flex flex-col">
            <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Failed Listings
            </span>
            <span className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{stats.failedProducts}</span>
          </div>

          <div className="bg-white dark:bg-zinc-800/70 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 flex flex-col">
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Pending
            </span>
            <span className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.pendingProducts}</span>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 px-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, SKU, or ID..."
              className="pl-9 h-9 text-xs rounded-xl border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
            />
          </div>

          <div className="flex items-center gap-1 w-full sm:w-auto bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            {(['ALL', 'SYNCED', 'FAILED', 'PENDING'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filter === tab
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Itemized Listings List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[280px]">
          {loading && listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs">Loading marketplace listings...</span>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-400 gap-2 text-center">
              <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No listings found</span>
              <span className="text-xs text-zinc-400 max-w-sm">
                {listings.length === 0
                  ? 'Click "Sync Inventory Now" to push your products to this marketplace catalog.'
                  : 'No items match your active search or filter criteria.'}
              </span>
            </div>
          ) : (
            filteredListings.map(item => (
              <div
                key={item._id}
                className="p-3.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-center">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-5 h-5 text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-md">
                      {item.name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>SKU: <code className="font-mono text-zinc-700 dark:text-zinc-300">{item.sku}</code></span>
                      <span>•</span>
                      <span>Stock: <strong className="text-zinc-700 dark:text-zinc-300">{item.stock}</strong></span>
                      <span>•</span>
                      <span>Price: <strong className="text-zinc-700 dark:text-zinc-300">₹{item.price}</strong></span>
                      {item.externalProductId && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-mono text-[10px] bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">
                            {channel.toUpperCase()} ID: {item.externalProductId}
                          </span>
                        </>
                      )}
                    </div>
                    {item.syncStatus === 'FAILED' && item.lastError && (
                      <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Error: {item.lastError}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.syncStatus === 'SYNCED' && (
                    <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 gap-1 text-[11px] px-2.5 py-0.5 font-semibold">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Synced
                    </Badge>
                  )}
                  {item.syncStatus === 'FAILED' && (
                    <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800 gap-1 text-[11px] px-2.5 py-0.5 font-semibold">
                      <AlertTriangle className="w-3 h-3 text-rose-600" /> Failed
                    </Badge>
                  )}
                  {item.syncStatus === 'PENDING' && (
                    <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800 gap-1 text-[11px] px-2.5 py-0.5 font-semibold">
                      <Clock className="w-3 h-3 text-amber-600" /> Pending
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 px-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-between items-center sm:justify-between">
          <span className="text-xs text-zinc-400">
            Showing {filteredListings.length} of {listings.length} total mapped products
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl text-xs h-9">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
