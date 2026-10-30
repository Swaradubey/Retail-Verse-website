import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, Package } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { InventoryItem } from '../../types/inventory';
import { getProductImageUrl, getFullImageUrl, PRODUCT_PLACEHOLDER } from '../../utils/imageUrl';

interface UpdateStockModalProps {
  open: boolean;
  item: InventoryItem | null;
  onSave: (newStock: number) => void;
  onCancel: () => void;
}

export function UpdateStockModal({
  open,
  item,
  onSave,
  onCancel,
}: UpdateStockModalProps) {
  const [stock, setStock] = useState(0);

  useEffect(() => {
    if (item) {
      setStock(item.stock);
    }
  }, [item]);

  if (!item) return null;

  const handleSave = () => {
    onSave(Math.max(0, stock));
  };

  const increment = () => setStock((s) => s + 1);
  const decrement = () => setStock((s) => Math.max(0, s - 1));
  const addTen = () => setStock((s) => s + 10);
  const removeTen = () => setStock((s) => Math.max(0, s - 10));

  const getStockColor = (val: number) => {
    if (val === 0) return 'text-rose-500';
    if (val <= 10) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const getStockBg = (val: number) => {
    if (val === 0) return 'bg-rose-50 dark:bg-rose-900/15 border-rose-200/50 dark:border-rose-800/30';
    if (val <= 10) return 'bg-amber-50 dark:bg-amber-900/15 border-amber-200/50 dark:border-amber-800/30';
    return 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200/50 dark:border-emerald-800/30';
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[460px] rounded-2xl border-none shadow-2xl bg-white dark:bg-zinc-900">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20">
              <Package className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Update Stock</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                Adjust inventory quantity
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {/* Product Info */}
          <div className="flex items-center gap-4 rounded-xl bg-gray-50/80 dark:bg-white/5 p-4">
            <img
              src={getFullImageUrl(getProductImageUrl(item)) || PRODUCT_PLACEHOLDER}
              alt={item.name}
              className="h-14 w-14 rounded-xl object-cover shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).onerror = null;
                (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                SKU: {item.sku}
              </p>
            </div>
          </div>

          {/* Current Stock Display */}
          <div className={`rounded-xl border p-4 text-center ${getStockBg(stock)}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Current Stock
            </p>
            <p className={`text-4xl font-extrabold tracking-tight ${getStockColor(stock)}`}>
              {stock}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stock === 0
                ? 'Out of stock'
                : stock <= 10
                  ? 'Low stock - reorder needed'
                  : 'Stock level healthy'}
            </p>
          </div>

          {/* Quick Adjust */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Quick Adjust
            </p>
            <div className="grid grid-cols-4 gap-2">
              <Button
                variant="outline"
                onClick={removeTen}
                className="rounded-xl h-11 text-xs font-bold border-gray-200 dark:border-white/10"
              >
                -10
              </Button>
              <Button
                variant="outline"
                onClick={decrement}
                className="rounded-xl h-11 border-gray-200 dark:border-white/10"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={increment}
                className="rounded-xl h-11 border-gray-200 dark:border-white/10"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={addTen}
                className="rounded-xl h-11 text-xs font-bold border-gray-200 dark:border-white/10"
              >
                +10
              </Button>
            </div>
          </div>

          {/* Manual Input */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Set Exact Quantity
            </p>
            <Input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(Math.max(0, parseInt(e.target.value) || 0))}
              className="h-12 rounded-xl text-center text-xl font-bold border-gray-200/60 dark:border-white/10 bg-white/60 dark:bg-black/30 focus-visible:ring-blue-500/30 focus-visible:border-blue-300"
            />
          </div>
        </motion.div>

        <DialogFooter className="gap-2 sm:gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="rounded-xl h-11 px-6 border-gray-200 dark:border-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="rounded-xl h-11 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
