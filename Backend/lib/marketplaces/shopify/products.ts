export async function createProduct(product: any, config: any) {
  console.log(`[Shopify Connector] Creating product ${product.sku} on Shopify Admin API`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    marketplaceProductId: `SHPFY${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    status: 'success',
    sku: product.sku
  };
}

export async function updateProduct(marketplaceProductId: string, product: any, config: any) {
  console.log(`[Shopify Connector] Updating product ${marketplaceProductId} on Shopify`);
  await new Promise(resolve => setTimeout(resolve, 800));
  return true;
}

export async function deleteProduct(marketplaceProductId: string, config: any) {
  console.log(`[Shopify Connector] Deleting product ${marketplaceProductId} from Shopify`);
  await new Promise(resolve => setTimeout(resolve, 500));
  return true;
}
