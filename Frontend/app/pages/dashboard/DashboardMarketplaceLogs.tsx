import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, Search, CheckCircle, XCircle, ArrowUpRight, ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { marketplaceApi } from '../../services/marketplaceApi';
import api from '../../api/apiService';
import { toast } from 'sonner';

type SyncLog = {
  _id: string;
  productName: string;
  sku: string;
  action: string;
  status: 'success' | 'failed' | string;
  shopifyProductId: string;
  error?: string | null;
  timestamp: string;
};

export function DashboardMarketplaceLogs() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [marketplace, setMarketplace] = useState<string>('shopify');

  const loadLogs = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const connRes = await api.get(`/marketplaces/connections/${id}`).catch(() => null);
      if (connRes && connRes.success && connRes.data?.connection) {
        setMarketplace(connRes.data.connection.marketplace?.toLowerCase() || 'shopify');
      }
      const data = await marketplaceApi.getConnectionLogs(id);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && log.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <button
            onClick={() => navigate(`/dashboard/marketplaces/${id}`)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back to Integration
          </button>
          <div className="flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            <h1 className="text-2xl font-bold tracking-tight">Synchronization Logs</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            View historical synchronization actions and status messages.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={loading}
            className="rounded-xl"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by product name, SKU, action..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-xl h-10 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">Filter status:</span>
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
            className="rounded-xl"
          >
            All
          </Button>
          <Button
            variant={statusFilter === 'success' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('success')}
            className="rounded-xl text-emerald-600 dark:text-emerald-400"
          >
            Success
          </Button>
          <Button
            variant={statusFilter === 'failed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('failed')}
            className="rounded-xl text-rose-600 dark:text-rose-400"
          >
            Failed
          </Button>
        </div>
      </div>

      {/* Logs Card */}
      <Card className="border-zinc-200/60 dark:border-zinc-800/60 shadow-sm overflow-hidden rounded-2xl">
        <CardHeader className="pb-3 bg-zinc-50/50 dark:bg-zinc-900/30">
          <CardTitle className="text-lg">Event List</CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} events matching your criteria
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-muted-foreground bg-zinc-50/30 dark:bg-zinc-900/20">
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Timestamp</th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Product Name</th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Action</th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">{marketplace === 'flipkart' ? 'Flipkart FSN' : 'Shopify Product ID'}</th>
                  <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Details / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-amber-600" />
                        Loading sync logs...
                      </div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      No logs found. Try adjusting your filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr
                      key={log._id}
                      className="hover:bg-zinc-50/55 dark:hover:bg-zinc-900/20 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-muted-foreground">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4 font-medium max-w-[200px] truncate">
                        {log.productName}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs whitespace-nowrap">
                        {log.sku}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        <Badge variant="secondary" className="font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                            <XCircle className="w-3.5 h-3.5" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-muted-foreground">
                        {log.shopifyProductId && log.shopifyProductId !== 'N/A' ? (
                          marketplace === 'flipkart' ? (
                            <span className="font-mono bg-zinc-150 dark:bg-zinc-800/80 px-2 py-1 rounded text-zinc-900 dark:text-zinc-100 font-bold">{log.shopifyProductId}</span>
                          ) : (
                            <a
                              href={`https://${log.shopifyProductId.split('/').pop()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 hover:underline font-mono"
                            >
                              <span>{log.shopifyProductId.split('/').pop()}</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </a>
                          )
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs max-w-[250px] break-words">
                        {log.status === 'failed' && log.error ? (
                          <span className="text-rose-600 dark:text-rose-400 font-medium">
                            {log.error}
                          </span>
                        ) : (
                          <span className="text-zinc-400">Successfully completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
