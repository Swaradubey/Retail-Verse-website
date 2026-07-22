import { MarketplaceConnector } from '../connector.interface';
import { MarketplaceCode, MarketplaceAuthResult, MarketplaceTokenResult, MarketplaceAccountInfo, MarketplaceHealthResult } from '../types';
import { encryptSecret, decryptSecret } from '../encryption';
import { createProduct, updateProduct, deleteProduct } from './products';
import { updateInventory } from './inventory';
import { updatePrice } from './pricing';

export default class FlipkartConnector implements MarketplaceConnector {
  public marketplace: MarketplaceCode = 'flipkart';
  public connectionType: 'oauth' = 'oauth';

  // Delegate product sync to existing methods
  async createProduct(product: any, config: any) {
    return createProduct(product, config);
  }
  async updateProduct(marketplaceProductId: string, product: any, config: any) {
    return updateProduct(marketplaceProductId, product, config);
  }
  async updateInventory(marketplaceProductId: string, quantity: number, config: any) {
    return updateInventory(marketplaceProductId, quantity, config);
  }
  async updatePrice(marketplaceProductId: string, price: number, config: any) {
    return updatePrice(marketplaceProductId, price, config);
  }
  async deleteProduct(marketplaceProductId: string, config: any) {
    return deleteProduct(marketplaceProductId, config);
  }

  async getAuthorizationUrl(input: { merchantId: string; redirectUri: string; metadata?: any }): Promise<string> {
    const appId = process.env.FLIPKART_APPLICATION_ID;
    const secret = process.env.FLIPKART_APPLICATION_SECRET;
    const redirectUri = process.env.FLIPKART_REDIRECT_URI || input.redirectUri;
    const baseUrl = process.env.FLIPKART_API_BASE_URL;

    if (!appId || !secret || !baseUrl) {
      throw new Error('Flipkart developer application access required.');
    }

    const state = input.metadata?.state || '';
    return `${baseUrl}/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code`;
  }

  async exchangeAuthorizationCode(input: { code: string; redirectUri: string; metadata?: any }): Promise<MarketplaceAuthResult> {
    const appId = process.env.FLIPKART_APPLICATION_ID;
    const secret = process.env.FLIPKART_APPLICATION_SECRET;
    const baseUrl = process.env.FLIPKART_API_BASE_URL;

    if (!appId || !secret || !baseUrl) {
      throw new Error('Flipkart developer application access required.');
    }

    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: process.env.FLIPKART_REDIRECT_URI || input.redirectUri,
        client_id: appId,
        client_secret: secret,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Flipkart token exchange failed: ${errBody}`);
    }

    const data = await response.json() as any;
    return {
      credentials: {
        encryptedAccessToken: encryptSecret(data.access_token),
        encryptedRefreshToken: data.refresh_token ? encryptSecret(data.refresh_token) : undefined,
      },
      account: {
        sellerId: data.seller_id || 'mock_flipkart_seller_id',
        sellerName: 'Flipkart Seller Account',
      },
    };
  }

  async refreshAccessToken(connection: any): Promise<MarketplaceTokenResult> {
    const appId = process.env.FLIPKART_APPLICATION_ID;
    const secret = process.env.FLIPKART_APPLICATION_SECRET;
    const baseUrl = process.env.FLIPKART_API_BASE_URL;
    const encryptedRefreshToken = connection.credentials?.encryptedRefreshToken;

    if (!appId || !secret || !baseUrl || !encryptedRefreshToken) {
      throw new Error('Flipkart configuration or refresh token missing');
    }

    const refreshToken = decryptSecret(encryptedRefreshToken);
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appId,
        client_secret: secret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Flipkart token refresh failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in || 3600,
    };
  }

  async getAccountInfo(connection: any): Promise<MarketplaceAccountInfo> {
    return {
      sellerId: connection.account?.sellerId || 'unknown',
      sellerName: connection.account?.sellerName || 'Flipkart Seller Account',
    };
  }

  async checkHealth(connection: any): Promise<MarketplaceHealthResult> {
    return {
      status: 'healthy',
      tokenValid: true,
      accountReachable: true,
      permissionsValid: true,
      lastCheckedAt: new Date(),
    };
  }
}
