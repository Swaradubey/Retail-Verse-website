/**
 * Base Marketplace Adapter Interface
 * All specific marketplace adapters must implement these methods.
 */
class MarketplaceAdapter {
  constructor(connection) {
    this.connection = connection; // MarketplaceConnection mongoose document
  }

  /**
   * Connect and initialize tokens
   */
  async connect(authPayload) {
    throw new Error('Not implemented');
  }

  /**
   * Disconnect and revoke tokens if possible
   */
  async disconnect() {
    throw new Error('Not implemented');
  }

  /**
   * Test the connection to the marketplace API
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection() {
    throw new Error('Not implemented');
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken() {
    throw new Error('Not implemented');
  }

  /**
   * Get marketplace account details
   */
  async getAccountDetails() {
    throw new Error('Not implemented');
  }

  /**
   * Validate a product before creating a listing
   * @param {Object} product - The Retail Verse Product
   * @returns {Promise<{isValid: boolean, missingFields: string[]}>}
   */
  async validateProduct(product) {
    throw new Error('Not implemented');
  }

  /**
   * Create a new product listing on the marketplace
   * @param {Object} product
   */
  async createListing(product) {
    throw new Error('Not implemented');
  }

  /**
   * Update an existing product listing on the marketplace
   * @param {Object} product
   */
  async updateListing(product) {
    throw new Error('Not implemented');
  }

  /**
   * Update inventory count on the marketplace
   * @param {Object} product
   */
  async updateInventory(product) {
    throw new Error('Not implemented');
  }

  /**
   * Update product price on the marketplace
   * @param {Object} product
   */
  async updatePrice(product) {
    throw new Error('Not implemented');
  }

  /**
   * Delete or archive a listing from the marketplace
   * @param {Object} product
   */
  async deleteListing(product) {
    throw new Error('Not implemented');
  }

  /**
   * Fetch listing details from the marketplace
   * @param {string} marketplaceProductId
   */
  async getListing(marketplaceProductId) {
    throw new Error('Not implemented');
  }

  /**
   * Import existing products from the marketplace to Retail Verse
   */
  async importProducts() {
    throw new Error('Not implemented');
  }

  /**
   * Import orders from the marketplace to Retail Verse
   */
  async importOrders() {
    throw new Error('Not implemented');
  }

  /**
   * Normalize marketplace specific error responses into a standard format
   * @param {Error} error
   */
  normalizeError(error) {
    return {
      message: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN',
      originalError: error
    };
  }
}

module.exports = MarketplaceAdapter;
