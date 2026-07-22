const AmazonAdapter = require('./adapters/amazon.adapter');
const FlipkartAdapter = require('./adapters/flipkart.adapter');

const ShopifyAdapter = require('./adapters/shopify.adapter');

class MarketplaceService {
  getAdapter(marketplaceName, credentials = {}) {
    switch (marketplaceName) {
      case 'amazon':
        return new AmazonAdapter(credentials);
      case 'flipkart':
        return new FlipkartAdapter(credentials);

      case 'shopify':
        return new ShopifyAdapter(credentials);
      default:
        throw new Error(`Unsupported marketplace: ${marketplaceName}`);
    }
  }

  async createConnection(merchantId, marketplace, data) {
    // This is handled in the controller using Mongoose directly, but we can put business logic here
  }
}

module.exports = new MarketplaceService();
