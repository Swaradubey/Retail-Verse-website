export async function createProduct(product: any, config: any) {
  console.log(`[Flipkart Connector] Creating product ${product.sku} on Flipkart Seller API`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    marketplaceProductId: `FSN${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    status: 'success',
    sku: product.sku
  };
}

export async function updateProduct(marketplaceProductId: string, product: any, config: any) {
  console.log(`[Flipkart Connector] Updating product ${marketplaceProductId} on Flipkart`);
  await new Promise(resolve => setTimeout(resolve, 800));
  return true;
}

export async function deleteProduct(marketplaceProductId: string, config: any) {
  console.log(`[Flipkart Connector] Deleting product ${marketplaceProductId} from Flipkart`);
  await new Promise(resolve => setTimeout(resolve, 500));
  return true;
}
