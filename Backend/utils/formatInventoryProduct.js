/**
 * Normalizes product docs (lean or plain) for inventory APIs: `clientId` → `client` shape.
 */
function formatProductWithClient(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const plain = { ...doc };
  const cid = plain.clientId;
  if (cid && typeof cid === "object" && cid._id) {
    plain.client = {
      _id: cid._id,
      companyName: cid.companyName,
      shopName: cid.shopName,
      email: cid.email,
    };
  } else {
    plain.client = null;
  }
  delete plain.clientId;

  // Single source of truth for inventory quantity
  const availableStock = Number(
    plain.stockLevel !== undefined && plain.stockLevel !== null && Number(plain.stockLevel) > 0
      ? plain.stockLevel
      : plain.stock !== undefined && plain.stock !== null && Number(plain.stock) > 0
      ? plain.stock
      : plain.quantity !== undefined && plain.quantity !== null && Number(plain.quantity) > 0
      ? plain.quantity
      : plain.stockLevel ?? plain.stock ?? plain.quantity ?? plain.currentStock ?? 0
  ) || 0;

  plain.stockLevel = availableStock;
  plain.stock = availableStock;
  plain.quantity = availableStock;
  plain.currentStock = availableStock;

  return plain;
}

function formatProductsWithClient(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map((d) => formatProductWithClient(d));
}

module.exports = { formatProductWithClient, formatProductsWithClient };
