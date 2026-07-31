import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Pencil,
  PackageOpen,
  Trash2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui/tooltip';
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from '../ui/table';
 import { InventoryItem, StockStatus, SortConfig } from '../../types/inventory';
 import { formatINR } from '../../utils/formatINR';
import { getProductImageUrl, getFullImageUrl, PRODUCT_PLACEHOLDER } from '../../utils/imageUrl';

interface InventoryTableProps {
  items: InventoryItem[];
  sortConfig: SortConfig;
  onSort: (key: SortConfig['key']) => void;
  onView: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onUpdateStock: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  showProductEdit?: boolean;
  showStockAdjust?: boolean;
  showProductDelete?: boolean;
  onRetrySync?: (productId: string, marketplaces?: string[]) => Promise<void>;
}

function getStockStatus(stock: number): StockStatus {
  if (stock === 0) return 'out-of-stock';
  if (stock < 10) return 'low-stock';
  return 'in-stock';
}

function StatusBadge({ status }: { status: StockStatus }) {
  const config = {
    'in-stock': {
      label: 'In Stock',
      bg: 'bg-emerald-50/95 dark:bg-emerald-950/35',
      text: 'text-emerald-800 dark:text-emerald-300',
      border: 'border-emerald-200/70 dark:border-emerald-800/40',
      dot: 'bg-emerald-500',
      ring: 'ring-emerald-500/15',
    },
    'low-stock': {
      label: 'Low Stock',
      bg: 'bg-orange-50/95 dark:bg-orange-950/40',
      text: 'text-orange-900 dark:text-orange-300',
      border: 'border-orange-200/80 dark:border-orange-800/50',
      dot: 'bg-orange-500',
      ring: 'ring-orange-500/15',
    },
    'out-of-stock': {
      label: 'Out of Stock',
      bg: 'bg-rose-50/95 dark:bg-rose-950/40',
      text: 'text-rose-800 dark:text-rose-300',
      border: 'border-rose-200/75 dark:border-rose-800/45',
      dot: 'bg-rose-500',
      ring: 'ring-rose-500/15',
    },
  };

  const c = config[status];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] font-semibold tracking-wide shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ${c.ring} ${c.bg} ${c.text} ${c.border}`}
    >
      <span className="relative flex h-2 w-2">
        {status === 'out-of-stock' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-35 animate-ping`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${c.dot} shadow-sm`} />
      </span>
      {c.label}
    </span>
  );
}



function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function clientShopLabel(item: InventoryItem): string {
  if (item.clientName) return item.clientName;
  const store = item.client?.storeName?.trim();
  const shop = item.client?.shopName?.trim();
  const company = item.client?.companyName?.trim();
  if (store) return store;
  if (shop) return shop;
  if (company) return company;
  return 'Unassigned';
}

function relativeDate(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

function SortableHead({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        active
          ? 'text-indigo-700 dark:text-indigo-300'
          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {label}
      <ArrowUpDown
        className={`h-3 w-3 shrink-0 transition-all duration-300 ${
          active ? 'opacity-100 text-indigo-600 dark:text-indigo-400' : 'opacity-0 group-hover:opacity-60'
        }`}
      />
    </button>
  );
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.03, duration: 0.3, ease: 'easeOut' as const },
  }),
};

const mobileCardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.05, type: 'spring' as const, stiffness: 300, damping: 24 },
  }),
};

function ActionButton({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          whileHover={{ scale: 1.06, y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          onClick={onClick}
          className={`flex h-9 w-9 items-center justify-center rounded-xl border border-transparent ${color} transition-colors duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-slate-200/80 hover:bg-white/90 hover:shadow-sm dark:hover:border-white/10 dark:hover:bg-white/[0.06]`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="rounded-xl text-[11px] font-semibold">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function MobileCard({
  item,
  index,
  onView,
  onEdit,
  onUpdateStock,
  onDelete,
  showProductEdit,
  showStockAdjust,
  showProductDelete,
}: {
  item: InventoryItem;
  index: number;
  onView: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onUpdateStock: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  showProductEdit: boolean;
  showStockAdjust: boolean;
  showProductDelete: boolean;
  onRetrySync?: (productId: string, marketplaces?: string[]) => Promise<void>;
}) {
  const status = getStockStatus(item.stock);
  const isOutOfStock = status === 'out-of-stock';

  return (
    <motion.div
      custom={index}
      variants={mobileCardVariants}
      initial="hidden"
      animate="visible"
      className={`relative rounded-[1.25rem] border bg-white/80 p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-8px_rgba(15,23,42,0.1)] dark:bg-white/[0.04] dark:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.35)] ${
        isOutOfStock
          ? 'border-rose-200/60 dark:border-rose-900/40'
          : 'border-slate-200/70 dark:border-white/[0.08]'
      }`}
    >
      {isOutOfStock && (
        <div className="absolute top-0 left-4 right-4 h-[2px] bg-gradient-to-r from-rose-500 to-red-500 rounded-b-full opacity-50" />
      )}
      <div className="flex gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-md ring-2 ring-white dark:bg-white/10 dark:ring-white/20">
          <img
            src={getFullImageUrl(getProductImageUrl(item)) || PRODUCT_PLACEHOLDER}
            alt={item.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).onerror = null;
              (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{item.name}</p>
                <span className="inline-block mt-1 text-[13px] font-mono font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.05] px-1.5 py-0.5 rounded">
                  {item.sku}
                </span>
              </div>
              <span className="text-sm font-bold whitespace-nowrap">{formatINR(item.price)}</span>
            </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/[0.03] px-2 py-0.5 rounded-full">
                {item.category}
              </span>
              <StatusBadge status={status} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-500 dark:text-slate-500">Client: </span>
            <span className="truncate inline-block max-w-[200px] align-bottom">{clientShopLabel(item)}</span>
          </p>



          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Stock</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {item.stock < 10 && (
                    <AlertTriangle className={`h-3.5 w-3.5 shrink-0 animate-pulse ${
                      item.stock === 0 ? 'text-rose-500' : 'text-orange-500'
                    }`} />
                  )}
                  <p className={`text-sm font-bold ${
                    item.stock === 0
                      ? 'text-rose-500'
                      : item.stock < 10
                        ? 'text-orange-500'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                    {item.stock} units
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Updated</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{relativeDate(item.updatedAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onView(item)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              {showProductEdit && (
                <button
                  onClick={() => onEdit(item)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {showStockAdjust && (
                <button
                  onClick={() => onUpdateStock(item)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                >
                  <PackageOpen className="h-3.5 w-3.5" />
                </button>
              )}
              {showProductDelete && (
                <button
                  onClick={() => onDelete(item)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300/90 bg-white/50 py-20 px-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-md dark:border-white/[0.12] dark:bg-white/[0.03] sm:py-24"
    >
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100/90 to-indigo-50/50 shadow-inner ring-1 ring-white/60 dark:from-white/[0.06] dark:to-indigo-950/30 dark:ring-white/10">
        <Package className="h-10 w-10 text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
      </div>
      <h3 className="mb-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">No products found</h3>
      <p className="max-w-sm text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        No inventory items match your current filters. Try adjusting your search or filter criteria to find what you're looking for.
      </p>
    </motion.div>
  );
}

export function InventoryTable({
  items,
  sortConfig,
  onSort,
  onView,
  onEdit,
  onUpdateStock,
  onDelete,
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  showProductEdit = true,
  showStockAdjust = true,
  showProductDelete = true,
  onRetrySync,
}: InventoryTableProps) {
  if (items.length === 0) {
    return <EmptyState />;
  }

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, (currentPage - 1) * itemsPerPage + items.length);

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-5">
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-white/80 bg-white/60 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08),0_2px_8px_-4px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-[0_4px_32px_-8px_rgba(0,0,0,0.45)] md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="border-b border-slate-200/70 bg-gradient-to-b from-slate-50/98 to-slate-100/70 backdrop-blur-md hover:bg-gradient-to-b dark:border-white/[0.08] dark:from-white/[0.06] dark:to-white/[0.02] dark:hover:from-white/[0.06]">
                <TableHead className="py-4 pl-6">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    Product
                  </span>
                </TableHead>
                <TableHead className="py-4">
                  <SortableHead
                    label="SKU"
                    active={sortConfig.key === 'name'}
                    direction={sortConfig.direction}
                    onClick={() => onSort('name')}
                  />
                </TableHead>
                <TableHead className="hidden py-4 md:table-cell">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    Category
                  </span>
                </TableHead>
                <TableHead className="py-4">
                  <SortableHead
                    label="Price"
                    active={sortConfig.key === 'price'}
                    direction={sortConfig.direction}
                    onClick={() => onSort('price')}
                  />
                </TableHead>
                <TableHead className="py-4">
                  <SortableHead
                    label="Stock"
                    active={sortConfig.key === 'stock'}
                    direction={sortConfig.direction}
                    onClick={() => onSort('stock')}
                  />
                </TableHead>
                <TableHead className="hidden py-4 sm:table-cell">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    Status
                  </span>
                </TableHead>
                <TableHead className="hidden py-4 sm:table-cell">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    Client
                  </span>
                </TableHead>
                <TableHead className="hidden py-4 sm:table-cell">
                  <SortableHead
                    label="Updated"
                    active={sortConfig.key === 'updatedAt'}
                    direction={sortConfig.direction}
                    onClick={() => onSort('updatedAt')}
                  />
                </TableHead>
                <TableHead className="py-4 pr-6 text-right">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    Actions
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const status = getStockStatus(item.stock);
                const isOutOfStock = status === 'out-of-stock';
                const isLowStock = status === 'low-stock';

                return (
                  <motion.tr
                    key={item.id}
                    custom={index}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    className={`group border-b border-slate-100/90 transition-colors duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] dark:border-white/[0.04] ${
                      isOutOfStock
                        ? 'bg-rose-50/20 hover:bg-rose-50/35 dark:bg-rose-950/[0.04] dark:hover:bg-rose-950/[0.08]'
                        : isLowStock
                          ? 'bg-orange-50/30 hover:bg-orange-50/50 dark:bg-orange-950/[0.05] dark:hover:bg-orange-950/[0.09]'
                          : 'hover:bg-slate-50/90 dark:hover:bg-white/[0.03]'
                    }`}
                    style={{ cursor: 'default' }}
                  >
                    <TableCell className="py-4 pl-6 relative">
                      {isLowStock && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 rounded-r-md" />
                      )}
                      {isOutOfStock && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 rounded-r-md" />
                      )}
                      <div className="flex items-center gap-4">
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-md ring-2 ring-white dark:bg-white/10 dark:ring-white/15">
                          <img
                            src={getFullImageUrl(getProductImageUrl(item)) || PRODUCT_PLACEHOLDER}
                            alt={item.name}
                            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                            onError={(e) => {
                              (e.target as HTMLImageElement).onerror = null;
                              (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate text-[14px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                            {item.name}
                          </p>
                          <p className="mt-0.5 text-[13px] text-slate-400 dark:text-slate-500 sm:hidden">
                            {item.category}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-4">
                      <span className="inline-block rounded-lg border border-slate-200/80 bg-slate-50/90 px-2 py-1 font-mono text-[13px] font-semibold tabular-nums text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-slate-300">
                        {item.sku}
                      </span>
                    </TableCell>

                    <TableCell className="hidden py-4 md:table-cell">
                      <span className="text-[14px] font-medium text-slate-600 dark:text-slate-400">{item.category}</span>
                    </TableCell>

                    <TableCell className="py-4">
                      <span className="text-[14px] font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatINR(item.price)}
                      </span>
                    </TableCell>

                    <TableCell className="py-4">
                      <div className="flex items-center gap-1.5">
                        {item.stock < 10 && (
                          <AlertTriangle className={`h-4 w-4 shrink-0 animate-pulse ${
                            item.stock === 0 ? 'text-rose-500' : 'text-orange-500'
                          }`} />
                        )}
                        <span
                          className={`text-[14px] font-semibold tabular-nums ${
                            item.stock === 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : item.stock < 10
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {item.stock}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="hidden py-4 sm:table-cell">
                      <StatusBadge status={status} />
                    </TableCell>

                    <TableCell className="hidden py-4 sm:table-cell">
                      <div className="min-w-0 max-w-[220px]">
                        <p
                          className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200"
                          title={clientShopLabel(item)}
                        >
                          {clientShopLabel(item)}
                        </p>
                        {item.client?.companyName || item.client?.email ? (
                          <p
                            className="truncate text-[11px] text-slate-500 dark:text-slate-400 mt-0.5"
                            title={[item.client?.companyName, item.client?.email].filter(Boolean).join(' · ')}
                          >
                            {[item.client?.companyName, item.client?.email].filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell className="hidden py-4 sm:table-cell">
                      <div>
                        <p className="text-[12px] font-medium text-slate-600 dark:text-slate-400">{formatDate(item.updatedAt)}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">{relativeDate(item.updatedAt)}</p>
                      </div>
                    </TableCell>

                    <TableCell className="py-4 pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton
                          icon={Eye}
                          label="View details"
                          color="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
                          onClick={() => onView(item)}
                        />
                        {showProductEdit && (
                          <ActionButton
                            icon={Pencil}
                            label="Edit product"
                            color="text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 dark:hover:text-violet-400"
                            onClick={() => onEdit(item)}
                          />
                        )}
                        {showStockAdjust && (
                          <ActionButton
                            icon={PackageOpen}
                            label="Update stock"
                            color="text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            onClick={() => onUpdateStock(item)}
                          />
                        )}
                        {showProductDelete && (
                          <ActionButton
                            icon={Trash2}
                            label="Delete product"
                            color="text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                            onClick={() => onDelete(item)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {items.map((item, index) => (
          <MobileCard
            key={item.id}
            item={item}
            index={index}
            onView={onView}
            onEdit={onEdit}
            onUpdateStock={onUpdateStock}
            onDelete={onDelete}
            showProductEdit={showProductEdit}
            showStockAdjust={showStockAdjust}
            showProductDelete={showProductDelete}
            onRetrySync={onRetrySync}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="flex flex-col items-center justify-between gap-4 border-t border-slate-200/70 pt-5 dark:border-white/[0.06] sm:flex-row"
        >
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
            Showing{' '}
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{startItem}</span>
            {' to '}
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{endItem}</span>
            {' of '}
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
              {(currentPage - 1) * itemsPerPage + items.length + (totalPages > currentPage ? (totalPages - currentPage) * itemsPerPage : 0)}
            </span>
            {' results'}
          </p>
          <div className="flex items-center gap-1.5">
            <motion.button
              type="button"
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.25 }}
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white/90 text-slate-500 shadow-sm transition-all duration-300 hover:border-slate-300 hover:text-slate-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-slate-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </motion.button>
            {getPageNumbers().map((page, i) =>
              page === 'ellipsis' ? (
                <span key={`ellipsis-${i}`} className="flex h-10 w-10 items-center justify-center text-sm text-slate-400">
                  ...
                </span>
              ) : (
                <motion.button
                  type="button"
                  key={page}
                  whileHover={{ scale: 1.06, y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => onPageChange(page as number)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-[12px] font-semibold transition-all duration-300 ${
                    page === currentPage
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.45)]'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200'
                  }`}
                >
                  {page}
                </motion.button>
              )
            )}
            <motion.button
              type="button"
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.25 }}
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white/90 text-slate-500 shadow-sm transition-all duration-300 hover:border-slate-300 hover:text-slate-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-slate-200"
            >
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
