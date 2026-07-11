import { Link } from 'react-router';
import { ShoppingCart, Star, Heart } from 'lucide-react';

interface Product {
  _id?: string;
  name?: string;
  slug?: string;
  price?: number;
  originalPrice?: number;
  image?: string;
  category?: string;
  isOnSale?: boolean;
  salePercentage?: number;
  rating?: number;
  numReviews?: number;
  stock?: number;
}

export function NovaProductCard({ product }: { product: Product }) {
  const outOfStock = product.stock !== undefined && product.stock <= 0;

  return (
    <div className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-300">
      <Link to={`/product/${product.slug || product._id}`} className="block relative aspect-square bg-gray-50 overflow-hidden">
        <img
          src={product.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600&auto=format&fit=crop'}
          alt={product.name || 'Product'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {product.isOnSale && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
            -{product.salePercentage || Math.round((1 - (product.price || 0) / (product.originalPrice || 1)) * 100)}%
          </span>
        )}
        {outOfStock && (
          <span className="absolute top-2 right-2 bg-gray-900/80 text-white text-[10px] font-bold px-2 py-0.5 rounded">
            Out of Stock
          </span>
        )}
        <button className="absolute top-2 right-2 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white shadow-sm" aria-label="Wishlist">
          <Heart className="w-4 h-4 text-gray-600" />
        </button>
      </Link>
      <div className="p-4">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{product.category || 'General'}</p>
        <Link to={`/product/${product.slug || product._id}`} className="block text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors mb-2 line-clamp-2">
          {product.name || 'Product Name'}
        </Link>
        <div className="flex items-center gap-1 mb-2">
          <div className="flex items-center">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`text-xs ${i < Math.round(product.rating || 0) ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
            ))}
          </div>
          {product.numReviews !== undefined && (
            <span className="text-[10px] text-gray-400">({product.numReviews})</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-gray-900">${product.price?.toFixed(2) || '0.00'}</span>
            {product.originalPrice && product.originalPrice > (product.price || 0) && (
              <span className="text-xs text-gray-400 line-through">${product.originalPrice.toFixed(2)}</span>
            )}
          </div>
          <button disabled={outOfStock} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${outOfStock ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`} aria-label="Add to cart">
            <ShoppingCart className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
