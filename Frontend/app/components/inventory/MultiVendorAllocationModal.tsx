import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Package,
  Users,
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Building2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  vendorAllocationsApi,
  VendorItem,
  SplitAllocationPayload,
} from '../../api/vendorAllocations';
import { productApi } from '../../api/products';
import { getProductImageUrl, getFullImageUrl, PRODUCT_PLACEHOLDER } from '../../utils/imageUrl';
import { toast } from 'sonner';

interface ProductForAllocation {
  _id: string;
  name: string;
  sku: string;
  stock?: number;
  stockLevel?: number;
  price?: number;
  image?: string;
  imageUrl?: string;
  lowStockAlert?: number;
  lowStockThreshold?: number;
  threshold?: number;
}

interface MultiVendorAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: ProductForAllocation | null;
  products?: ProductForAllocation[];
  onAllocationSuccess?: () => void;
  onSuccess?: () => void;
}

interface VendorSplitRow {
  id: string;
  vendorId: string;
  allocatedQuantity: number;
  targetDeliveryDate: string;
  notes: string;
}

export function MultiVendorAllocationModal({
  isOpen,
  onClose,
  product = null,
  products = [],
  onAllocationSuccess,
  onSuccess,
}: MultiVendorAllocationModalProps) {
  const [activeProduct, setActiveProduct] = useState<ProductForAllocation | null>(product || null);
  const [availableProducts, setAvailableProducts] = useState<ProductForAllocation[]>(products || []);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Sync activeProduct when product prop changes
  useEffect(() => {
    if (product) {
      setActiveProduct(product);
    }
  }, [product]);

  // Load available products for selection / fallback if not provided
  useEffect(() => {
    if (!isOpen) return;

    if (products && products.length > 0) {
      setAvailableProducts(products);
      if (!product && !activeProduct) {
        const lowStock = products.find(
          (p) => Number(p.stockLevel ?? p.stock ?? 0) <= Number(p.threshold ?? p.lowStockAlert ?? 5)
        );
        setActiveProduct(lowStock || products[0]);
      }
      return;
    }

    let mounted = true;
    setLoadingProducts(true);
    productApi
      .getAll()
      .then((res: any) => {
        if (!mounted) return;
        const list: ProductForAllocation[] = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.products)
          ? res.products
          : Array.isArray(res)
          ? res
          : [];
        setAvailableProducts(list);
        if (!product && (!activeProduct || !activeProduct._id) && list.length > 0) {
          const lowStock = list.find(
            (p) => Number(p.stockLevel ?? p.stock ?? 0) <= Number(p.threshold ?? p.lowStockAlert ?? 5)
          );
          setActiveProduct(lowStock || list[0]);
        }
      })
      .catch((err) => {
        console.error('Failed to load products for allocation:', err);
      })
      .finally(() => {
        if (mounted) setLoadingProducts(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, product, products]);

  // Replenishment configuration
  const currentStock = Number(activeProduct?.stockLevel ?? activeProduct?.stock ?? 0);
  const threshold = Number(
    activeProduct?.threshold ?? activeProduct?.lowStockAlert ?? activeProduct?.lowStockThreshold ?? 5
  );
  const defaultNeeded = Math.max(20, threshold * 4 - currentStock);
  const [targetReplenishment, setTargetReplenishment] = useState<number>(defaultNeeded);

  // Update targetReplenishment when activeProduct changes
  useEffect(() => {
    if (activeProduct) {
      const pStock = Number(activeProduct.stockLevel ?? activeProduct.stock ?? 0);
      const pThresh = Number(
        activeProduct.threshold ?? activeProduct.lowStockAlert ?? activeProduct.lowStockThreshold ?? 5
      );
      const needed = Math.max(20, pThresh * 4 - pStock);
      setTargetReplenishment(needed);
    }
  }, [activeProduct]);

  // Vendor allocation split rows
  const [splits, setSplits] = useState<VendorSplitRow[]>([]);

  // Quick inline add vendor state
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorCompany, setNewVendorCompany] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [addingVendor, setAddingVendor] = useState(false);

  // Default target date: 7 days in future (YYYY-MM-DD)
  const defaultDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, []);

  // Fetch vendors whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoadingVendors(true);

    vendorAllocationsApi
      .getVendors()
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setVendors(list);

        // Prepopulate splits: if 2+ vendors available, split target 50/50 across two vendors
        const needed = Math.max(20, threshold * 4 - currentStock);
        setTargetReplenishment(needed);

        if (list.length >= 2) {
          const half = Math.floor(needed / 2);
          const remainder = needed - half;
          setSplits([
            {
              id: 'split_1',
              vendorId: list[0]._id,
              allocatedQuantity: half,
              targetDeliveryDate: defaultDateStr,
              notes: 'First batch priority replenishment',
            },
            {
              id: 'split_2',
              vendorId: list[1]._id,
              allocatedQuantity: remainder,
              targetDeliveryDate: defaultDateStr,
              notes: 'Second batch replenishment',
            },
          ]);
        } else if (list.length === 1) {
          setSplits([
            {
              id: 'split_1',
              vendorId: list[0]._id,
              allocatedQuantity: needed,
              targetDeliveryDate: defaultDateStr,
              notes: 'Urgent stock replenishment',
            },
          ]);
        } else {
          setSplits([
            {
              id: 'split_1',
              vendorId: '',
              allocatedQuantity: needed,
              targetDeliveryDate: defaultDateStr,
              notes: '',
            },
          ]);
        }
      })
      .catch((err) => {
        console.error('Failed to load vendors:', err);
        toast.error('Failed to load vendor directory');
      })
      .finally(() => {
        if (mounted) setLoadingVendors(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, activeProduct, defaultDateStr]);

  // Total allocated across all rows
  const totalAllocated = useMemo(() => {
    return splits.reduce((sum, s) => sum + (Number(s.allocatedQuantity) || 0), 0);
  }, [splits]);

  const diff = targetReplenishment - totalAllocated;

  const handleAddSplitRow = () => {
    const remainingToAllocate = Math.max(1, diff > 0 ? diff : 10);
    // Select first unused vendor or first vendor
    const usedVendorIds = new Set(splits.map((s) => s.vendorId));
    const availableVendor = vendors.find((v) => !usedVendorIds.has(v._id)) || vendors[0];

    setSplits((prev) => [
      ...prev,
      {
        id: `split_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        vendorId: availableVendor ? availableVendor._id : '',
        allocatedQuantity: remainingToAllocate,
        targetDeliveryDate: defaultDateStr,
        notes: '',
      },
    ]);
  };

  const handleRemoveSplitRow = (id: string) => {
    if (splits.length <= 1) {
      toast.error('At least one vendor split allocation is required');
      return;
    }
    setSplits((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdateSplit = (id: string, updates: Partial<VendorSplitRow>) => {
    setSplits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleCreateNewVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName.trim() || !newVendorEmail.trim()) {
      toast.error('Vendor name and email are required');
      return;
    }

    setAddingVendor(true);
    try {
      const created = await vendorAllocationsApi.createVendor({
        name: newVendorName.trim(),
        email: newVendorEmail.trim(),
        companyName: newVendorCompany.trim(),
        phone: newVendorPhone.trim(),
      });

      toast.success(`Vendor "${created.name}" registered successfully`);
      setVendors((prev) => [...prev, created]);
      setNewVendorName('');
      setNewVendorEmail('');
      setNewVendorCompany('');
      setNewVendorPhone('');
      setShowAddVendor(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create vendor');
    } finally {
      setAddingVendor(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeProduct?._id) {
      toast.error('Please select a product for allocation');
      return;
    }

    if (splits.length === 0) {
      toast.error('Please configure at least one vendor split');
      return;
    }

    for (let i = 0; i < splits.length; i++) {
      const s = splits[i];
      if (!s.vendorId) {
        toast.error(`Please select a vendor for split #${i + 1}`);
        return;
      }
      if (!s.allocatedQuantity || s.allocatedQuantity < 1) {
        toast.error(`Allocated quantity for split #${i + 1} must be at least 1 unit`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: SplitAllocationPayload = {
        productId: activeProduct._id,
        allocations: splits.map((s) => ({
          vendorId: s.vendorId,
          allocatedQuantity: Number(s.allocatedQuantity),
          targetDeliveryDate: s.targetDeliveryDate || null,
          notes: s.notes || undefined,
        })),
      };

      await vendorAllocationsApi.createSplitAllocation(payload);

      toast.success(
        `Successfully created multi-vendor split allocation (${totalAllocated} units across ${splits.length} vendors)!`
      );

      if (onSuccess) {
        onSuccess();
      }
      if (onAllocationSuccess) {
        onAllocationSuccess();
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to allocate to vendors');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-md overflow-y-auto overflow-x-hidden flex items-start justify-center p-3 sm:p-6 md:p-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 my-auto"
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

            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Multi-Vendor Split Allocation
                  </h2>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                    LOW STOCK TRIGGER
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Distribute purchase replenishment volume across multiple registered vendors.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Product Summary Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 bg-slate-50/60 dark:bg-zinc-800/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                    {activeProduct && getProductImageUrl(activeProduct) ? (
                      <img
                        src={getFullImageUrl(getProductImageUrl(activeProduct))}
                        alt={activeProduct.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).onerror = null;
                          (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                        }}
                      />
                    ) : (
                      <Package className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                      {activeProduct?.name || (loadingProducts ? 'Loading products...' : 'Select a Product')}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                        SKU: {activeProduct?.sku || 'N/A'}
                      </span>
                      <span>•</span>
                      <span>
                        Current Stock:{' '}
                        <strong className="text-orange-600 dark:text-orange-400 font-bold">
                          {currentStock} units
                        </strong>
                      </span>
                      <span>•</span>
                      <span>Threshold: {threshold} units</span>
                    </div>
                  </div>
                </div>

                {/* Target Replenishment Input */}
                <div className="flex items-center gap-2 sm:self-center shrink-0">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    Total Units Needed:
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={targetReplenishment}
                    onChange={(e) => setTargetReplenishment(Math.max(1, Number(e.target.value) || 0))}
                    className="w-24 h-9 text-xs font-bold text-center rounded-xl bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700"
                  />
                </div>
              </div>

              {/* Product Selector Dropdown for choosing or switching items */}
              {availableProducts.length > 0 && (
                <div className="pt-2.5 border-t border-slate-200/60 dark:border-zinc-700/60 flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Select Product:
                  </label>
                  <select
                    value={activeProduct?._id || ''}
                    onChange={(e) => {
                      const found = availableProducts.find((p) => p._id === e.target.value);
                      if (found) {
                        setActiveProduct(found);
                      }
                    }}
                    className="flex-1 h-8 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {!activeProduct && <option value="">-- Choose a product to replenish --</option>}
                    {availableProducts.map((p) => {
                      const pStock = Number(p.stockLevel ?? p.stock ?? 0);
                      const pThresh = Number(p.threshold ?? p.lowStockAlert ?? 5);
                      const isLow = pStock <= pThresh;
                      return (
                        <option key={p._id} value={p._id}>
                          {p.name} (SKU: {p.sku || 'N/A'}) - Stock: {pStock} units{isLow ? ' [LOW STOCK]' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            {/* Split Allocation Status Indicator */}
            <div className="rounded-2xl border border-slate-100 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <Sparkles className="w-4 h-4 text-indigo-500" /> Allocation Breakdown:
                </span>
                <span
                  className={`font-bold ${
                    totalAllocated === targetReplenishment
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : totalAllocated < targetReplenishment
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {totalAllocated} / {targetReplenishment} units allocated ({splits.length} vendor
                  {splits.length === 1 ? '' : 's'})
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden flex">
                <div
                  className={`h-full transition-all duration-300 ${
                    totalAllocated === targetReplenishment
                      ? 'bg-emerald-500'
                      : totalAllocated < targetReplenishment
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.round((totalAllocated / targetReplenishment) * 100))}%`,
                  }}
                />
              </div>

              {diff !== 0 && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  {diff > 0
                    ? `${diff} units remaining to be assigned across vendors.`
                    : `Total allocated exceeds target by ${Math.abs(diff)} units.`}
                </p>
              )}
            </div>

            {/* Vendor Split Rows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Assigned Vendor Splits
                </h4>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddVendor(!showAddVendor)}
                    className="h-7 text-xs rounded-lg border-dashed"
                  >
                    <Plus className="w-3 h-3 mr-1" /> New Vendor Profile
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddSplitRow}
                    className="h-7 text-xs rounded-lg text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Vendor Split
                  </Button>
                </div>
              </div>

              {/* Inline quick add vendor form */}
              <AnimatePresence>
                {showAddVendor && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleCreateNewVendor}
                    className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 p-4 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" /> Quick Register New Vendor
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddVendor(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <Input
                        placeholder="Vendor / Contact Name *"
                        value={newVendorName}
                        onChange={(e) => setNewVendorName(e.target.value)}
                        className="h-8 text-xs bg-white dark:bg-zinc-900"
                        required
                      />
                      <Input
                        placeholder="Vendor Email Address *"
                        type="email"
                        value={newVendorEmail}
                        onChange={(e) => setNewVendorEmail(e.target.value)}
                        className="h-8 text-xs bg-white dark:bg-zinc-900"
                        required
                      />
                      <Input
                        placeholder="Company / Organization Name"
                        value={newVendorCompany}
                        onChange={(e) => setNewVendorCompany(e.target.value)}
                        className="h-8 text-xs bg-white dark:bg-zinc-900"
                      />
                      <Input
                        placeholder="Phone Number"
                        value={newVendorPhone}
                        onChange={(e) => setNewVendorPhone(e.target.value)}
                        className="h-8 text-xs bg-white dark:bg-zinc-900"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={addingVendor}
                        className="h-7 text-xs rounded-lg bg-indigo-600 text-white"
                      >
                        {addingVendor ? 'Registering...' : 'Save & Select Vendor'}
                      </Button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Rows List */}
              <div className="space-y-3">
                {splits.map((split, index) => (
                  <div
                    key={split.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                        <span className="h-5 w-5 rounded-full bg-slate-100 dark:bg-zinc-800 text-[10px] flex items-center justify-center font-mono font-bold text-slate-600 dark:text-zinc-400">
                          {index + 1}
                        </span>
                        Vendor Split #{index + 1}
                      </span>
                      {splits.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSplitRow(split.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                          title="Remove vendor split"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Vendor Selector */}
                      <div className="sm:col-span-5 space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Assign Vendor
                        </label>
                        <select
                          value={split.vendorId}
                          onChange={(e) => handleUpdateSplit(split.id, { vendorId: e.target.value })}
                          className="w-full h-9 px-3 rounded-xl text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option value="">-- Select Vendor --</option>
                          {loadingVendors && (
                            <option value="" disabled>
                              Loading registered vendors...
                            </option>
                          )}
                          {!loadingVendors && vendors.length === 0 && (
                            <option value="" disabled>
                              No registered vendors found (Register in Users & Roles or click "+ New Vendor")
                            </option>
                          )}
                          {vendors.map((v) => {
                            const name = String(v.name || v.email || 'Vendor').trim();
                            const company = String(v.companyName || '').trim();
                            const hasDistinctCompany =
                              company &&
                              company !== name &&
                              !company.toLowerCase().includes(name.toLowerCase()) &&
                              !name.toLowerCase().includes(company.toLowerCase());
                            return (
                              <option key={v._id} value={v._id}>
                                {hasDistinctCompany ? `${name} (${company})` : name}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Allocated Quantity */}
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Units Split
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={split.allocatedQuantity}
                          onChange={(e) =>
                            handleUpdateSplit(split.id, {
                              allocatedQuantity: Math.max(1, Number(e.target.value) || 0),
                            })
                          }
                          className="h-9 text-xs font-bold bg-slate-50 dark:bg-zinc-800/80 border-slate-200 dark:border-zinc-700 text-center"
                        />
                      </div>

                      {/* Target Delivery Date */}
                      <div className="sm:col-span-4 space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Target Delivery
                        </label>
                        <Input
                          type="date"
                          value={split.targetDeliveryDate}
                          onChange={(e) =>
                            handleUpdateSplit(split.id, { targetDeliveryDate: e.target.value })
                          }
                          className="h-9 text-xs bg-slate-50 dark:bg-zinc-800/80 border-slate-200 dark:border-zinc-700"
                        />
                      </div>
                    </div>

                    {/* Notes for Vendor */}
                    <div className="pt-1">
                      <Input
                        placeholder="Optional vendor dispatch instructions or priority remarks..."
                        value={split.notes}
                        onChange={(e) => handleUpdateSplit(split.id, { notes: e.target.value })}
                        className="h-8 text-xs bg-slate-50/60 dark:bg-zinc-800/40 border-slate-200 dark:border-zinc-700"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className="px-6 py-4 sm:px-8 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground text-center sm:text-left">
              Allocated orders will appear instantly on the Vendor Portal with Read-Receipt tracking.
            </p>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="w-full sm:w-auto text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || loadingVendors || splits.length === 0}
                className="w-full sm:w-auto text-xs font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md hover:shadow-lg transition-all"
              >
                {submitting ? 'Allocating to Vendors...' : `Confirm Allocation (${totalAllocated} Units)`}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export const MultiVendorSplitAllocationModal = MultiVendorAllocationModal;
export default MultiVendorAllocationModal;

