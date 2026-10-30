import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { inventoryCategories } from '../../data/mockInventory';
import { StockStatus } from '../../types/inventory';

interface InventoryFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  stockStatus: StockStatus | 'all';
  onStockStatusChange: (value: StockStatus | 'all') => void;
  category: string;
  onCategoryChange: (value: string) => void;
  categories?: string[];
  minPrice?: number;
  onMinPriceChange?: (value: number) => void;
  maxPrice?: number;
  onMaxPriceChange?: (value: number) => void;
}


export function InventoryFilters({
  search,
  onSearchChange,
  stockStatus,
  onStockStatusChange,
  category,
  onCategoryChange,
  categories,
  minPrice,
  onMinPriceChange,
  maxPrice,
  onMaxPriceChange,
}: InventoryFiltersProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const isPriceFiltered =
    (minPrice !== undefined && minPrice !== 0) ||
    (maxPrice !== undefined && maxPrice !== 999999);

  const activeFilterCount =
    (stockStatus !== 'all' ? 1 : 0) +
    (category !== 'All Categories' ? 1 : 0) +
    (search ? 1 : 0) +
    (isPriceFiltered ? 1 : 0);

  const clearAllFilters = () => {
    onSearchChange('');
    onStockStatusChange('all');
    onCategoryChange('All Categories');
    onMinPriceChange?.(0);
    onMaxPriceChange?.(999999);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="space-y-5"
    >
      <div className="rounded-[1.25rem] border border-white/80 bg-white/50 p-4 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="group relative min-w-0 flex-1">
            <Search
              className={`pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-300 ${isSearchFocused ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
                }`}
            />
            <Input
              ref={searchRef}
              placeholder="Search products, SKU, categories..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className={`h-12 rounded-2xl border bg-white/90 pl-11 pr-11 text-[15px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-slate-400 dark:bg-white/[0.06] dark:placeholder:text-slate-500 ${isSearchFocused
                ? 'border-indigo-300/90 ring-2 ring-indigo-500/15 dark:border-indigo-500/50 dark:ring-indigo-500/20'
                : 'border-slate-200/90 hover:border-slate-300 dark:border-white/[0.1] dark:hover:border-white/20'
                }`}
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => {
                    onSearchChange('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-slate-100/90 text-slate-500 transition-colors duration-300 hover:bg-slate-200/90 hover:text-slate-700 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/15"
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:shrink-0">
            <Select value={stockStatus} onValueChange={(v) => onStockStatusChange(v as StockStatus | 'all')}>
              <SelectTrigger className="h-12 w-full rounded-2xl border-slate-200/90 bg-white/90 px-4 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-300 hover:border-slate-300 hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.06] dark:hover:border-white/20 sm:w-[178px]">
                <SlidersHorizontal className="mr-2 h-4 w-4 text-slate-400" />
                <SelectValue placeholder="Stock Status" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-slate-200/80 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.18)] dark:border-white/10">
                <SelectItem value="all" className="rounded-xl">
                  All Status
                </SelectItem>
                <SelectItem value="in-stock" className="rounded-xl">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" />
                    In Stock
                  </span>
                </SelectItem>
                <SelectItem value="low-stock" className="rounded-xl">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.2)]" />
                    Low Stock
                  </span>
                </SelectItem>
                <SelectItem value="out-of-stock" className="rounded-xl">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.2)]" />
                    Out of Stock
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={category} onValueChange={onCategoryChange}>
              <SelectTrigger className="h-12 w-full rounded-2xl border-slate-200/90 bg-white/90 px-4 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-300 hover:border-slate-300 hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.06] dark:hover:border-white/20 sm:w-[188px]">
                <Filter className="mr-2 h-4 w-4 text-slate-400" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-slate-200/80 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.18)] dark:border-white/10">
                {(categories && categories.length > 0 ? ['All Categories', ...categories] : inventoryCategories).map((cat) => (
                  <SelectItem key={cat} value={cat} className="rounded-xl">
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price Range Filter */}
          {(onMinPriceChange || onMaxPriceChange) && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="shrink-0 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Price Range
              </span>
              <div className="flex flex-1 items-center gap-2">
                <div className="relative w-[110px]">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">₹</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Min"
                    value={minPrice === 0 || minPrice === undefined ? '' : minPrice}
                    onChange={(e) => onMinPriceChange?.(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-slate-200/90 bg-white/90 pl-7 pr-3 text-sm text-slate-800 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 placeholder:text-slate-400 focus:border-indigo-300/90 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <span className="text-slate-400 dark:text-slate-500">—</span>
                <div className="relative w-[110px]">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">₹</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Max"
                    value={maxPrice === 999999 || maxPrice === undefined ? '' : maxPrice}
                    onChange={(e) => onMaxPriceChange?.(e.target.value === '' ? 999999 : Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-slate-200/90 bg-white/90 pl-7 pr-3 text-sm text-slate-800 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 placeholder:text-slate-400 focus:border-indigo-300/90 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                {isPriceFiltered && (
                  <button
                    type="button"
                    onClick={() => { onMinPriceChange?.(0); onMaxPriceChange?.(999999); }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100/90 text-slate-500 transition-colors hover:bg-slate-200/90 hover:text-slate-700 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/15"
                    title="Clear price filter"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <AnimatePresence>
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-rose-50/90 px-4 py-2 text-xs font-semibold text-rose-700 shadow-sm transition-all duration-300 hover:bg-rose-100/90 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
            >
              <X className="h-3.5 w-3.5" />
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </motion.button>
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
