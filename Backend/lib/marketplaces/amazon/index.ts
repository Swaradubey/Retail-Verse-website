import { MarketplaceConnector } from '../connector.interface';
import { MarketplaceCode, MarketplaceAuthResult, MarketplaceTokenResult, MarketplaceAccountInfo, MarketplaceHealthResult } from '../types';
import { encryptSecret, decryptSecret } from '../encryption';
import { createProduct, updateProduct, deleteProduct } from './products';
import { updateInventory } from './inventory';
import { updatePrice } from './pricing';

export default class AmazonConnector implements MarketplaceConnector {
  public marketplace: MarketplaceCode = 'amazon';
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
    const appId = process.env.AMAZON_SP_API_APP_ID;
    const redirectUri = process.env.AMAZON_REDIRECT_URI || input.redirectUri;
    if (!appId) {
      throw new Error('AMAZON_SP_API_APP_ID environment variable is missing');
    }
    const state = input.metadata?.state || '';
    return `https://sellercentral.amazon.com/apps/authorize/consent?application_id=${appId}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  async exchangeAuthorizationCode(input: { code: string; redirectUri: string; metadata?: any }): Promise<MarketplaceAuthResult> {
    const clientId = process.env.AMAZON_LWA_CLIENT_ID;
    const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Amazon LWA application variables (AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET) are missing');
    }

    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: process.env.AMAZON_REDIRECT_URI || input.redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Amazon LWA token exchange failed: ${errBody}`);
    }

    const data = await response.json() as any;
    const encryptedAccessToken = encryptSecret(data.access_token);
    const encryptedRefreshToken = data.refresh_token ? encryptSecret(data.refresh_token) : undefined;
    
    return {
      credentials: {
        encryptedAccessToken,
        encryptedRefreshToken,
      },
      account: {
        sellerId: input.metadata?.selling_partner_id || 'mock_amazon_seller_id',
        sellerName: 'Amazon Store Account',
        region: process.env.AMAZON_SP_API_REGION || 'eu',
        countryCode: 'US',
      },
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  async refreshAccessToken(connection: any): Promise<MarketplaceTokenResult> {
    const clientId = process.env.AMAZON_LWA_CLIENT_ID;
    const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
    const encryptedRefreshToken = connection.credentials?.encryptedRefreshToken;
    if (!clientId || !clientSecret || !encryptedRefreshToken) {
      throw new Error('Unable to refresh token: LWA credentials or refresh token missing');
    }

    const refreshToken = decryptSecret(encryptedRefreshToken);
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Amazon LWA token refresh failed: ${response.statusText}`);
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
      sellerName: connection.account?.sellerName || 'Amazon Store Account',
      region: connection.account?.region || 'eu',
      countryCode: connection.account?.countryCode || 'US',
    };
  }

  async checkHealth(connection: any): Promise<MarketplaceHealthResult> {
    const isExpired = connection.tokenExpiresAt && new Date() > new Date(connection.tokenExpiresAt);
    return {
      status: isExpired ? 'warning' : 'healthy',
      tokenValid: !isExpired,
      accountReachable: true,
      permissionsValid: true,
      lastCheckedAt: new Date(),
    };
  }
}
