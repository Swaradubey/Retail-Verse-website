import { Link } from 'react-router';
import { Heart, ShoppingBag } from 'lucide-react';

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
}

export function LuxeProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/product/${product.slug || product._id}`} className="group block">
      <div className="relative bg-[#fcfbf8] overflow-hidden mb-4">
        <div className="aspect-[3/4] overflow-hidden">
          <img
            src={product.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600&auto=format&fit=crop'}
            alt={product.name || 'Product'}
            className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105"
          />
        </div>
        {product.isOnSale && (
          <span className="absolute top-4 left-4 bg-[#c9a96e] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5">
            -{product.salePercentage || Math.round((1 - (product.price || 0) / (product.originalPrice || 1)) * 100)}%
          </span>
        )}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button className="w-10 h-10 bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors" aria-label="Add to wishlist">
            <Heart className="w-4 h-4 text-[#1a1a2e]" />
          </button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <button className="w-full bg-[#1a1a2e] text-white text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:bg-[#c9a96e] transition-colors">
            <ShoppingBag className="w-3.5 h-3.5" />
            Quick Add
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">{product.category || 'Category'}</p>
        <h3 className="text-sm font-medium text-[#1a1a2e] group-hover:text-[#c9a96e] transition-colors">{product.name || 'Product Name'}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#1a1a2e]">${product.price?.toFixed(2) || '0.00'}</span>
          {product.originalPrice && product.originalPrice > (product.price || 0) && (
            <span className="text-xs text-gray-400 line-through">${product.originalPrice.toFixed(2)}</span>
          )}
        </div>
        {product.rating && (
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`text-xs ${i < Math.round(product.rating || 0) ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
