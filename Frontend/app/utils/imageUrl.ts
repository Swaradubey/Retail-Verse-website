export const PRODUCT_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="%23f8fafc" stroke="%2394a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

export const FALLBACK_IMAGE = PRODUCT_PLACEHOLDER;

function isWindowsAbsolutePath(url: string): boolean {
  return /^[a-zA-Z]:\\/.test(url);
}

/**
 * Validates whether a given URL string is likely a valid direct image URL or image data/blob URL.
 * Detects and rejects web page / article URLs (e.g. Wikipedia articles, Amazon product pages, generic .html pages).
 */
export function isValidImageUrlFormat(url?: string | null): boolean {
  if (!url) return true;
  const str = url.trim();
  if (!str) return true;

  if (str.startsWith('data:image/')) return true;
  if (str.startsWith('blob:')) return true;

  if (!str.startsWith('http://') && !str.startsWith('https://') && !str.startsWith('/')) {
    return false;
  }

  try {
    const parsed = new URL(str, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const pathname = parsed.pathname.toLowerCase();

    // Reject known web page / article path structures unless they end in an image extension
    const hasImageExt = /\.(jpeg|jpg|png|webp|gif|svg|avif|bmp|ico)$/i.test(pathname);
    if (!hasImageExt) {
      if (
        pathname.endsWith('.html') ||
        pathname.endsWith('.htm') ||
        pathname.endsWith('.php') ||
        pathname.includes('/wiki/') ||
        pathname.includes('/article/') ||
        pathname.includes('/dp/') ||
        pathname.includes('/p/')
      ) {
        return false;
      }
    } else {
      return true;
    }

    // Common image CDN signals
    if (
      parsed.hostname.includes('unsplash.com') ||
      parsed.hostname.includes('imgur.com') ||
      parsed.hostname.includes('cloudinary.com') ||
      parsed.hostname.includes('cdn.shopify.com') ||
      parsed.hostname.includes('picsum.photos') ||
      parsed.searchParams.has('format') ||
      parsed.searchParams.has('fm') ||
      parsed.searchParams.has('fit') ||
      parsed.searchParams.has('w') ||
      parsed.searchParams.has('h')
    ) {
      return true;
    }

    // Generic web routes with no extension or params
    if (!pathname.includes('.') && !parsed.search) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the backend root (strip /api suffix if present) so image paths
 * can be appended directly: e.g. base + "/uploads/image.jpg"
 * Uses VITE_API_BASE_URL — same env variable as apiService.ts.
 */
const _IMAGE_API_BASE: string = (
  String(import.meta.env.VITE_API_BASE_URL ?? "").trim() || "http://localhost:5000"
).replace(/\/+$/, "").replace(/\/api$/, "");

export function getFullImageUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (isWindowsAbsolutePath(url)) return '';
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${_IMAGE_API_BASE}${path}`;
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
