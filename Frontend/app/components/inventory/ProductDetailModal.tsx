import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Tag, ShoppingBag, BarChart3, Clock, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Product } from '../../api/products';
import { formatINR } from '../../utils/formatINR';

interface ProductDetailModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
}

export function ProductDetailModal({ isOpen, product, onClose }: ProductDetailModalProps) {
  if (!product) return null;

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
            className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col lg:grid lg:grid-cols-[420px_1fr] min-h-[500px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-20 p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 backdrop-blur-xl border border-slate-200/50 dark:border-white/10 transition-all duration-200 group active:scale-95 shadow-lg shadow-slate-200/20 dark:shadow-none"
            >
              <X className="w-5 h-5 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white" />
            </button>

            {/* Left Column: Image & Basic Info */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-8 lg:p-10 flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-white/5">
              <div className="relative w-full aspect-square rounded-[2rem] overflow-hidden bg-white dark:bg-slate-800 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 dark:border-white/10 group">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                    <Package className="w-20 h-20 mb-4 opacity-20" />
                    <span className="text-sm font-medium opacity-40 uppercase tracking-widest">No Preview</span>
                  </div>
                )}
                
                {product.isOnSale && (
                  <div className="absolute top-6 left-6 px-4 py-2 bg-gradient-to-r from-red-600 to-rose-500 text-white text-xs font-black rounded-2xl shadow-xl shadow-red-500/30 uppercase tracking-wider">
                    -{product.salePercentage}% OFF
                  </div>
                )}
              </div>

              <div className="mt-8 w-full space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 font-medium">SKU Reference</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold bg-white dark:bg-slate-800 px-3 py-1 rounded-xl shadow-sm border border-slate-100 dark:border-white/5">{product.sku || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 font-medium">Current Status</span>
                  <span className={`px-3 py-1 rounded-xl font-bold text-[10px] uppercase tracking-wider border shadow-sm ${
                    product.isActive !== false 
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    {product.isActive !== false ? 'In Stock' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Detailed Info */}
            <div className="p-8 lg:p-12 flex flex-col h-full bg-white dark:bg-slate-900">
              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-[0.15em] border border-indigo-100/50 dark:border-indigo-500/20">
                    {product.category}
                  </span>
                  {product.isFeatured && (
                    <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-[0.15em] border border-amber-100/50 dark:border-amber-500/20">
                      Featured
                    </span>
                  )}
                </div>
                <h2 className="text-4xl font-black text-slate-900 dark:text-white leading-[1.1] tracking-tight">
                  {product.name || product.title}
                </h2>
                <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                  {product.description || "Every detail of this premium item has been carefully curated to provide the best possible experience for our customers. Quality and durability are at the core of this design."}
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
                <div className="relative overflow-hidden group p-6 rounded-[2rem] bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-slate-900 border border-indigo-100/50 dark:border-indigo-500/10 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10">
                  <div className="flex items-center gap-3 text-indigo-500 dark:text-indigo-400 text-xs font-bold uppercase tracking-widest mb-3">
                    <ShoppingBag className="w-4 h-4" />
                    Market Value
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900 dark:text-white">{formatINR(product.price ?? 0)}</span>
                    {product.originalPrice && product.originalPrice > product.price && (
                      <span className="text-sm text-slate-400 line-through font-bold">{formatINR(product.originalPrice)}</span>
                    )}
                  </div>
                  <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors" />
                </div>

                <div className="relative overflow-hidden group p-6 rounded-[2rem] bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-slate-900 border border-emerald-100/50 dark:border-emerald-500/10 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10">
                  <div className="flex items-center gap-3 text-emerald-500 dark:text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3">
                    <BarChart3 className="w-4 h-4" />
                    Inventory Level
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-black ${product.stock <= 5 ? 'text-orange-600 animate-pulse' : 'text-slate-900 dark:text-white'}`}>
                      {product.stock}
                    </span>
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Units Left</span>
                  </div>
                  <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
                </div>
              </div>

              {/* Additional Meta */}
              <div className="space-y-6 flex-1">
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/80 px-5 py-3 rounded-2xl border border-slate-100 dark:border-white/5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <div className="text-xs">
                      <p className="text-slate-400 font-semibold uppercase tracking-widest mb-0.5">Last Restock</p>
                      <p className="text-slate-700 dark:text-slate-300 font-bold">{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {product.client && (
                  <div className="p-6 rounded-[2rem] bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-white/10">
                    <div className="flex items-center gap-3 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
                      <Info className="w-4 h-4" />
                      Assigned Merchant
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none mb-1">
                          {product.client.shopName || product.client.companyName || 'Global Warehouse'}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {product.client.email || 'system@retailverse.com'}
                        </p>
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200/50 dark:border-white/5 flex items-center justify-center font-black text-indigo-600 text-xl">
                        {(product.client.shopName || product.client.companyName || 'G')[0]}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-12 flex gap-4">
                <Button 
                  onClick={onClose} 
                  variant="outline" 
                  className="flex-1 h-14 rounded-2xl border-2 border-slate-200 dark:border-slate-800 font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-[0.98]"
                >
                  Close View
                </Button>
                <Button 
                  className="flex-1 h-14 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm uppercase tracking-widest shadow-2xl shadow-slate-900/20 dark:shadow-white/10 hover:-translate-y-1 transition-all active:scale-[0.98]"
                >
                  Manage Stock
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
