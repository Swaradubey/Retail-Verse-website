import { MarketplaceConnector } from '../connector.interface';
import { MarketplaceCode, MarketplaceAuthResult, MarketplaceTokenResult, MarketplaceAccountInfo, MarketplaceHealthResult } from '../types';
import { encryptSecret } from '../encryption';
import { createProduct, updateProduct, deleteProduct } from './products';
import { updateInventory } from './inventory';
import { updatePrice } from './pricing';

export function normalizeShopifyDomain(shop: string): string {
  let cleaned = shop.trim().toLowerCase();
  // Strip protocol
  cleaned = cleaned.replace(/^https?:\/\//, '');
  // Strip trailing slashes and path components
  cleaned = cleaned.split('/')[0];
  
  if (!cleaned.includes('.')) {
    cleaned = `${cleaned}.myshopify.com`;
  }
  
  // Strict regex check for Shopify shop domain
  const regex = /^[a-z0-9-]+\.myshopify\.com$/;
  if (!regex.test(cleaned)) {
    throw new Error('Invalid Shopify domain. It must be in the format: store-name.myshopify.com');
  }
  return cleaned;
}

export default class ShopifyConnector implements MarketplaceConnector {
  public marketplace: MarketplaceCode = 'shopify';
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
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const scopes = process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_inventory,write_inventory,read_locations,read_orders,write_orders';
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI || input.redirectUri;
    
    if (!clientId) {
      throw new Error('SHOPIFY_CLIENT_ID environment variable is missing');
    }
    
    const rawShop = input.metadata?.shop;
    if (!rawShop) {
      throw new Error('Shopify store domain (shop) is required to initiate connection');
    }
    
    const shop = normalizeShopifyDomain(rawShop);
    const state = input.metadata?.state || '';
    
    return `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  async exchangeAuthorizationCode(input: { code: string; redirectUri: string; metadata?: any }): Promise<MarketplaceAuthResult> {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Shopify application variables (SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET) are missing');
    }
    
    const rawShop = input.metadata?.shop;
    if (!rawShop) {
      throw new Error('Shopify shop domain is required in metadata to exchange token');
    }
    
    const shop = normalizeShopifyDomain(rawShop);
    
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: input.code,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Shopify access token exchange failed: ${errBody}`);
    }

    const tokenData = await response.json() as any;
    const encryptedAccessToken = encryptSecret(tokenData.access_token);
    
    // Fetch shop details for validation and name storage
    const shopDetailResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': tokenData.access_token,
      },
    });

    let shopName = 'Shopify Store';
    let sellerId = shop;
    if (shopDetailResponse.ok) {
      const shopDetail = await shopDetailResponse.json() as any;
      shopName = shopDetail.shop?.name || shopName;
      sellerId = String(shopDetail.shop?.id || sellerId);
    }

    return {
      credentials: {
        encryptedAccessToken,
      },
      account: {
        sellerId,
        sellerName: shopName,
        storeName: shopName,
        shopDomain: shop,
        countryCode: 'US',
      },
      grantedScopes: tokenData.scope ? tokenData.scope.split(',') : undefined,
    };
  }

  async getAccountInfo(connection: any): Promise<MarketplaceAccountInfo> {
    return {
      sellerId: connection.account?.sellerId || 'unknown',
      sellerName: connection.account?.sellerName || 'Shopify Store',
      storeName: connection.account?.storeName || 'Shopify Store',
      shopDomain: connection.account?.shopDomain || '',
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
