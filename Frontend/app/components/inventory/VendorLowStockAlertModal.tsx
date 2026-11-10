import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Package, Truck, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { VendorLowStockAlertItem } from '../../api/vendorAllocations';
import { getProductImageUrl, getFullImageUrl, PRODUCT_PLACEHOLDER } from '../../utils/imageUrl';

interface VendorLowStockAlertModalProps {
  isOpen: boolean;
  items: VendorLowStockAlertItem[];
  threshold?: number;
  onClose: () => void;
  onFulfillReplenishment?: (item: VendorLowStockAlertItem) => void;
}

export function VendorLowStockAlertModal({
  isOpen,
  items,
  threshold = 5,
  onClose,
  onFulfillReplenishment,
}: VendorLowStockAlertModalProps) {
  const lowStock = items.filter(
    (p) => (p.currentStock ?? p.stock ?? 0) <= (p.threshold ?? threshold) || (p.currentStock ?? p.stock ?? 0) <= 5
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md overflow-y-auto overflow-x-hidden flex items-start justify-center p-4 sm:p-6 md:p-10"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] overflow-hidden border border-slate-200/80 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-20 p-3 rounded-2xl bg-white/80 dark:bg-zinc-800/80 hover:bg-white dark:hover:bg-zinc-700 backdrop-blur-xl border border-slate-200/50 dark:border-white/10 transition-all duration-200 group active:scale-95 shadow-lg shadow-slate-200/20 dark:shadow-none cursor-pointer"
            >
              <X className="w-5 h-5 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white" />
            </button>

            <div className="p-8 lg:p-10">
              <div className="flex items-start gap-4 mb-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 shadow-sm">
                  <AlertTriangle className="h-6 w-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Low-Stock Replenishment Alert
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {lowStock.length > 0
                      ? `You have ${lowStock.length} item(s) running low on stock (less than 5 units left). Consider replenishing soon.`
                      : 'All products are adequately stocked.'}
                  </p>
                </div>
              </div>

              {lowStock.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mb-4">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    All items fully stocked!
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No immediate replenishment actions required.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-800">
                        <th className="text-left px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Product
                        </th>
                        <th className="text-left px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          SKU
                        </th>
                        <th className="text-center px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Current Stock
                        </th>
                        <th className="text-center px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Threshold
                        </th>
                        <th className="text-center px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                          Status
                        </th>
                        {onFulfillReplenishment && (
                          <th className="text-right px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                            Action
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                      {lowStock.map((product) => {
                        const currentStock = product.currentStock ?? product.stock ?? 0;
                        const itemThreshold = product.threshold || threshold;
                        const isOut = currentStock === 0;

                        return (
                          <tr
                            key={product._id || product.sku}
                            className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 overflow-hidden shrink-0">
                                  {getProductImageUrl(product) ? (
                                    <img
                                      src={getFullImageUrl(getProductImageUrl(product))}
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).onerror = null;
                                        (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                                      }}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Package className="w-4 h-4 text-slate-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                                    {product.name || 'Assigned Product'}
                                  </p>
                                  {product.category && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      {product.category}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                              {product.sku}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span
                                className={`font-bold text-lg tabular-nums ${
                                  isOut
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-orange-600 dark:text-orange-400'
                                }`}
                              >
                                {currentStock}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                ≤ {itemThreshold}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              {isOut ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/20 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                  Out of Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-500/20 text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                  Low Stock
                                </span>
                              )}
                            </td>
                            {onFulfillReplenishment && (
                              <td className="px-5 py-4 text-right">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    onClose();
                                    onFulfillReplenishment(product);
                                  }}
                                  className="h-8 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs gap-1.5 shadow-sm cursor-pointer"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  Fulfill Stock
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default VendorLowStockAlertModal;

