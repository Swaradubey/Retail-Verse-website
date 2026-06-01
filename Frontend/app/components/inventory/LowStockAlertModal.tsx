import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Package } from 'lucide-react';
import { Button } from '../ui/button';
import { Product } from '../../api/products';

interface LowStockAlertModalProps {
  isOpen: boolean;
  items: Product[];
  onClose: () => void;
}

export function LowStockAlertModal({ isOpen, items, onClose }: LowStockAlertModalProps) {
  const lowStock = items.filter(
    (p) => (p.stock ?? 0) >= 1 && (p.stock ?? 0) < 10
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
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-20 p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 backdrop-blur-xl border border-slate-200/50 dark:border-white/10 transition-all duration-200 group active:scale-95 shadow-lg shadow-slate-200/20 dark:shadow-none"
            >
              <X className="w-5 h-5 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white" />
            </button>

            <div className="p-8 lg:p-10">
              <div className="flex items-start gap-4 mb-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 shadow-sm">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Low Stock Alerts
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {lowStock.length > 0
                      ? `You have ${lowStock.length} item${lowStock.length === 1 ? '' : 's'} running low on stock.`
                      : 'No low-stock alerts found.'}
                  </p>
                </div>
              </div>

              {lowStock.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mb-4">
                    <Package className="h-8 w-8" />
                  </div>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    All stocked up!
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No low-stock alerts found.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-white/10">
                        <th className="text-left px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Product Name</th>
                        <th className="text-left px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">SKU</th>
                        <th className="text-center px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Current Stock</th>
                        <th className="text-center px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Min. Threshold</th>
                        <th className="text-center px-5 py-4 font-bold text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {lowStock.map((product) => (
                        <tr
                          key={product._id || product.sku}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Package className="w-4 h-4 text-slate-400" />
                                  </div>
                                )}
                              </div>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {product.name || product.title}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                            {product.sku}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="font-bold text-lg tabular-nums text-orange-600 dark:text-orange-400">
                              {product.stock}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-sm text-slate-500 dark:text-slate-400">10</span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-500/20 text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                              Low Stock
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-8 lg:px-10 pb-8 lg:pb-10">
              <Button
                onClick={onClose}
                variant="outline"
                className="w-full h-12 rounded-2xl border-2 border-slate-200 dark:border-slate-800 font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-[0.98]"
              >
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
