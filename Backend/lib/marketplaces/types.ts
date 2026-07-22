export type MarketplaceCode =
  | 'amazon'
  | 'flipkart'
  | 'shopify';

export type ConnectionType = 'oauth' | 'credentials' | 'partner' | 'network';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'expired'
  | 'reconnect_required'
  | 'configuration_missing'
  | 'approval_required'
  | 'error';

export interface MarketplaceAuthResult {
  credentials: {
    encryptedAccessToken?: string;
    encryptedRefreshToken?: string;
    encryptedConsumerKey?: string;
    encryptedConsumerSecret?: string;
    encryptedClientId?: string;
    encryptedClientSecret?: string;
    encryptedWebhookSecret?: string;
  };
  account: {
    sellerId?: string;
    sellerName?: string;
    storeName?: string;
    storeUrl?: string;
    shopDomain?: string;
    marketplaceIds?: string[];
    region?: string;
    countryCode?: string;
  };
  grantedScopes?: string[];
  tokenExpiresAt?: Date;
}

export interface MarketplaceTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface MarketplaceAccountInfo {
  sellerId?: string;
  sellerName?: string;
  storeName?: string;
  storeUrl?: string;
  shopDomain?: string;
  marketplaceIds?: string[];
  region?: string;
  countryCode?: string;
}

export interface MarketplaceHealthResult {
  status: 'healthy' | 'warning' | 'unhealthy';
  tokenValid: boolean;
  accountReachable: boolean;
  permissionsValid: boolean;
  lastCheckedAt: Date;
  lastError?: string;
}

export interface RegistryMarketplace {
  code: MarketplaceCode;
  displayName: string;
  logo: string;
  connectionType: ConnectionType;
  availability: 'available' | 'configuration_missing' | 'approval_required';
  connectButtonLabel: string;
  description: string;
  requiredEnvironmentVariables: string[];
  supportedCapabilities: {
    productSync: boolean;
    inventorySync: boolean;
    priceSync: boolean;
    orderSync: boolean;
    webhookSupport: boolean;
    tokenRefresh: boolean;
  };
}
