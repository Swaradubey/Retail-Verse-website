import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Eye,
  EyeOff,
  LogOut,
  Mail,
  Phone,
  Building,
  ShieldCheck,
  Search,
  RefreshCw,
  Calendar,
  Sparkles,
  ChevronRight,
  Send,
  X,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { useNavigate } from 'react-router';
import {
  vendorAllocationsApi,
  VendorAllocationItem,
  VendorItem,
  AllocationStatus,
} from '../../api/vendorAllocations';
import { formatINR } from '../../utils/formatINR';
import { getProductImageUrl, getFullImageUrl, PRODUCT_PLACEHOLDER } from '../../utils/imageUrl';
import { toast } from 'sonner';

export function VendorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'requirements' | 'profile'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [allocations, setAllocations] = useState<VendorAllocationItem[]>([]);
  const [vendorProfile, setVendorProfile] = useState<VendorItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail & Action Modal state
  const [selectedAllocation, setSelectedAllocation] = useState<VendorAllocationItem | null>(null);
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [fulfillQuantity, setFulfillQuantity] = useState<number>(1);
  const [actionLoading, setActionLoading] = useState(false);

  // Multi-vendor switcher for Admin/SuperAdmin testing
  const isPrivileged =
    user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'client';
  const [availableVendors, setAvailableVendors] = useState<VendorItem[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Load available vendors for test switcher if privileged
  useEffect(() => {
    if (isPrivileged) {
      vendorAllocationsApi
        .getVendors()
        .then((list) => {
          setAvailableVendors(list);
          if (list.length > 0 && !selectedVendorId) {
            setSelectedVendorId(list[0]._id);
          }
        })
        .catch(() => {});
    }
  }, [isPrivileged]);

  // Load Vendor Allocations & Profile
  const loadVendorData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const vendorQueryParam = isPrivileged && selectedVendorId ? selectedVendorId : undefined;
        const res = await vendorAllocationsApi.getVendorAllocations(
          vendorQueryParam ? { vendorId: vendorQueryParam } : undefined
        );

        setAllocations(res.allocations || []);
        if (res.vendor) {
          setVendorProfile(res.vendor);
        }
      } catch (err: any) {
        console.error('Failed to load vendor allocations:', err);
        toast.error('Failed to load vendor requirements');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isPrivileged, selectedVendorId]
  );

  useEffect(() => {
    void loadVendorData();
  }, [loadVendorData]);

  // When vendor opens/views this list, fire the PATCH /api/vendor/allocations/:id/seen request
  // to record isSeen: true and seenAt: new Date() for Admin's visibility
  useEffect(() => {
    if (allocations.length > 0) {
      const unseen = allocations.filter((item) => !item.isSeen);
      if (unseen.length > 0) {
        unseen.forEach((item) => {
          const vendorParam = isPrivileged && selectedVendorId ? selectedVendorId : undefined;
          vendorAllocationsApi
            .markAllocationSeen(item._id, vendorParam)
            .then((updated) => {
              setAllocations((prev) =>
                prev.map((alloc) =>
                  alloc._id === item._id
                    ? { ...alloc, isSeen: true, seenAt: updated.seenAt || new Date().toISOString() }
                    : alloc
                )
              );
            })
            .catch(() => {});
        });
      }
    }
  }, [allocations.length, activeTab, isPrivileged, selectedVendorId]);

  // Helper to resolve dynamic full absolute product image across single and array attributes
  const getProductImage = (prod?: any) => {
    if (!prod) return undefined;
    const url = getProductImageUrl(prod);
    return url ? getFullImageUrl(url) : undefined;
  };

  // Helper to extract current stock from populated product or trigger snapshot
  const getCurrentStock = (item: VendorAllocationItem) => {
    if (item.productId?.currentStock !== undefined) return item.productId.currentStock;
    if (item.productId?.stock !== undefined) return item.productId.stock;
    if (item.productId?.stockLevel !== undefined) return item.productId.stockLevel;
    return item.currentStockAtTrigger;
  };

  // Helper to extract alert threshold
  const getAlertThreshold = (item: VendorAllocationItem) => {
    if (item.productId?.threshold !== undefined) return item.productId.threshold;
    if (item.productId?.lowStockAlert !== undefined) return item.productId.lowStockAlert;
    if (item.productId?.lowStockThreshold !== undefined) return item.productId.lowStockThreshold;
    if (item.productId?.minStock !== undefined) return item.productId.minStock;
    return 5;
  };

  // Read-Receipt ("Seen" Feature):
  // When a vendor opens/views the requirement in their portal, the system updates isSeen: true and seenAt: new Date()
  const handleOpenDetailModal = async (allocation: VendorAllocationItem) => {
    setSelectedAllocation(allocation);
    setDispatchNotes(allocation.vendorNotes || '');
    setFulfillQuantity(allocation.allocatedQuantity || 1);

    // If requirement has not been marked seen yet, trigger read-receipt update
    if (!allocation.isSeen) {
      try {
        const vendorParam = isPrivileged && selectedVendorId ? selectedVendorId : undefined;
        const updated = await vendorAllocationsApi.markAllocationSeen(
          allocation._id,
          vendorParam
        );

        // Update item in local list
        setAllocations((prev) =>
          prev.map((item) =>
            item._id === allocation._id ? { ...item, isSeen: true, seenAt: updated.seenAt } : item
          )
        );
        setSelectedAllocation((prev) =>
          prev ? { ...prev, isSeen: true, seenAt: updated.seenAt } : null
        );
      } catch (err) {
        console.warn('Read-receipt update failed silently:', err);
      }
    }
  };

  // Vendor Action: Directly fulfill & update product stock in inventory
  const handleUpdateStock = async (allocationId: string, customQty?: number) => {
    setActionLoading(true);
    try {
      const vendorParam = isPrivileged && selectedVendorId ? selectedVendorId : undefined;
      const targetAllocation = allocations.find((a) => a._id === allocationId) || selectedAllocation;
      const quantityToUpdate = customQty || targetAllocation?.allocatedQuantity || 1;

      const res = await vendorAllocationsApi.updateVendorStock(
        allocationId,
        { quantity: quantityToUpdate, vendorNotes: dispatchNotes.trim() },
        vendorParam
      );

      const updated = res.allocation;
      toast.success(
        res.message ||
          `Stock updated successfully! Added ${quantityToUpdate} units of "${targetAllocation?.productId?.name || 'Product'}" directly into inventory (New Stock: ${res.newStock}).`
      );

      // Immediately reflect new stock and status in state
      setAllocations((prev) =>
        prev.map((item) =>
          item._id === allocationId
            ? {
                ...updated,
                productId: {
                  ...item.productId,
                  stock: res.newStock ?? (item.productId?.stock || 0) + quantityToUpdate,
                  currentStock: res.newStock ?? (item.productId?.currentStock || 0) + quantityToUpdate,
                },
              }
            : item
        )
      );

      if (selectedAllocation?._id === allocationId) {
        setSelectedAllocation({
          ...updated,
          productId: {
            ...selectedAllocation.productId,
            stock: res.newStock ?? (selectedAllocation.productId?.stock || 0) + quantityToUpdate,
            currentStock: res.newStock ?? (selectedAllocation.productId?.currentStock || 0) + quantityToUpdate,
          },
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update inventory stock');
    } finally {
      setActionLoading(false);
    }
  };

  // Vendor Action: Accept Requirement
  const handleAcceptRequirement = async (allocationId: string) => {
    setActionLoading(true);
    try {
      const vendorParam = isPrivileged && selectedVendorId ? selectedVendorId : undefined;
      const updated = await vendorAllocationsApi.updateVendorStatus(
        allocationId,
        { status: 'ACCEPTED' },
        vendorParam
      );

      toast.success('Requirement accepted successfully. Proceed to update stock when ready.');

      // Update state
      setAllocations((prev) =>
        prev.map((item) => (item._id === allocationId ? updated : item))
      );
      if (selectedAllocation?._id === allocationId) {
        setSelectedAllocation(updated);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept requirement');
    } finally {
      setActionLoading(false);
    }
  };

  // Vendor Action: Mark In Transit / Dispatched & Update Stock
  const handleDispatchRequirement = async (allocationId: string) => {
    return handleUpdateStock(allocationId);
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const totalAllocations = allocations.length;
    const totalUnits = allocations.reduce(
      (sum, a) => sum + (Number(a.allocatedQuantity) || 0),
      0
    );
    const pending = allocations.filter((a) => a.status === 'PENDING').length;
    const accepted = allocations.filter((a) => a.status === 'ACCEPTED').length;
    const dispatched = allocations.filter((a) => a.status === 'DISPATCHED').length;
    const received = allocations.filter((a) => a.status === 'RECEIVED').length;
    const unreadCount = allocations.filter((a) => !a.isSeen).length;

    return {
      totalAllocations,
      totalUnits,
      pending,
      accepted,
      dispatched,
      received,
      unreadCount,
    };
  }, [allocations]);

  // Filtering
  const filteredAllocations = useMemo(() => {
    return allocations.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = item.productId?.name?.toLowerCase() || '';
        const sku = item.productId?.sku?.toLowerCase() || '';
        const id = item._id.toLowerCase();
        return name.includes(q) || sku.includes(q) || id.includes(q);
      }

      return true;
    });
  }, [allocations, statusFilter, searchQuery]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return String(dateStr);
    }
  };

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(dateStr);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 transition-colors">
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Vendor Portal
              </span>
              {stats.unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 animate-pulse">
                  {stats.unreadCount} Unread Requirement{stats.unreadCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {vendorProfile?.companyName || vendorProfile?.name || user?.name || 'Authorized Vendor'}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Replenishment allocations, read-receipt verification, and dispatch milestones.
            </p>
          </div>

          {/* Action & Switcher Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Privileged vendor switcher */}
            {isPrivileged && availableVendors.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm text-xs">
                <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                  View As Vendor:
                </span>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="bg-transparent font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer"
                >
                  {availableVendors.map((v) => (
                    <option key={v._id} value={v._id} className="text-slate-800 dark:text-zinc-200">
                      {v.name} ({v.companyName || 'Vendor'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Pill Navigation Tabs */}
            <div className="flex bg-slate-200/80 dark:bg-zinc-900 p-1 rounded-2xl w-fit">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'overview'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('requirements')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'requirements'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Allocations ({allocations.length})
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'profile'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Vendor Profile
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadVendorData(true)}
              disabled={refreshing || loading}
              className="h-9 w-9 p-0 rounded-xl border-slate-200 dark:border-zinc-800"
              title="Refresh Allocations"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* ── Tab 1: Overview ─────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <Card className="rounded-2xl border-slate-200 dark:border-zinc-800/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Allocated Units
                  </CardTitle>
                  <Package className="w-4 h-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black">{stats.totalUnits} Units</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Across {stats.totalAllocations} replenishment request{stats.totalAllocations === 1 ? '' : 's'}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-200 dark:border-zinc-800/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Action Required
                  </CardTitle>
                  <Clock className="w-4 h-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {stats.pending + stats.accepted}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.pending} pending acceptance • {stats.accepted} in progress
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-200 dark:border-zinc-800/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    In Transit / Dispatched
                  </CardTitle>
                  <Truck className="w-4 h-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                    {stats.dispatched}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting admin receipt confirmation</p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-200 dark:border-zinc-800/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Fulfilled & Received
                  </CardTitle>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {stats.received}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Stock credited into warehouse</p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Allocations Table */}
            <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold">Latest Allocated Requirements</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Low-stock replenishment orders published by client administration.
                    </CardDescription>
                  </div>
                  {allocations.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab('requirements')}
                      className="text-xs rounded-xl"
                    >
                      View All ({allocations.length})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 space-y-3">
                    <div className="h-6 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
                    <div className="h-6 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
                    <div className="h-6 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
                  </div>
                ) : allocations.length === 0 ? (
                  <div className="py-16 px-4 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-zinc-900 border border-blue-100 dark:border-zinc-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <Package className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                        No Requirements Allocated Yet
                      </h3>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        When warehouse stock drops to low levels, admin split allocations assigned to you will appear here automatically.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-zinc-900/60 text-muted-foreground uppercase tracking-wider text-[10px] font-bold border-b border-slate-100 dark:border-zinc-800/60">
                        <tr>
                          <th className="px-6 py-3.5">Product Name</th>
                          <th className="px-6 py-3.5">SKU</th>
                          <th className="px-6 py-3.5 text-center">Allocated Units</th>
                          <th className="px-6 py-3.5">Current / Threshold</th>
                          <th className="px-6 py-3.5">Target Delivery Date</th>
                          <th className="px-6 py-3.5">Seen Status</th>
                          <th className="px-6 py-3.5">Status</th>
                          <th className="px-6 py-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/40 font-medium">
                        {allocations.slice(0, 6).map((req) => (
                          <tr
                            key={req._id}
                            className="hover:bg-slate-50/70 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer"
                            onClick={() => void handleOpenDetailModal(req)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 dark:border-zinc-700">
                                  {getProductImage(req.productId) ? (
                                    <img
                                      src={getProductImage(req.productId)}
                                      alt={req.productId?.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).onerror = null;
                                        (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                                      }}
                                    />
                                  ) : (
                                    <Package className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>
                                <span className="font-bold text-slate-800 dark:text-zinc-200">
                                  {req.productId?.name || 'Allocated Product'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              {req.productId?.sku || '—'}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="inline-block px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-zinc-800 font-black text-slate-800 dark:text-zinc-200">
                                {req.allocatedQuantity} Units
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                                {getCurrentStock(req)} / ≤ {getAlertThreshold(req)} units
                              </span>
                            </td>
                            <td className="px-6 py-4 text-muted-foreground">
                              {formatDate(req.targetDeliveryDate)}
                            </td>
                            <td className="px-6 py-4">
                              {req.isSeen ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  <Eye className="w-3.5 h-3.5" /> Seen
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                  <EyeOff className="w-3.5 h-3.5" /> Unread
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                                  req.status === 'RECEIVED'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : req.status === 'DISPATCHED'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                                    : req.status === 'ACCEPTED'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                }`}
                              >
                                {req.status === 'DISPATCHED' ? 'In Transit' : req.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleOpenDetailModal(req);
                                }}
                                className="h-7 text-xs rounded-lg text-emerald-600 dark:text-emerald-400 font-bold"
                              >
                                {req.status === 'RECEIVED'
                                  ? 'View Details'
                                  : `Update Stock (+${req.allocatedQuantity})`}{' '}
                                <ChevronRight className="w-3.5 h-3.5 ml-1" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Tab 2: Allocations / Requirements ───────────────────────────── */}
        {activeTab === 'requirements' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-11 rounded-xl text-xs bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                  placeholder="Search products, SKU, or allocation ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Status Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto p-1 bg-slate-200/70 dark:bg-zinc-900 rounded-xl">
                {['ALL', 'PENDING', 'ACCEPTED', 'DISPATCHED', 'RECEIVED'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      statusFilter === status
                        ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
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

            {/* Grid of Requirement Cards */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-56 rounded-3xl bg-slate-100 dark:bg-zinc-900 animate-pulse border border-slate-200 dark:border-zinc-800"
                  />
                ))}
              </div>
            ) : filteredAllocations.length === 0 ? (
              <div className="py-20 px-4 flex flex-col items-center justify-center text-center space-y-3 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400">
                  <Package className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-800 dark:text-zinc-200">
                    {searchQuery || statusFilter !== 'ALL'
                      ? 'No Matching Requirements'
                      : 'No Allocated Requirements Found'}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md">
                    {searchQuery
                      ? `No records found matching "${searchQuery}". Clear search to view all items.`
                      : 'No procurement replenishment orders have been assigned to this vendor.'}
                  </p>
                </div>
                {searchQuery && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="rounded-xl text-xs mt-2"
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAllocations.map((req) => (
                  <Card
                    key={req._id}
                    className="rounded-3xl border-slate-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden cursor-pointer group"
                    onClick={() => void handleOpenDetailModal(req)}
                  >
                    <CardHeader className="pb-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                          SKU: {req.productId?.sku}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {req.isSeen ? (
                            <span
                              title={`Viewed at ${formatTimestamp(req.seenAt)}`}
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" /> Seen
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 flex items-center gap-1 animate-pulse">
                              <EyeOff className="w-3 h-3" /> Unread
                            </span>
                          )}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              req.status === 'RECEIVED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : req.status === 'DISPATCHED'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                : req.status === 'ACCEPTED'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {req.status === 'DISPATCHED' ? 'In Transit' : req.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 dark:border-zinc-700">
                          {getProductImage(req.productId) ? (
                            <img
                              src={getProductImage(req.productId)}
                              alt={req.productId?.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              onError={(e) => {
                                (e.target as HTMLImageElement).onerror = null;
                                (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                              }}
                            />
                          ) : (
                            <Package className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-bold line-clamp-2">
                            {req.productId?.name || 'Procurement Requirement'}
                          </CardTitle>
                          <CardDescription className="text-xs mt-0.5">
                            Category: {req.productId?.category || 'General Supplies'}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 pt-0">
                      <div className="bg-slate-50 dark:bg-zinc-800/50 p-3.5 rounded-2xl space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Allocated Quantity:</span>
                          <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
                            {req.allocatedQuantity} Units
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Stock / Alert Threshold:</span>
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                            {getCurrentStock(req)} units / ≤ {getAlertThreshold(req)} units
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Target Delivery Date:</span>
                          <span className="font-semibold">{formatDate(req.targetDeliveryDate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stock At Trigger:</span>
                          <span className="font-mono text-orange-600 dark:text-orange-400">
                            {req.currentStockAtTrigger} units left
                          </span>
                        </div>
                      </div>

                      {/* Action buttons inside card */}
                      <div className="flex items-center gap-2 pt-1">
                        {req.status === 'RECEIVED' ? (
                          <div className="w-full py-2 px-3 text-center rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Stock Credited (+{req.allocatedQuantity} Units)
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 w-full">
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleUpdateStock(req._id, req.allocatedQuantity);
                              }}
                              disabled={actionLoading}
                              className="flex-1 h-9 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-sm transition-all"
                              title="Directly fulfill and update stock in inventory"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Update Stock (+{req.allocatedQuantity})
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleOpenDetailModal(req);
                              }}
                              className="h-9 px-3 rounded-xl text-xs font-bold border-slate-200 dark:border-zinc-700 text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
                              title="Open requirement details & tracking remarks"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Tab 3: Vendor Profile ────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
            <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 shadow-sm p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-4 border-b border-slate-100 dark:border-zinc-800/80 pb-6">
                <div className="h-14 w-14 rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 flex items-center justify-center font-bold text-xl">
                  {vendorProfile?.name?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || 'V'}
                </div>
                <div>
                  <h2 className="text-lg font-bold">
                    {vendorProfile?.companyName || vendorProfile?.name || user?.name || 'Authorized Vendor'}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Verified Vendor Partner
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">Role: VENDOR</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 text-xs font-medium">
                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Vendor Contact Email
                    </p>
                    <p className="text-sm font-semibold mt-0.5">{vendorProfile?.email || user?.email || '—'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Contact Phone
                    </p>
                    <p className="text-sm font-semibold mt-0.5">{vendorProfile?.phone || user?.phone || 'Not configured'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60">
                  <Building className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Business Address / Warehouse
                    </p>
                    <p className="text-sm font-semibold mt-0.5">
                      {vendorProfile?.address || user?.address || 'Industrial Supply Logistics Center'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Supplier Category
                    </p>
                    <p className="text-sm font-semibold mt-0.5">{vendorProfile?.category || 'General Supplies'}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/80 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Credentials managed by organization admin.</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="rounded-xl text-xs gap-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <LogOut className="w-3.5 h-3.5" /> Logout
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ── Details & Action Modal (Read-Receipt Verified) ───────────────── */}
        <AnimatePresence>
          {selectedAllocation && (
            <div
              className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md overflow-y-auto overflow-x-hidden flex items-start justify-center p-3 sm:p-6 md:p-8"
              onClick={() => setSelectedAllocation(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 sm:p-8 space-y-6">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 flex items-center justify-center font-bold">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          Requirement Details
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono">
                          ID: {selectedAllocation._id}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedAllocation(null)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Product Overview Card */}
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700/60">
                    <div className="w-16 h-16 rounded-xl bg-white dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 dark:border-zinc-700">
                      {getProductImage(selectedAllocation.productId) ? (
                        <img
                          src={getProductImage(selectedAllocation.productId)}
                          alt={selectedAllocation.productId?.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).onerror = null;
                            (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                          }}
                        />
                      ) : (
                        <Package className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        {selectedAllocation.productId?.name || 'Allocated Product'}
                      </h4>
                      <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">
                        SKU: {selectedAllocation.productId?.sku}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Category: {selectedAllocation.productId?.category || 'General Supplies'}
                      </p>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Allocated Units</p>
                      <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {selectedAllocation.allocatedQuantity} Units
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Current / Threshold</p>
                      <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-1">
                        {getCurrentStock(selectedAllocation)} / ≤ {getAlertThreshold(selectedAllocation)} units
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Target Delivery Date</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-zinc-200 mt-1">
                        {formatDate(selectedAllocation.targetDeliveryDate)}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Stock At Trigger</p>
                      <p className="text-sm font-bold text-orange-600 dark:text-orange-400 mt-1">
                        {selectedAllocation.currentStockAtTrigger} units left
                      </p>
                    </div>
                  </div>

                  {/* Read-Receipt ("Seen" Feature) Status */}
                  <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <span className="font-bold text-emerald-900 dark:text-emerald-200">
                          Read-Receipt Confirmed
                        </span>
                        <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                          Admin sees: "Seen by Vendor at {formatTimestamp(selectedAllocation.seenAt || new Date().toISOString())}"
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 font-bold text-emerald-800 dark:text-emerald-300 text-[10px]">
                      Verified Seen
                    </span>
                  </div>

                  {/* Dispatch Notes & Direct Stock Update Actions */}
                  {selectedAllocation.status !== 'RECEIVED' ? (
                    <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-zinc-800">
                      <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            Replenishment Quantity to Credit into Inventory:
                          </label>
                          <span className="text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg">
                            Allocated: {selectedAllocation.allocatedQuantity} Units
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            min="1"
                            value={fulfillQuantity}
                            onChange={(e) => setFulfillQuantity(Math.max(1, Number(e.target.value) || 0))}
                            className="w-32 h-10 text-sm font-black text-center bg-white dark:bg-zinc-900 border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-300"
                          />
                          <span className="text-xs text-muted-foreground font-medium">
                            units will immediately increment the main warehouse inventory.
                          </span>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                            Dispatch / Carrier Remarks (Optional):
                          </label>
                          <Input
                            placeholder="e.g. Dispatched via BlueDart AWB# 88472910, Delivery Expected Tomorrow"
                            value={dispatchNotes}
                            onChange={(e) => setDispatchNotes(e.target.value)}
                            className="h-10 text-xs rounded-xl bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700"
                          />
                        </div>
                        <Button
                          onClick={() => void handleUpdateStock(selectedAllocation._id, fulfillQuantity)}
                          disabled={actionLoading}
                          className="w-full h-11 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 shadow-sm"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {actionLoading ? 'Updating Inventory Stock...' : `Update Stock in Inventory (+${fulfillQuantity} Units)`}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 text-xs space-y-1">
                      <p className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Stock Successfully Updated & Credited into Inventory
                      </p>
                      <p className="text-emerald-700 dark:text-emerald-300">
                        Updated at: {formatTimestamp(selectedAllocation.receivedAt || selectedAllocation.updatedAt)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Warehouse product stock has been incremented with the {selectedAllocation.allocatedQuantity} allocated units.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default VendorDashboard;
