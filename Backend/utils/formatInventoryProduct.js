/**
 * Constructs dynamic full absolute URL for local/relative image paths using BACKEND_URL or BASE_URL
 */
const getFullImageUrl = (imagePath) => {
  if (!imagePath || typeof imagePath !== "string") return imagePath || null;
  const trimmed = imagePath.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  const baseUrl = (
    process.env.BACKEND_URL ||
    process.env.BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.SERVER_URL ||
    `http://localhost:${process.env.PORT || 5000}`
  ).replace(/\/+$/, "");
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${baseUrl}${cleanPath}`;
};

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

  // Attach dynamic full absolute imageUrl for Mobile App & Web Frontend
  const rawImg = plain.imageUrl || plain.image || "";
  const fullUrl = getFullImageUrl(rawImg);
  plain.imageUrl = fullUrl || "";
  if (!plain.image || !plain.image.startsWith("http")) {
    plain.image = fullUrl || plain.image || "";
  }
  if (Array.isArray(plain.images) && plain.images.length > 0) {
    plain.images = plain.images.map((img) => (typeof img === "string" ? getFullImageUrl(img) : img));
  } else if (fullUrl) {
    plain.images = [fullUrl];
  }

  return plain;
}

function formatProductsWithClient(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map((d) => formatProductWithClient(d));
}

module.exports = { formatProductWithClient, formatProductsWithClient, getFullImageUrl };
