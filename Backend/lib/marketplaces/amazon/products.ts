export async function createProduct(product: any, config: any) {
  console.log(`[Amazon Connector] Creating product ${product.sku} on Amazon Selling Partner API`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    marketplaceProductId: `ASIN${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    status: 'success',
    sku: product.sku
  };
}

export async function updateProduct(marketplaceProductId: string, product: any, config: any) {
  console.log(`[Amazon Connector] Updating product ${marketplaceProductId} on Amazon`);
  await new Promise(resolve => setTimeout(resolve, 800));
  return true;
}

export async function deleteProduct(marketplaceProductId: string, config: any) {
  console.log(`[Amazon Connector] Deleting product ${marketplaceProductId} from Amazon`);
  await new Promise(resolve => setTimeout(resolve, 500));
  return true;
}
