import React, { useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { Product } from '../types/product';
import { ShoppingCart, Star, ArrowUpRight, Heart, Package2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { wishlistApi } from '../api/wishlist';
import {
  buildWishlistKeyForProduct,
  buildWishlistRemoveParams,
  buildWishlistToggleBody,
} from '../utils/wishlistPayload';
import { productApi, Product as DynamicProduct } from '../api/products';
import { formatINR } from '../utils/formatINR';
import { getFullImageUrl, getProductImageUrl, FALLBACK_IMAGE } from '../utils/imageUrl';

interface ProductCardProps {
  product: Product & { _id?: string };
  /** API-backed products from the shop (improves Mongo id matching for wishlist). */
  wishlistCandidates?: (Product & { _id?: string })[];
  /** Keys from GET /api/wishlist (`mongo:id` or `static:slug`). */
  wishlistKeySet?: Set<string>;
  onWishlistUpdated?: () => void | Promise<void>;
}

export function ProductCard({
  product,
  wishlistCandidates = [],
  wishlistKeySet,
  onWishlistUpdated,
}: ProductCardProps) {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [wishlistBusy, setWishlistBusy] = useState(false);

  const hasOriginalPriceDiscount =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price;
  const hasLegacySalePriceDiscount =
    typeof product.salePrice === 'number' && product.price > product.salePrice;
  const displayPrice = hasLegacySalePriceDiscount
    ? (product.salePrice as number)
    : product.price;
  const displayOriginalPrice = hasOriginalPriceDiscount
    ? product.originalPrice
    : hasLegacySalePriceDiscount
      ? product.price
      : undefined;
  const computedSalePercentage =
    displayOriginalPrice && displayOriginalPrice > displayPrice
      ? Math.round(((displayOriginalPrice - displayPrice) / displayOriginalPrice) * 100)
      : 0;
  const salePercentage = Math.max(0, product.salePercentage ?? computedSalePercentage);
  const isOnSale = Boolean(product.isOnSale) || salePercentage > 0;
  const savingsAmount =
    displayOriginalPrice && displayOriginalPrice > displayPrice
      ? displayOriginalPrice - displayPrice
      : 0;

  const pool = wishlistCandidates.length
    ? wishlistCandidates
    : ([product] as (Product & { _id?: string })[]);
  const key = buildWishlistKeyForProduct(product, pool);
  const inWishlist = !!(user && wishlistKeySet?.has(key));

  const handleAddToCart = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
  };

  const handleWishlist = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error('Please sign in to save items to your wishlist.');
      return;
    }
    let body = buildWishlistToggleBody(product, pool);
    if ('item' in body) {
      try {
        const response = await productApi.getAll();
        if (response.success && Array.isArray(response.data)) {
          const list = response.data.map((p: DynamicProduct) => ({
            id: p._id || product.id,
            _id: p._id,
            name: p.name,
            slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
            price: p.price,
            description: p.description || '',
            category: p.category,
            image: getProductImageUrl(p) || '',
            images: [getProductImageUrl(p)].filter(Boolean),
            stock: p.stock,
            rating: 0,
            reviews: 0,
            sku: p.sku,
            clientId: p.clientId || (p.client as any)?._id
          })) as (Product & { _id?: string })[];
          const retry = buildWishlistToggleBody(product, list);
          if ('productId' in retry) body = retry;
        }
      } catch {
        // keep snapshot body
      }
    }
    const removeParams = buildWishlistRemoveParams(product, pool);

    setWishlistBusy(true);
    try {
      let didMutate = false;
      if (!inWishlist) {
        const res = await wishlistApi.add(body);
        if (res.success) {
          toast.success(res.message || (res.alreadyExists ? 'Already in wishlist' : 'Added to Wishlist'));
          didMutate = true;
        }
      } else {
        const res = await wishlistApi.remove(removeParams);
        if (res.success) {
          toast.success(res.message || 'Removed from wishlist');
          didMutate = true;
        }
      }
      if (didMutate) await onWishlistUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wishlist could not be updated';
      toast.error(msg);
    } finally {
      setWishlistBusy(false);
    }
  };

  return (
    <Link
      to={`/product/${product.slug}`}
      className="group relative block overflow-hidden rounded-3xl border border-black/8 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)]"
    >
      {/* Image */}
      <div className="relative aspect-[4/4.2] overflow-hidden bg-[#f7f7f7] flex items-center justify-center">
        {getProductImageUrl(product) ? (
          <img
            src={getFullImageUrl(getProductImageUrl(product))}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).onerror = null;
              (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
            }}
          />
        ) : (
          <Package2 className="w-12 h-12 text-gray-300" />
        )}

        {/* Top badges */}
        <div className="absolute left-4 top-4 flex flex-col gap-2">
          {isOnSale && salePercentage > 0 && (
            <span className="rounded-full bg-red-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
              {salePercentage}% OFF
            </span>
          )}
          {product.stock === 0 && (
            <span className="rounded-full bg-red-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
              Out of Stock
            </span>
          )}
          {product.stock > 0 && product.stock < 10 && (
            <span className="rounded-full bg-[#111111] px-3 py-1 text-[11px] font-medium text-white/90 shadow-sm">
              Only {product.stock} left
            </span>
          )}
        </div>

        {/* Top right actions */}
        <div className="absolute right-4 top-4 flex gap-2">
          <button
            type="button"
            onClick={handleWishlist}
            disabled={wishlistBusy}
            aria-pressed={inWishlist}
            title={user ? (inWishlist ? 'Remove from wishlist' : 'Add to wishlist') : 'Sign in to use wishlist'}
            className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-transform duration-300 hover:scale-105 disabled:opacity-60 ${
              inWishlist
                ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-white/70 bg-white/90 text-[#111111]'
            }`}
          >
            <Heart className={`h-4 w-4 ${inWishlist ? 'fill-current' : ''}`} />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-[#111111] shadow-sm backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>

        {/* Bottom overlay gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
              {product.category}
            </p>
            {(product.client?.storeName || product.client?.shopName || product.client?.companyName) && (
              <p className="truncate text-[10px] font-medium text-blue-600/80">
                Sold by: {product.client?.storeName || product.client?.shopName || product.client?.companyName}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-full bg-[#f8f8f8] px-2.5 py-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-semibold text-[#111111]">
              {product.rating}
            </span>
            <span className="text-xs text-[#6b7280]">
              ({product.reviews})
            </span>
          </div>
        </div>

        <h3 className="min-h-[3.5rem] text-[1.05rem] font-semibold leading-7 text-[#111111] transition-colors duration-300 group-hover:text-blue-600">
          {product.name}
        </h3>

        <div className="mt-5 flex items-end justify-between gap-4">
           <div className="flex flex-col">
             <div className="flex items-center gap-2">
               <span className="text-xl font-bold tracking-tight text-[#111111]">
                 {formatINR(displayPrice)}
               </span>
               {displayOriginalPrice !== undefined && (
                 <span className="text-sm font-medium text-[#9ca3af] line-through">
                   {formatINR(displayOriginalPrice)}
                 </span>
               )}
             </div>

             {isOnSale && savingsAmount > 0 && (
               <span className="mt-1 text-xs font-medium text-green-600">
                 Save {formatINR(savingsAmount)}
               </span>
             )}
           </div>

          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 active:scale-95 ${
              product.stock === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#111111] text-white hover:scale-105 hover:bg-blue-600'
            }`}
            aria-label={`Add ${product.name} to cart`}
          >
            <ShoppingCart className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </Link>
  );
}
