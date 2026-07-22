export async function updatePrice(marketplaceProductId: string, price: number, config: any) {
  console.log(`[Amazon Connector] Updating price for ${marketplaceProductId} to ${price}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  return true;
}
