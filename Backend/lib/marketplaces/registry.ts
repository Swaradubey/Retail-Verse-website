import AmazonConnector from './amazon';
import ShopifyConnector from './shopify';
import FlipkartConnector from './flipkart';
import { MarketplaceCode, RegistryMarketplace } from './types';
import { MarketplaceConnector } from './connector.interface';

const connectors: Record<MarketplaceCode, MarketplaceConnector> = {
  amazon: new AmazonConnector(),
  shopify: new ShopifyConnector(),
  flipkart: new FlipkartConnector(),
};

const REQUIRED_VARS: Record<MarketplaceCode, string[]> = {
  amazon: ['AMAZON_LWA_CLIENT_ID', 'AMAZON_LWA_CLIENT_SECRET', 'AMAZON_SP_API_APP_ID', 'AMAZON_REDIRECT_URI'],
  shopify: ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_REDIRECT_URI'],
  flipkart: ['FLIPKART_APPLICATION_ID', 'FLIPKART_APPLICATION_SECRET', 'FLIPKART_REDIRECT_URI', 'FLIPKART_API_BASE_URL'],
};

const MARKETPLACE_METADATA: Record<MarketplaceCode, Omit<RegistryMarketplace, 'availability' | 'connector'>> = {
  amazon: {
    code: 'amazon',
    displayName: 'Amazon Selling Partner',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg',
    connectionType: 'oauth',
    connectButtonLabel: 'Connect Amazon',
    description: 'Sync your catalog and orders with Amazon Selling Partner API.',
    requiredEnvironmentVariables: REQUIRED_VARS.amazon,
    supportedCapabilities: {
      productSync: true,
      inventorySync: true,
      priceSync: true,
      orderSync: true,
      webhookSupport: false,
      tokenRefresh: true,
    },
  },
  shopify: {
    code: 'shopify',
    displayName: 'Shopify Store',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Shopify_logo_2018.svg',
    connectionType: 'oauth',
    connectButtonLabel: 'Connect Shopify',
    description: 'Import and sync products, inventory, and orders with Shopify.',
    requiredEnvironmentVariables: REQUIRED_VARS.shopify,
    supportedCapabilities: {
      productSync: true,
      inventorySync: true,
      priceSync: true,
      orderSync: true,
      webhookSupport: true,
      tokenRefresh: false,
    },
  },

  flipkart: {
    code: 'flipkart',
    displayName: 'Flipkart Seller',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/e/e5/Flipkart_logo_%282026%29.svg',
    connectionType: 'oauth',
    connectButtonLabel: 'Connect Flipkart',
    description: 'Synchronize inventory and pricing with Flipkart Developer API.',
    requiredEnvironmentVariables: REQUIRED_VARS.flipkart,
    supportedCapabilities: {
      productSync: true,
      inventorySync: true,
      priceSync: true,
      orderSync: true,
      webhookSupport: false,
      tokenRefresh: true,
    },
  },
};

export function getConnector(code: MarketplaceCode): MarketplaceConnector {
  const connector = connectors[code];
  if (!connector) {
    throw new Error(`No connector found for marketplace code: ${code}`);
  }
  return connector;
}

export function checkAvailability(code: MarketplaceCode): RegistryMarketplace['availability'] {
  const reqVars = REQUIRED_VARS[code] || [];
  const isAvailable = reqVars.every((v) => !!process.env[v]);
  return isAvailable ? 'available' : 'configuration_missing';
}

export function getRegistryEntries(): RegistryMarketplace[] {
  const codes: MarketplaceCode[] = ['amazon', 'shopify', 'flipkart'];
  return codes.map((code) => {
    const meta = MARKETPLACE_METADATA[code];
    return {
      ...meta,
      availability: checkAvailability(code),
      connector: getConnector(code),
    };
  });
}
