export const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1000&auto=format&fit=crop';

function isWindowsAbsolutePath(url: string): boolean {
  return /^[a-zA-Z]:\\/.test(url);
}

export function getFullImageUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (isWindowsAbsolutePath(url)) return '';
  const fallback = "https://omni-commerce-website.onrender.com";
  let rawBase = String(import.meta.env.VITE_API_BASE_URL ?? "").trim() || fallback;
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!isLocalhost && (rawBase.includes("localhost") || rawBase.includes("127.0.0.1"))) {
    rawBase = fallback;
  }
  const base = rawBase.replace(/\/+$/, "").replace(/\/api$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}

/** Extract the best available image URL from a product-like object, checking all common field locations. */
export function getProductImageUrl(product: any, fallback?: string): string {
  if (!product) return fallback || '';
  const img =
    product.image ||
    product.imageUrl ||
    product.productImage ||
    product.thumbnail ||
    (Array.isArray(product.images) && product.images.length > 0
      ? typeof product.images[0] === 'string'
        ? product.images[0]
        : product.images[0]?.url
      : undefined) ||
    (Array.isArray(product.photos) && product.photos.length > 0
      ? typeof product.photos[0] === 'string'
        ? product.photos[0]
        : product.photos[0]?.url
      : undefined) ||
    (Array.isArray(product.media) && product.media.length > 0
      ? product.media[0]?.url
      : undefined) ||
    '';
  return img || fallback || '';
}
