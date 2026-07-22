const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceLog = require('../models/MarketplaceLog');
const marketplaceService = require('./marketplace.service');

class SyncService {
  async syncNow(connectionId) {
    try {
      const connection = await MarketplaceConnection.findById(connectionId);
      if (!connection) throw new Error('Connection not found');
      if (connection.status !== 'connected') throw new Error('Cannot sync a disconnected account');

      const adapter = marketplaceService.getAdapter(connection.marketplace);
      
      // In a real app, this would dispatch background jobs (e.g. BullMQ)
      // For now, we simulate the sync
      let orders = [];
      let products = [];

      if (connection.syncSettings.orders) {
        orders = await adapter.fetchOrders({});
      }
      
      if (connection.syncSettings.products) {
        products = await adapter.fetchProducts({});
      }

      connection.lastSuccessfulSync = new Date();
      await connection.save();

      await MarketplaceLog.create({
        merchantId: connection.merchantId,
        connectionId: connection._id,
        marketplace: connection.marketplace,
        type: 'sync',
        level: 'info',
        message: 'Manual sync completed successfully',
        metadata: {
          ordersSynced: orders.length,
          productsSynced: products.length
        }
      });

      return {
        success: true,
        ordersSynced: orders.length,
        productsSynced: products.length
      };
    } catch (error) {
      console.error('Sync failed:', error);
      
      await MarketplaceConnection.findByIdAndUpdate(connectionId, {
        lastError: error.message
      });

      throw error;
    }
  }
}

module.exports = new SyncService();
