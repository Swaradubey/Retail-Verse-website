import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Truck,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  Package,
  RefreshCw,
  Search,
  Building2,
  Calendar,
  AlertCircle,
  FileCheck,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { MultiVendorSplitAllocationModal } from './MultiVendorAllocationModal';
import {
  vendorAllocationsApi,
  VendorAllocationItem,
  AllocationStatus,
} from '../../api/vendorAllocations';
import { formatINR } from '../../utils/formatINR';
import { getProductImageUrl, getFullImageUrl, PRODUCT_PLACEHOLDER } from '../../utils/imageUrl';
import { toast } from 'sonner';

interface VendorAllocationsTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStockUpdated?: () => void;
  onOpenSplitModal?: (productId?: string) => void;
}

export function VendorAllocationsTrackerModal({
  isOpen,
  onClose,
  onStockUpdated,
  onOpenSplitModal,
}: VendorAllocationsTrackerModalProps) {
  const [allocations, setAllocations] = useState<VendorAllocationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [allocationToDelete, setAllocationToDelete] = useState<VendorAllocationItem | null>(null);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [productForAllocation, setProductForAllocation] = useState<any>(null);

  const fetchAllocations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await vendorAllocationsApi.getAdminAllocations();
      setAllocations(data);
    } catch (err: any) {
      console.error('Failed to fetch allocations:', err);
      toast.error('Failed to load vendor allocations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchAllocations();
    }
  }, [isOpen, fetchAllocations]);

  const handleConfirmReceipt = async (allocation: VendorAllocationItem) => {
    setReceivingId(allocation._id);
    try {
      const res = await vendorAllocationsApi.receiveAllocation(allocation._id);
      toast.success(
        `Receipt confirmed! Added ${allocation.allocatedQuantity} units of "${allocation.productId?.name}" into inventory stock (New Stock: ${res.newStock ?? 'updated'}).`
      );

      // Refresh list
      await fetchAllocations(true);

      if (onStockUpdated) {
        onStockUpdated();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to confirm receipt');
    } finally {
      setReceivingId(null);
    }
  };

  const handleDeleteAllocation = async (allocation: VendorAllocationItem) => {
    const targetId = allocation._id;
    const previousAllocations = allocations;

    // Optimistic UI Update: remove row from local React state immediately
    setAllocations((prev) => prev.filter((item) => item._id !== targetId));
    setAllocationToDelete(null);
    setDeletingId(targetId);

    try {
      await vendorAllocationsApi.deleteAllocation(targetId);
      toast.success('Allocation deleted successfully');
      if (onStockUpdated) {
        onStockUpdated();
      }
    } catch (err: any) {
      // Revert with toast error if API fails
      setAllocations(previousAllocations);
      toast.error(err.message || 'Failed to delete allocation');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredAllocations = useMemo(() => {
    return allocations.filter((item) => {
      // Status filter
      if (selectedStatus !== 'ALL' && item.status !== selectedStatus) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const prodName = item.productId?.name?.toLowerCase() || '';
        const prodSku = item.productId?.sku?.toLowerCase() || '';
        const vendorName = item.vendorId?.name?.toLowerCase() || '';
        const vendorCompany = item.vendorId?.companyName?.toLowerCase() || '';

        return (
          prodName.includes(query) ||
          prodSku.includes(query) ||
          vendorName.includes(query) ||
          vendorCompany.includes(query)
        );
      }

      return true;
    });
  }, [allocations, selectedStatus, searchQuery]);

  // Metrics
  const stats = useMemo(() => {
    const total = allocations.length;
    const inTransit = allocations.filter((a) => a.status === 'DISPATCHED').length;
    const received = allocations.filter((a) => a.status === 'RECEIVED').length;
    const unread = allocations.filter((a) => !a.isSeen && a.status !== 'RECEIVED').length;
    const totalUnits = allocations.reduce(
      (sum, a) => sum + (Number(a.allocatedQuantity) || 0),
      0
    );

    return { total, inTransit, received, unread, totalUnits };
  }, [allocations]);

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(dateStr);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md overflow-y-auto overflow-x-hidden flex items-start justify-center p-3 sm:p-6 md:p-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-6 py-5 sm:px-8 sm:py-6 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mr-10">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center shrink-0">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Vendor Allocations & Read-Receipt Tracker
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Live restock tracking, vendor "Seen" receipts, and stock receipt confirmation.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchAllocations(true)}
                  disabled={refreshing || loading}
                  className="h-8 text-xs rounded-xl border-slate-200 dark:border-zinc-800 gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (allocations.length > 0 && allocations[0].productId) {
                      setProductForAllocation(allocations[0].productId);
                    }
                    setIsAllocationModalOpen(true);
                  }}
                  className="h-8 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1 shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + New Allocation
                </Button>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6 max-h-[78vh] overflow-y-auto">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold mb-1">
                  <span>Total Allocations</span>
                  <Package className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {stats.total}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {stats.totalUnits} units in total
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold mb-1">
                  <span>In Transit / Dispatched</span>
                  <Truck className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                  {stats.inTransit}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Ready for admin receipt</p>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold mb-1">
                  <span>Unread by Vendor</span>
                  <EyeOff className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {stats.unread}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Pending vendor view</p>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold mb-1">
                  <span>Completed & Added</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {stats.received}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Stock incremented</p>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product, SKU, or vendor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 text-xs rounded-xl bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                />
              </div>

              {/* Status Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl">
                {['ALL', 'PENDING', 'ACCEPTED', 'DISPATCHED', 'RECEIVED'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedStatus === status
                        ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {status === 'ALL'
                      ? 'All'
                      : status === 'DISPATCHED'
                      ? 'In Transit'
                      : status.charAt(0) + status.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Table / List */}
            {loading ? (
              <div className="p-12 space-y-3">
                <div className="h-10 bg-slate-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
                <div className="h-10 bg-slate-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
                <div className="h-10 bg-slate-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
              </div>
            ) : filteredAllocations.length === 0 ? (
              <div className="py-16 px-4 flex flex-col items-center justify-center text-center space-y-3 border border-dashed border-slate-200 dark:border-zinc-800 rounded-3xl">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400">
                  <Package className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    No Vendor Allocations Found
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {searchQuery || selectedStatus !== 'ALL'
                      ? 'No allocations match your selected filters. Try clearing filters.'
                      : 'Create a multi-vendor split allocation to distribute restock quantities across vendors.'}
                  </p>
                  {!searchQuery && selectedStatus === 'ALL' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIsAllocationModalOpen(true)}
                      className="mt-2 h-8 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      + New Allocation
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-zinc-800/60 text-muted-foreground uppercase tracking-wider text-[10px] font-bold border-b border-slate-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-5 py-3.5">Product & SKU</th>
                        <th className="px-5 py-3.5">Vendor</th>
                        <th className="px-5 py-3.5 text-center">Allocated Units</th>
                        <th className="px-5 py-3.5">Read-Receipt ("Seen")</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                      {filteredAllocations.map((alloc) => (
                        <tr
                          key={alloc._id}
                          className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* Product */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                                {getProductImageUrl(alloc.productId) ? (
                                  <img
                                    src={getFullImageUrl(getProductImageUrl(alloc.productId))}
                                    alt={alloc.productId?.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).onerror = null;
                                      (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                                    }}
                                  />
                                ) : (
                                  <Package className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 dark:text-zinc-100 truncate max-w-[200px]">
                                  {alloc.productId?.name || 'Unknown Product'}
                                </p>
                                <p className="text-[11px] font-mono text-muted-foreground">
                                  {alloc.productId?.sku}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Vendor */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5">
                              <p className="font-semibold text-slate-800 dark:text-zinc-200">
                                {alloc.vendorId?.name || 'Vendor'}
                              </p>
                              {alloc.vendorId?.companyName && (
                                <p className="text-[11px] text-muted-foreground">
                                  {alloc.vendorId.companyName}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {alloc.vendorId?.email}
                              </p>
                            </div>
                          </td>

                          {/* Units */}
                          <td className="px-5 py-4 text-center">
                            <span className="inline-block px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 font-black text-indigo-700 dark:text-indigo-300 text-sm">
                              {alloc.allocatedQuantity} Units
                            </span>
                            {alloc.targetDeliveryDate && (
                              <p className="text-[10px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Due {new Date(alloc.targetDeliveryDate).toLocaleDateString()}
                              </p>
                            )}
                          </td>

                          {/* Read-Receipt Badge ("Seen" Feature) */}
                          <td className="px-5 py-4">
                            {alloc.isSeen ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  Seen by Vendor
                                </span>
                                {alloc.seenAt && (
                                  <p className="text-[10px] text-muted-foreground">
                                    at {formatTimestamp(alloc.seenAt)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <EyeOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                Unread / Pending
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4">
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  alloc.status === 'RECEIVED'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : alloc.status === 'DISPATCHED'
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                    : alloc.status === 'ACCEPTED'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                }`}
                              >
                                {alloc.status === 'DISPATCHED' ? 'In Transit / Dispatched' : alloc.status}
                              </span>
                              {alloc.vendorNotes && (
                                <p className="text-[10px] text-muted-foreground italic line-clamp-1 max-w-[160px]">
                                  Note: "{alloc.vendorNotes}"
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {alloc.status === 'DISPATCHED' ? (
                                <Button
                                  size="sm"
                                  disabled={receivingId === alloc._id}
                                  onClick={() => void handleConfirmReceipt(alloc)}
                                  className="h-8 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                  {receivingId === alloc._id ? 'Receiving...' : 'Confirm Receipt'}
                                </Button>
                              ) : alloc.status === 'RECEIVED' ? (
                                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Stock Added
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  Awaiting Dispatch
                                </span>
                              )}

                              {alloc.productId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProductForAllocation(alloc.productId);
                                    setIsAllocationModalOpen(true);
                                  }}
                                  title={`Split allocate for ${alloc.productId.name || 'product'}`}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400 transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              )}

                              {/* Delete Action Button */}
                              <button
                                type="button"
                                disabled={deletingId === alloc._id}
                                onClick={() => setAllocationToDelete(alloc)}
                                title="Delete allocation"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                              >
                                {deletingId === alloc._id ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 sm:px-8 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Stock automatically increments upon confirming receipt of any dispatched allocation.
            </span>
            <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl text-xs">
              Close
            </Button>
          </div>
        </motion.div>

        {/* Lightweight Confirmation Modal for Delete Action */}
        {allocationToDelete && (
          <div
            className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => !deletingId && setAllocationToDelete(null)}
          >
            <div
              className="relative bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-zinc-800 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-base">Delete Allocation?</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Are you sure you want to delete this allocation?
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-slate-100 dark:border-zinc-700/50 space-y-1">
                <p className="font-bold text-slate-900 dark:text-zinc-100 truncate">
                  {allocationToDelete.productId?.name || 'Allocated Product'}
                </p>
                <p className="text-muted-foreground">
                  Vendor: <span className="font-medium text-slate-700 dark:text-zinc-300">{allocationToDelete.vendorId?.name || 'Vendor'}</span> ({allocationToDelete.allocatedQuantity} units)
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAllocationToDelete(null)}
                  disabled={!!deletingId}
                  className="rounded-xl text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleDeleteAllocation(allocationToDelete)}
                  disabled={!!deletingId}
                  className="rounded-xl text-xs h-9 bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
                >
                  {deletingId === allocationToDelete._id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* Multi-Vendor Split Allocation Modal */}
        <MultiVendorSplitAllocationModal
          isOpen={isAllocationModalOpen}
          onClose={() => setIsAllocationModalOpen(false)}
          product={productForAllocation}
          onSuccess={() => {
            void fetchAllocations(true);
            if (onStockUpdated) {
              onStockUpdated();
            }
          }}
          onAllocationSuccess={() => {
            void fetchAllocations(true);
            if (onStockUpdated) {
              onStockUpdated();
            }
          }}
        />
      </div>
    </AnimatePresence>
  );
}

export default VendorAllocationsTrackerModal;

