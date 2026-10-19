import React from 'react';
import { 
  Store, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Loader2, 
  FileText, 
  PowerOff,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';

export interface MarketplaceItem {
  code: string;
  name: string;
  displayName: string;
  description: string;
  logo: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'SYNCING' | 'FAILED' | 'connected' | 'disconnected' | string;
  connectionId?: string | null;
  sellerId?: string | null;
  sellerAccountId?: string | null;
  accountName?: string | null;
  storeUrl?: string | null;
  autoSync?: boolean;
  syncStats?: {
    totalProducts: number;
    syncedProducts: number;
    failedProducts: number;
  };
  lastSyncAt?: string | Date | null;
  connectedAt?: string | Date | null;
  apiHealth?: any;
}

interface MarketplaceCardProps {
  marketplace: MarketplaceItem;
  onConnect: (channel: string) => void;
  onSyncInventory: (channel: string) => void;
  onToggleAutoSync: (channel: string, currentVal: boolean) => void;
  onDisconnect: (channel: string) => void;
  onOpenSyncLogs: (channel: string) => void;
  loadingAction: string | null;
}

export const marketplaceLogoMap: Record<string, string> = {
  flipkart: '/marketplace-logos/flipkart.svg',
  amazon: '/marketplace-logos/amazon.svg',
  'amazon-sp-api': '/marketplace-logos/amazon.svg',
  meesho: '/marketplace-logos/meesho.svg',
  swiggy: '/marketplace-logos/swiggy.svg',
  myntra: '/marketplace-logos/myntra.svg',
  shopify: '/marketplace-logos/shopify.svg',
};

export function MarketplaceCard({
  marketplace: mp,
  onConnect,
  onSyncInventory,
  onToggleAutoSync,
  onDisconnect,
  onOpenSyncLogs,
  loadingAction,
}: MarketplaceCardProps) {
  const normStatus = (mp.status || 'DISCONNECTED').toUpperCase();
  const isConnected = normStatus === 'CONNECTED';
  const isSyncing = normStatus === 'SYNCING' || loadingAction === `sync-${mp.code}`;
  const isError = normStatus === 'FAILED' || normStatus === 'ERROR' || normStatus === 'CONNECTION_ERROR';
  const isConnecting = loadingAction === `connect-${mp.code}`;
  const isDisconnecting = loadingAction === `disconnect-${mp.code}`;
  const isToggling = loadingAction === `toggle-${mp.code}`;

  const logoSrc = marketplaceLogoMap[mp.code] || mp.logo || '/marketplace-logos/amazon.svg';

  // Status badge style & label
  const renderStatusBadge = () => {
    if (isSyncing) {
      return (
        <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
          <Loader2 className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
          Syncing
        </Badge>
      );
    }
    if (isConnected) {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          Connected
        </Badge>
      );
    }
    if (isError) {
      return (
        <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
          <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
          Error
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-zinc-50 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium">
        <XCircle className="w-3 h-3 text-zinc-400" />
        Disconnected
      </Badge>
    );
  };

  const totalSynced = mp.syncStats?.syncedProducts ?? 0;
  const totalFailed = mp.syncStats?.failedProducts ?? 0;
  const lastSyncFormatted = mp.lastSyncAt ? new Date(mp.lastSyncAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'Never';

  return (
    <Card className="flex flex-col justify-between overflow-hidden border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:border-zinc-300 dark:hover:border-zinc-700">
      <div>
        <CardHeader className="pb-3 pt-5 px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="w-14 h-14 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-2.5 flex items-center justify-center border border-zinc-100 dark:border-zinc-700/60 shrink-0 shadow-xs">
              <img
                src={logoSrc}
                alt={mp.displayName || mp.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="%23f4f4f5"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" font-weight="bold" fill="%2371717a" text-anchor="middle" dy=".3em">${(mp.name || 'MP').substring(0, 3).toUpperCase()}</text></svg>`;
                }}
              />
            </div>
            {renderStatusBadge()}
          </div>

          <div className="mt-3">
            <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center justify-between">
              <span>{mp.displayName || mp.name}</span>
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 min-h-[32px]">
              {mp.description}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="px-5 py-2">
          {isConnected || isSyncing ? (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800 space-y-2 text-xs">
              {/* Seller info */}
              <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-400 font-medium">Seller ID</span>
                <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[150px]">
                  {mp.sellerId || mp.sellerAccountId || 'N/A'}
                </span>
              </div>

              {/* Sync counters */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 dark:border-zinc-700/60">
                <span className="text-zinc-400 font-medium">Sync Status</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {totalSynced} synced
                  </span>
                  {totalFailed > 0 && (
                    <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      {totalFailed} failed
                    </span>
                  )}
                </div>
              </div>

              {/* Last Sync */}
              <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Last Synced
                </span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{lastSyncFormatted}</span>
              </div>

              {/* Auto-Sync Toggle Control */}
              <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Auto-Sync</span>
                  <span className="text-[10px] text-zinc-400">
                    {mp.autoSync !== false ? 'Active (Automated)' : 'Inactive (Manual)'}
                  </span>
                </div>
                <Switch
                  checked={mp.autoSync !== false}
                  disabled={isToggling}
                  onCheckedChange={() => onToggleAutoSync(mp.code, mp.autoSync !== false)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>
            </div>
          ) : (
            <div className="bg-zinc-50/70 dark:bg-zinc-800/30 rounded-xl p-3 border border-dashed border-zinc-200 dark:border-zinc-700/60 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 min-h-[94px]">
              <Store className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>
                One-click OAuth integration. Direct sync for catalog, real-time inventory, and orders.
              </span>
            </div>
          )}
        </CardContent>
      </div>

      <CardFooter className="p-5 pt-3 flex flex-col gap-2">
        {isConnected || isSyncing ? (
          <div className="w-full space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="default"
                size="sm"
                disabled={isSyncing}
                onClick={() => onSyncInventory(mp.code)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold h-9 shadow-xs"
              >
                {isSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Sync Inventory
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenSyncLogs(mp.code)}
                className="w-full border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold h-9 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
                Sync Logs
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              disabled={isDisconnecting}
              onClick={() => onDisconnect(mp.code)}
              className="w-full text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-medium h-8"
            >
              {isDisconnecting ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <PowerOff className="w-3 h-3 mr-1" />
              )}
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            disabled={isConnecting}
            onClick={() => onConnect(mp.code)}
            className="w-full h-10 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5"
          >
            {isConnecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowUpRight className="w-3.5 h-3.5" />
            )}
            Connect with {mp.name || mp.displayName}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
