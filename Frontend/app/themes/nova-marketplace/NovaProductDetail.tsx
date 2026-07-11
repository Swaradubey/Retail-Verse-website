import { ShoppingCart, Heart, Truck, ShieldCheck, RotateCcw, Star, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

interface ProductDetailProps {
  product: any;
}

export function NovaProductDetail({ product }: ProductDetailProps) {
  const [qty, setQty] = useState(1);

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-10">
      <div className="max-w-[88rem] mx-auto px-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            <div className="bg-gray-50 p-6 lg:p-10">
              <div className="aspect-square rounded-xl overflow-hidden bg-white">
                <img
                  src={product?.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop'}
                  alt={product?.name || 'Product'}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="p-6 lg:p-10 flex flex-col">
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
                  {product?.category || 'Category'}
                </p>
                <h1 className="text-2xl lg:text-3xl font-bold text-[#0f172a] mb-3">
                  {product?.name || 'Product Name'}
                </h1>
                {product?.rating && (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className={`text-sm ${i < Math.round(product.rating) ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">{product.numReviews || 0} reviews</span>
                  </div>
                )}
                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-3xl font-bold text-[#0f172a]">${product?.price?.toFixed(2) || '0.00'}</span>
                  {product?.originalPrice && product.originalPrice > (product.price || 0) && (
                    <>
                      <span className="text-lg text-gray-400 line-through">${product.originalPrice.toFixed(2)}</span>
                      <span className="text-sm font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">
                        Save ${(product.originalPrice - (product.price || 0)).toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  {product?.description || 'High-quality product designed for modern living.'}
                </p>
              </div>

              <div className="mt-auto space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center border border-gray-300 rounded-lg">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-2.5 hover:bg-gray-50 transition-colors"><Minus className="w-4 h-4" /></button>
                    <span className="px-4 font-semibold text-sm min-w-[2rem] text-center">{qty}</span>
                    <button onClick={() => setQty(qty + 1)} className="p-2.5 hover:bg-gray-50 transition-colors"><Plus className="w-4 h-4" /></button>
                  </div>
                  <span className="text-xs text-gray-500">In Stock</span>
                </div>

                <div className="flex gap-3">
                  <button className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25">
                    <ShoppingCart className="w-4 h-4" /> Add to Cart
                  </button>
                  <button className="w-12 h-12 border border-gray-300 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors">
                    <Heart className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-2">
                  {[
                    { icon: Truck, label: 'Free delivery on orders over $49' },
                    { icon: ShieldCheck, label: 'Secure payment with SSL encryption' },
                    { icon: RotateCcw, label: '30-day easy return policy' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-xs text-gray-500">
                      <item.icon className="w-3.5 h-3.5 text-gray-400" />
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
