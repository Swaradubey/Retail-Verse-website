import { Heart, ShoppingBag, Truck, ShieldCheck, RotateCcw } from 'lucide-react';

interface ProductDetailProps {
  product: any;
}

export function LuxeProductDetail({ product }: ProductDetailProps) {
  return (
    <div className="min-h-screen bg-[#fcfbf8] pt-28 pb-16">
      <div className="max-w-[88rem] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          <div className="bg-white overflow-hidden">
            <div className="aspect-[4/5]">
              <img
                src={product?.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop'}
                alt={product?.name || 'Product'}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="py-8 lg:py-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#c9a96e] mb-3">
              {product?.category || 'Category'}
            </p>
            <h1 className="font-serif text-3xl lg:text-4xl text-[#1a1a2e] font-bold mb-4">
              {product?.name || 'Product Name'}
            </h1>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-2xl font-bold text-[#1a1a2e]">${product?.price?.toFixed(2) || '0.00'}</span>
              {product?.originalPrice && product.originalPrice > (product.price || 0) && (
                <span className="text-lg text-gray-400 line-through">${product.originalPrice.toFixed(2)}</span>
              )}
            </div>

            <p className="text-gray-600 leading-relaxed mb-8">
              {product?.description || 'A finely crafted piece designed for those who appreciate quality and elegance.'}
            </p>

            <div className="space-y-4 mb-10">
              <button className="w-full bg-[#1a1a2e] text-white py-4 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#c9a96e] transition-all duration-500">
                <ShoppingBag className="w-4 h-4" />
                Add to Bag
              </button>
              <button className="w-full border-2 border-[#1a1a2e] text-[#1a1a2e] py-4 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#1a1a2e] hover:text-white transition-all duration-500">
                <Heart className="w-4 h-4" />
                Add to Wishlist
              </button>
            </div>

            <div className="border-t border-gray-200 pt-8 space-y-4">
              {[
                { icon: Truck, label: 'Free shipping on orders over $200' },
                { icon: ShieldCheck, label: 'Secure checkout with SSL encryption' },
                { icon: RotateCcw, label: '30-day easy returns' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 text-sm text-gray-600">
                  <item.icon className="w-4 h-4 text-[#c9a96e]" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
