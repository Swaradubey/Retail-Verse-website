const MarketplaceConnection = require('../models/MarketplaceConnection');
const { refreshAccessToken } = require('../services/marketplaceSyncService');
const { getMerchantId } = require('../utils/merchantHelper');

/**
 * Middleware to check if tokenExpiresAt is passed and automatically refresh tokens
 * before calling sync APIs.
 */
async function marketplaceTokenMiddleware(req, res, next) {
  try {
    const channel = (req.params.channel || req.body.channel || '').toLowerCase().trim();
    if (!channel) {
      return res.status(400).json({
        success: false,
        message: 'Marketplace channel parameter is required.'
      });
    }

    // Skip token refresh check for Shopify (Shopify flow remains untouched)
    if (channel === 'shopify') {
      return next();
    }

    const clientId = getMerchantId(req);
    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: 'Client authentication required.'
      });
    }

    // Find connection
    const connection = await MarketplaceConnection.findOne({
      $or: [
        { clientId: clientId, channel: channel },
        { merchantId: clientId, marketplace: channel },
        { merchantId: clientId, channel: channel },
        { clientId: clientId, marketplace: channel }
      ]
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: `No active connection found for marketplace '${channel}'. Please connect first.`
      });
    }

    if (connection.status === 'DISCONNECTED') {
      return res.status(400).json({
        success: false,
        message: `Marketplace connection for '${channel}' is currently disconnected.`
      });
    }

    // Check if tokenExpiresAt is passed or about to expire in the next 2 minutes
    const tokenExpiresAt = connection.credentials?.tokenExpiresAt;
    const now = Date.now();
    const isExpiredOrExpiringSoon = tokenExpiresAt && (new Date(tokenExpiresAt).getTime() - now) < 2 * 60 * 1000;

    if (isExpiredOrExpiringSoon && connection.credentials?.refreshToken) {
      console.log(`[Marketplace Token Refresh] Token expired/expiring for ${channel} (Client: ${clientId}). Refreshing...`);
      try {
        const refreshed = await refreshAccessToken(channel, connection.credentials.refreshToken);
        
        connection.credentials.accessToken = refreshed.accessToken;
        connection.credentials.refreshToken = refreshed.refreshToken;
        connection.credentials.tokenExpiresAt = refreshed.tokenExpiresAt;
        connection.accessToken = refreshed.accessToken;
        connection.accessTokenExpiresAt = refreshed.tokenExpiresAt;

        await connection.save();
        console.log(`[Marketplace Token Refresh] Successfully refreshed token for ${channel}. New expiry: ${refreshed.tokenExpiresAt}`);
      } catch (refreshErr) {
        console.error(`[Marketplace Token Refresh] Failed to refresh token for ${channel}:`, refreshErr.message);
        // Continue if access token might still be usable, or mark connection as FAILED
      }
    }

    req.marketplaceConnection = connection;
    next();
  } catch (err) {
    console.error('[Marketplace Token Middleware Error]:', err.message);
    res.status(500).json({
      success: false,
      message: 'Failed to verify marketplace token state.',
      error: err.message
    });
  }
}

module.exports = marketplaceTokenMiddleware;
