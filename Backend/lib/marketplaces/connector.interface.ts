import {
  MarketplaceCode,
  MarketplaceAuthResult,
  MarketplaceTokenResult,
  MarketplaceAccountInfo,
  MarketplaceHealthResult,
} from './types';

export interface MarketplaceConnector {
  marketplace: MarketplaceCode;
  connectionType: 'oauth' | 'credentials' | 'partner' | 'network';

  getAuthorizationUrl?(input: {
    merchantId: string;
    connectionId?: string;
    redirectUri: string;
    metadata?: Record<string, string>;
  }): Promise<string>;

  exchangeAuthorizationCode?(input: {
    code: string;
    redirectUri: string;
    metadata?: Record<string, string>;
  }): Promise<MarketplaceAuthResult>;

  validateCredentials?(
    credentials: Record<string, string>
  ): Promise<MarketplaceAuthResult>;

  refreshAccessToken?(
    connection: any
  ): Promise<MarketplaceTokenResult>;

  getAccountInfo(
    connection: any
  ): Promise<MarketplaceAccountInfo>;

  checkHealth(
    connection: any
  ): Promise<MarketplaceHealthResult>;

  revokeConnection?(
    connection: any
  ): Promise<void>;

  // Existing sync methods (optional to support placeholder integrations)
  createProduct?(product: any, config: any): Promise<{ marketplaceProductId: string; [key: string]: any }>;
  updateProduct?(marketplaceProductId: string, product: any, config: any): Promise<boolean>;
  updateInventory?(marketplaceProductId: string, quantity: number, config: any): Promise<boolean>;
  updatePrice?(marketplaceProductId: string, price: number, config: any): Promise<boolean>;
  deleteProduct?(marketplaceProductId: string, config: any): Promise<boolean>;
}
