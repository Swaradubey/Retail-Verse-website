const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceLog = require('../models/MarketplaceLog');
const marketplaceService = require('./marketplace.service');
const tokenService = require('./token.service');

class HealthService {
  async runHealthCheck(connectionId) {
    try {
      const connection = await MarketplaceConnection.findById(connectionId);
      if (!connection) throw new Error('Connection not found');

      const adapter = marketplaceService.getAdapter(connection.marketplace);
      // Ensure we have a valid token (in a real scenario we'd decrypt and pass it)
      // const accessToken = tokenService.decrypt(connection.encryptedAccessToken);
      
      const healthResult = await adapter.testConnection();

      connection.apiHealth = healthResult.status;
      connection.lastHealthCheck = new Date();
      
      if (healthResult.status === 'down') {
        connection.status = 'error';
      }

      await connection.save();

      await MarketplaceLog.create({
        merchantId: connection.merchantId,
        connectionId: connection._id,
        marketplace: connection.marketplace,
        type: 'health_check',
        level: healthResult.status === 'healthy' ? 'info' : 'warning',
        message: `Health check completed with status: ${healthResult.status}`,
        metadata: healthResult
      });

      return healthResult;
    } catch (error) {
      console.error('Health check failed:', error);
      
      // Update connection status
      await MarketplaceConnection.findByIdAndUpdate(connectionId, {
        apiHealth: 'down',
        status: 'error',
        lastHealthCheck: new Date(),
        lastError: error.message
      });

      throw error;
    }
  }
}

module.exports = new HealthService();
