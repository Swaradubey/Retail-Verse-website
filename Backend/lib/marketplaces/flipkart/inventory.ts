export async function updateInventory(marketplaceProductId: string, quantity: number, config: any) {
  console.log(`[Flipkart Connector] Updating inventory for ${marketplaceProductId} to ${quantity}`);
  await new Promise(resolve => setTimeout(resolve, 500));
  return true;
}
