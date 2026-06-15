import { useParams, Link, useNavigate } from 'react-router';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { ShoppingCart, Star, Heart, Share2, Truck, Shield, RotateCcw, ChevronLeft, MessageSquare, Loader2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { ProductCard } from '../components/ProductCard';
import { productApi, Product as DynamicProduct } from '../api/products';
import { wishlistApi } from '../api/wishlist';
import { Product as ShopProduct } from '../types/product';
import { QuoteRequestDialog } from '../components/QuoteRequestDialog';
import {
  slugifyProductName,
  buildWishlistCheckParams,
  buildWishlistToggleBody,
  buildWishlistRemoveParams,
} from '../utils/wishlistPayload';
import { formatINR } from '../utils/formatINR';
import { getFullImageUrl, getProductImageUrl, FALLBACK_IMAGE } from '../utils/imageUrl';

/** Map API product to shop shape (same rules as the list fetch in this page). */
function normalizeShopProductFromApi(p: DynamicProduct): ShopProduct & { _id?: string } {
  const imgUrl = getProductImageUrl(p);
  return {
    id: p._id || `dyn-${Math.random().toString(36).substr(2, 9)}`,
    _id: p._id,
    name: p.name,
    slug: slugifyProductName(p.name),
    price: p.price,
    description: p.description || '',
    category: p.category,
    image: imgUrl || FALLBACK_IMAGE,
    images: imgUrl ? [imgUrl] : [FALLBACK_IMAGE],
    stock: p.stock,
    rating: p.rating || 0,
    reviews: p.numReviews || 0,
    featured: false,
    sku: p.sku,
    clientId: p.clientId || (p.client as any)?._id
  } as ShopProduct & { _id?: string; clientId?: string };
}

export function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user, isLoading: authLoading } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [dynamicProducts, setDynamicProducts] = useState<ShopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistToggling, setWishlistToggling] = useState(false);
  const [wishlistKeySet, setWishlistKeySet] = useState<Set<string>>(() => new Set());
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [currentRating, setCurrentRating] = useState<number>(0);
  const [currentReviews, setCurrentReviews] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);

  const wishlistPool = useMemo(
    () => [...dynamicProducts] as (ShopProduct & { _id?: string })[],
    [dynamicProducts]
  );

  const refreshWishlistKeys = useCallback(async () => {
    if (!user) {
      setWishlistKeySet(new Set());
      return;
    }
    try {
      const res = await wishlistApi.getList();
      if (!res.success || !res.data) return;
      const next = new Set<string>();
      (res.data.productIds || []).forEach((id) => next.add(`mongo:${id}`));
      (res.data.items || []).forEach((row) => {
        if (row.productKey) next.add(row.productKey);
      });
      setWishlistKeySet(next);
    } catch {
      setWishlistKeySet(new Set());
    }
  }, [user]);

  useEffect(() => {
    refreshWishlistKeys();
  }, [refreshWishlistKeys]);

  useEffect(() => {
    const fetchDynamicProducts = async () => {
      try {
        const clientId = user?.clientId || user?.linkedClientId || localStorage.getItem("retail_verse_client_id");
        const response = await productApi.getAll(clientId || undefined);
        if (response.success && Array.isArray(response.data)) {
          const normalized = response.data.map((p: DynamicProduct) =>
            normalizeShopProductFromApi(p)
          );
          setDynamicProducts(normalized);
        }
      } catch (err) {
        console.error('Failed to fetch dynamic products:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDynamicProducts();
  }, []);

  useEffect(() => {
    const routeId = slug || '';
    const p = dynamicProducts.find(
      (dp) =>
        dp._id === routeId ||
        dp.id === routeId ||
        dp.slug === routeId ||
        dp.id?.toString() === routeId
    );
    if (!user || !p || authLoading) {
      setInWishlist(false);
      return;
    }
    const params = buildWishlistCheckParams(p, dynamicProducts);
    let cancelled = false;
    (async () => {
      try {
        const res = await wishlistApi.check(params);
        if (!cancelled && res.success) setInWishlist(!!res.inWishlist);
      } catch {
        if (!cancelled) setInWishlist(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, dynamicProducts, user, authLoading]);

  const id = slug || '';

  const product = dynamicProducts.find((p) => {
    const match =
      p._id === id ||
      p.id === id ||
      p.slug === id ||
      p.id?.toString() === id;
    return match;
  });

  useEffect(() => {
    if (product) {
      setCurrentRating(product.rating || 0);
      setCurrentReviews(product.reviews || 0);
    }
  }, [product]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Product not found</h2>
          <Link to="/shop" className="text-blue-600 hover:text-blue-700">
            Back to shop
          </Link>
        </div>
      </div>
    );
  }

  const handleRate = async (newRating: number) => {
    if (!user) {
      toast.error('Please login to rate this product');
      return;
    }
    
    // Safety check for ID
    const productId = product?._id || product?.id;
    const isMongoId = product?._id || (typeof product?.id === 'string' && product.id.length === 24);
    
    if (!isMongoId) {
       toast.error('Rating is only available for online products');
       return;
    }

    try {
      const res = await productApi.rate(productId!, newRating);
      if (res.success) {
        setCurrentRating(res.rating);
        setCurrentReviews(res.numReviews);
        toast.success(res.message || 'Rating updated');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit rating');
    }
  };

  const displayPrice = product.salePrice || product.price;
  const hasDiscount = !!product.salePrice;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
    : 0;

  const relatedProducts = wishlistPool
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      addToCart(product);
    }
  };

  const handleWishlist = async () => {
    if (!user) {
      toast.error('Please sign in to save items to your wishlist.');
      return;
    }
    let body = buildWishlistToggleBody(product, dynamicProducts);
    if ('item' in body) {
      try {
        const response = await productApi.getAll();
        if (response.success && Array.isArray(response.data)) {
          const list = response.data.map((p: DynamicProduct) => normalizeShopProductFromApi(p));
          const retry = buildWishlistToggleBody(product, list);
          if ('productId' in retry) body = retry;
        }
      } catch {
        // keep static snapshot body
      }
    }
    const removeParams = buildWishlistRemoveParams(product, dynamicProducts);
    setWishlistToggling(true);
    try {
      if (!inWishlist) {
        const res = await wishlistApi.add(body);
        if (res.success) {
          setInWishlist(true);
          toast.success(
            res.message ||
              (res.alreadyExists ? 'Already in wishlist' : 'Added to Wishlist')
          );
          await refreshWishlistKeys();
        }
      } else {
        const res = await wishlistApi.remove(removeParams);
        if (res.success) {
          setInWishlist(false);
          toast.success(res.message || 'Removed from wishlist');
          await refreshWishlistKeys();
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Wishlist could not be updated';
      toast.error(msg);
    } finally {
      setWishlistToggling(false);
    }
  };

  const handleShare = async () => {
    const pathSlug = slug || '';
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/product/${pathSlug}`
        : '';
    const title = product.name;
    const desc = product.description || '';
    const text =
      desc.length > 0
        ? `${desc.slice(0, 120)}${desc.length > 120 ? '…' : ''}`
        : `Check out ${title}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err: unknown) {
        const name =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name?: string }).name)
            : '';
        if (name === 'AbortError') return;
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success('Product link copied');
      } else {
        toast.error('Unable to copy link in this browser');
      }
    } catch {
      toast.error('Could not copy link');
    }
  };

  const role = (user as any)?.role || (user as any)?.userRole || (user as any)?.accountType;
  const canRequestQuote = Boolean(user && ["admin", "client", "superadmin", "super_admin"].includes(String(role).toLowerCase()));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
            {/* Images */}
            <div>
              <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden mb-4">
                <img
                  src={getFullImageUrl(product.images[selectedImage])}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                  }}
                />
              </div>
              {product.images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {product.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(idx)}
                      className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedImage === idx ? 'border-blue-500' : 'border-gray-200'
                      }`}
                    >
                      <img src={getFullImageUrl(img)} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div>
              <div className="mb-4">
                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-600 text-sm font-medium rounded-full mb-2">
                  {product.category}
                </span>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
                
                {/* Rating */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleRate(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="focus:outline-none transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= (hoverRating || Math.round(currentRating))
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="text-sm text-gray-600">
                    {currentRating.toFixed(1)} ({currentReviews} reviews)
                  </span>
                </div>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-4xl font-bold text-gray-900">
                    {formatINR(displayPrice)}
                  </span>
                  {hasDiscount && (
                    <>
                      <span className="text-xl text-gray-500 line-through">
                        {formatINR(product.price)}
                      </span>
                      <span className="px-2 py-1 bg-red-500 text-white text-sm font-semibold rounded">
                        -{discountPercent}%
                      </span>
                    </>
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  {product.stock > 0 ? (
                    <span className="text-green-600 font-medium">In Stock ({product.stock} available)</span>
                  ) : (
                    <span className="text-red-600 font-medium">Out of Stock</span>
                  )}
                </p>
              </div>

              {/* Description */}
              <div className="mb-6">
                <p className="text-gray-700 leading-relaxed">{product.description}</p>
              </div>

              {/* Quantity and Add to Cart */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center border border-gray-300 rounded-lg">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-4 py-3 hover:bg-gray-100 transition-colors"
                  >
                    -
                  </button>
                  <span className="px-6 py-3 font-semibold">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    className="px-4 py-3 hover:bg-gray-100 transition-colors"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Add to Cart
                </button>
              </div>

              {/* Request Quote Button */}
              {canRequestQuote && (
                <div className="mb-6">
                  <button
                    onClick={() => {
                      if (!user) {
                        toast.error('Please sign in to request a quote');
                        return;
                      }
                      setIsQuoteDialogOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 transition-colors mb-3"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Request Custom Quote
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mb-6">
                <button
                  type="button"
                  onClick={handleWishlist}
                  disabled={wishlistToggling}
                  aria-pressed={inWishlist}
                  className={`flex items-center justify-center gap-2 px-4 py-2 border rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    inWishlist
                      ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Heart
                    className={`w-5 h-5 ${inWishlist ? 'fill-current' : ''}`}
                  />
                  <span className="text-sm">
                    {wishlistToggling ? '…' : inWishlist ? 'Added to Wishlist' : 'Wishlist'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Share2 className="w-5 h-5" />
                  <span className="text-sm">Share</span>
                </button>
              </div>

              {/* Features */}
              <div className="border-t border-gray-200 pt-6 space-y-4">
                   <div className="flex items-start gap-3">
                     <Truck className="w-5 h-5 text-blue-600 mt-0.5" />
                     <div>
                       <p className="font-medium text-gray-900">Free Shipping</p>
                       <p className="text-sm text-gray-600">On orders over ₹50</p>
                     </div>
                   </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">2 Year Warranty</p>
                    <p className="text-sm text-gray-600">Extended warranty available</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RotateCcw className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">7 Day Returns</p>
                    <p className="text-sm text-gray-600">Easy 7-day return policy</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard
                  key={relatedProduct.id}
                  product={relatedProduct}
                  wishlistCandidates={wishlistPool}
                  wishlistKeySet={wishlistKeySet}
                  onWishlistUpdated={refreshWishlistKeys}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <QuoteRequestDialog 
        isOpen={isQuoteDialogOpen} 
        onClose={() => setIsQuoteDialogOpen(false)}
        products={[{
          productId: product._id || product.id,
          name: product.name,
          quantity: quantity,
          price: displayPrice,
          clientId: (product as any).clientId
        }]}
      />
    </div>
  );
}

