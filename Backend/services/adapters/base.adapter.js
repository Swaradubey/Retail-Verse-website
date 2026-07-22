class BaseAdapter {
  constructor(credentials) {
    this.credentials = credentials;
  }
  
  getAuthorizationUrl(state) {
    throw new Error('Method not implemented');
  }

  async exchangeAuthorizationCode(code) {
    throw new Error('Method not implemented');
  }

  async refreshAccessToken(refreshToken) {
    throw new Error('Method not implemented');
  }

  async testConnection() {
    throw new Error('Method not implemented');
  }

  async fetchOrders(params) {
    throw new Error('Method not implemented');
  }

  async fetchProducts(params) {
    throw new Error('Method not implemented');
  }

  async updateInventory(productId, quantity) {
    throw new Error('Method not implemented');
  }

  async updatePrice(productId, price) {
    throw new Error('Method not implemented');
  }
}

module.exports = BaseAdapter;
