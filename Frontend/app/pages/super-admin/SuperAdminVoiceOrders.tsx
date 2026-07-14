import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Mic, Search, RefreshCw, FileAudio, Loader2, Eye,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  Building2, ArrowUpRight, BarChart3, Clock, ShoppingCart,
} from 'lucide-react';
import { voiceOrdersApi, type VoiceOrder, type VoiceOrderStatus } from '../../api/voiceOrders';
import { toast } from 'sonner';
import { Link } from 'react-router';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<VoiceOrderStatus, { label: string; color: string }> = {
  uploaded:             { label: 'Uploaded',            color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' },
  transcribing:         { label: 'Transcribing…',       color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' },
  transcribed:          { label: 'Transcribed',         color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
  transcription_failed: { label: 'Transcription Failed',color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  extracting:           { label: 'Extracting…',         color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' },
  extracting_order:     { label: 'Extracting Order…',   color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' },
  needs_review:         { label: 'Needs Review',        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' },
  ready_for_review:     { label: 'Ready for Review',    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200' },
  draft:                { label: 'Draft',               color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200' },
  confirmed:            { label: 'Confirmed',           color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200' },
  order_created:        { label: 'Order Created',       color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
  failed:               { label: 'Failed',              color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  order_extraction_failed: { label: 'Extraction Failed',color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  cancelled:            { label: 'Cancelled',           color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
};

function StatusBadge({ status }: { status: VoiceOrderStatus }) {
  const meta = STATUS_META[status] || { label: status, color: 'bg-zinc-100 text-zinc-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function formatDuration(secs?: number | null) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface StoreInfo {
  _id: string;
  companyName?: string;
  shopName?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SuperAdminVoiceOrders() {
  const [orders, setOrders] = useState<VoiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', search: '', storeId: '' });

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    orderCreated: 0,
    needsReview: 0,
    failed: 0,
  });

  const loadOrders = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const res = await voiceOrdersApi.list({
        page: pg,
        limit: 20,
        status: filters.status as VoiceOrderStatus | '',
        search: filters.search || undefined,
        storeId: filters.storeId || undefined,
      });
      const data = res.data as unknown as VoiceOrder[];
      const pagination = (res as unknown as { pagination: { total: number } }).pagination;
      setOrders(data);
      setTotal(pagination?.total || 0);
      setPage(pg);

      // Compute mini stats from first page (for display)
      if (pg === 1 && !filters.status && !filters.search) {
        setStats({
          total: pagination?.total || 0,
          orderCreated: data.filter((o) => o.status === 'order_created').length,
          needsReview: data.filter((o) => o.status === 'needs_review').length,
          failed: data.filter((o) => o.status === 'failed' || o.status === 'transcription_failed').length,
        });
      }
    } catch {
      toast.error('Failed to load voice orders.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadOrders(1); }, [loadOrders]);

  const getStoreName = (vo: VoiceOrder): string => {
    if (typeof vo.storeId === 'object' && vo.storeId !== null) {
      const s = vo.storeId as StoreInfo;
      return s.companyName || s.shopName || s._id;
    }
    return String(vo.storeId);
  };

  // ── Stat cards ─────────────────────────────────────────────────────────────

  const statCards = [
    { label: 'Total Voice Orders', value: stats.total, icon: Mic, color: 'from-indigo-500 to-indigo-600' },
    { label: 'Orders Created', value: stats.orderCreated, icon: ShoppingCart, color: 'from-green-500 to-green-600' },
    { label: 'Needs Review', value: stats.needsReview, icon: AlertTriangle, color: 'from-amber-500 to-amber-600' },
    { label: 'Failed', value: stats.failed, icon: AlertTriangle, color: 'from-red-500 to-red-600' },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-1"
      >
        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
          <Mic className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Super Admin</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          AI Voice Orders — All Stores
        </h1>
        <p className="text-muted-foreground text-sm">
          Monitor and manage voice orders across all tenants.
        </p>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex items-start gap-4"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white shadow-sm shrink-0`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          value={filters.search}
          onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && loadOrders(1)}
          placeholder="Search transcription, store…"
          className="flex-1 min-w-48 px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 dark:bg-zinc-800/50"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          className="px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 dark:bg-zinc-800/50"
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_META).map((s) => (
            <option key={s} value={s}>{STATUS_META[s as VoiceOrderStatus].label}</option>
          ))}
        </select>
        <button
          onClick={() => loadOrders(1)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all"
        >
          <Search className="w-3.5 h-3.5" /> Search
        </button>
        <button
          onClick={() => loadOrders(page)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading voice orders…
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileAudio className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No voice orders found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50/80 dark:bg-zinc-950/50">
                  {['ID', 'Store', 'Customer', 'Duration', 'Items', 'Total', 'Confidence', 'Status', 'Created', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                {orders.map((vo) => {
                  const customer = vo.extractedData?.customer;
                  const itemCount = vo.resolvedItems?.length || vo.extractedData?.items?.length || 0;
                  const total = (vo.resolvedItems || []).reduce((s, i) => s + (i.matchedProductPrice || 0) * (i.requestedQuantity || 0), 0);
                  return (
                    <>
                      <tr
                        key={vo._id}
                        className={`hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition-colors ${expandedRow === vo._id ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{vo._id.slice(-8)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate max-w-28">{getStoreName(vo)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">{customer?.name || <span className="text-muted-foreground italic">Unknown</span>}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{formatDuration(vo.durationSeconds)}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{itemCount}</td>
                        <td className="px-4 py-3 text-xs font-semibold tabular-nums">{total > 0 ? `₹${total.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 w-24"><ConfidenceBar value={vo.overallConfidence} /></td>
                        <td className="px-4 py-3"><StatusBadge status={vo.status} /></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                          {new Date(vo.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedRow(expandedRow === vo._id ? null : vo._id)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all text-muted-foreground"
                          >
                            {expandedRow === vo._id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                      {expandedRow === vo._id && (
                        <tr key={`${vo._id}-expand`}>
                          <td colSpan={10} className="px-6 py-4 bg-indigo-50/20 dark:bg-indigo-950/10 border-t border-indigo-100/30 dark:border-indigo-900/20">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Transcription</p>
                                <p className="text-xs text-zinc-700 dark:text-zinc-300 italic line-clamp-4 bg-white/60 dark:bg-zinc-900/40 p-3 rounded-lg border border-indigo-100/40 dark:border-indigo-900/20">
                                  {vo.transcription || <span className="not-italic text-muted-foreground">No transcription yet.</span>}
                                </p>
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Details</p>
                                <div className="text-xs space-y-1.5">
                                  <p><span className="text-muted-foreground">File:</span> {vo.originalFileName} ({formatSize(vo.fileSize)})</p>
                                  <p><span className="text-muted-foreground">Duration:</span> {formatDuration(vo.durationSeconds)}</p>
                                  {vo.transcriptionLanguage && <p><span className="text-muted-foreground">Language:</span> {vo.transcriptionLanguage}</p>}
                                  {vo.failureReason && <p className="text-red-500"><span className="font-semibold">Error:</span> {vo.failureReason}</p>}
                                  {vo.createdOrderId && (
                                    <p className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Order created: {typeof vo.createdOrderId === 'object'
                                        ? (vo.createdOrderId as { orderId: string }).orderId
                                        : String(vo.createdOrderId)}
                                    </p>
                                  )}
                                </div>
                                {(vo.resolvedItems || []).length > 0 && (
                                  <div>
                                    <p className="text-xs font-bold text-muted-foreground mt-2 mb-1 uppercase tracking-wide">Items</p>
                                    <ul className="space-y-1">
                                      {(vo.resolvedItems || []).map((item, i) => (
                                        <li key={i} className="text-xs flex gap-2 items-center">
                                          <span className="text-muted-foreground">×{item.requestedQuantity}</span>
                                          <span className="font-medium">{item.matchedProductName || item.spokenName}</span>
                                          {item.matchedProductPrice != null && (
                                            <span className="text-muted-foreground">₹{item.matchedProductPrice.toFixed(2)}</span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div className="p-4 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between text-sm text-muted-foreground">
              <span>{total} total voice orders</span>
              <div className="flex gap-2">
                <button
                  onClick={() => loadOrders(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all text-xs"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs">Page {page} of {Math.ceil(total / 20)}</span>
                <button
                  onClick={() => loadOrders(page + 1)}
                  disabled={page * 20 >= total}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all text-xs"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
