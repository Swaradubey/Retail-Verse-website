const EventEmitter = require('events');
const mongoose = require('mongoose');

class LowStockEventBus extends EventEmitter {}

const lowStockEventBus = new LowStockEventBus();

// Maximum listeners to avoid Node memory leak warning on high throughput
lowStockEventBus.setMaxListeners(50);

/**
 * Non-blocking background listener for inventory changes
 */
lowStockEventBus.on('stock:changed', (eventPayload) => {
  // Use setImmediate to guarantee non-blocking execution outside the caller's tick
  setImmediate(async () => {
    try {
      const { productId, newStock, tenantId } = eventPayload;
      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) return;

      const Product = require('../models/Product');
      const VendorAllocation = require('../models/VendorAllocation');

      // Fetch minimal fields using lean query for max performance
      const product = await Product.findById(productId)
        .select('name sku stock stockLevel lowStockAlert lowStockThreshold minStock clientId')
        .lean();

      if (!product) return;

      const currentStock = Number(newStock !== undefined ? newStock : (product.stockLevel ?? product.stock ?? 0));
      const threshold = Number(product.lowStockAlert ?? product.lowStockThreshold ?? product.minStock ?? 5);

      // Low stock condition: stock is <= 5 or configured threshold
      if (currentStock <= threshold) {
        console.warn(
          `[LOW_STOCK_TRIGGER] Alert triggered for product "${product.name}" (SKU: ${product.sku}). ` +
          `Current Stock: ${currentStock}, Threshold: ${threshold}.`
        );

        // Check if there is already an active vendor allocation for this product
        const activeAllocationsCount = await VendorAllocation.countDocuments({
          productId: product._id,
          status: { $in: ['PENDING', 'ACCEPTED', 'DISPATCHED'] },
        });

        if (activeAllocationsCount === 0) {
          console.info(
            `[LOW_STOCK_TRIGGER] Product "${product.name}" has 0 active vendor allocations. Pending replenishment prompt generated.`
          );
        } else {
          console.info(
            `[LOW_STOCK_TRIGGER] Product "${product.name}" already has ${activeAllocationsCount} active vendor allocation(s) in progress.`
          );
        }
      }
    } catch (err) {
      console.warn(`[LOW_STOCK_TRIGGER] Error in background stock change listener: ${err.message}`);
    }
  });
});

function emitStockChanged({ productId, newStock, tenantId, oldStock }) {
  try {
    lowStockEventBus.emit('stock:changed', { productId, newStock, tenantId, oldStock });
  } catch (err) {
    console.warn(`[LOW_STOCK_TRIGGER] Failed to emit stock change event: ${err.message}`);
  }
}

module.exports = {
  lowStockEventBus,
  emitStockChanged,
};

