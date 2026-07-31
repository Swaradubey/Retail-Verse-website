import { Link } from 'react-router';
import { Trash2, ArrowLeft, ShoppingBag, Plus, Minus } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatINR';

export function LuxeCart() {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartCount } = useCart();

  const shipping = cartTotal > 50 ? 0 : 10;
  const total = cartTotal + (cart.length > 0 ? shipping : 0);

  return (
    <div className="min-h-screen bg-[#fcfbf8] pt-28 pb-16">
      <div className="max-w-[88rem] mx-auto px-6">
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-[#1a1a2e] font-bold mb-2">Shopping Bag</h1>
          <p className="text-gray-500">{cartCount} {cartCount === 1 ? 'item' : 'items'} in your bag</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            {cart.length === 0 ? (
              <div className="bg-white p-8 lg:p-12 text-center">
                <div className="w-16 h-16 bg-[#fcfbf8] mx-auto mb-6 flex items-center justify-center">
                  <ShoppingBag className="w-8 h-8 text-gray-300" />
                </div>
                <p className="font-serif text-xl text-[#1a1a2e] mb-4">Your bag is empty</p>
                <p className="text-gray-500 mb-8">Discover our curated collection and find pieces you'll love.</p>
                <Link to="/shop" className="inline-flex items-center gap-2 bg-[#1a1a2e] text-white px-8 py-3 text-sm font-bold uppercase tracking-widest hover:bg-[#c9a96e] transition-all duration-500">
                  Continue Shopping
                </Link>
              </div>
            ) : (
              <div className="bg-white p-6 lg:p-8 divide-y divide-gray-100">
                {cart.map((item) => {
                  const itemPrice = item.salePrice || item.price;
                  return (
                    <div key={item.id || item._id} className="py-6 first:pt-0 last:pb-0 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-24 h-28 object-cover bg-gray-50 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a96e] mb-1">{item.category}</p>
                        <Link to={`/product/${item.slug || item.id}`} className="font-serif text-lg text-[#1a1a2e] font-semibold hover:text-[#c9a96e] transition-colors truncate block">
                          {item.name}
                        </Link>
                        <p className="text-sm font-bold text-gray-900 mt-1">{formatINR(itemPrice)}</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center border border-gray-200">
                          <button
                            onClick={() => updateQuantity(item.id || item._id!, item.quantity - 1)}
                            className="p-2 hover:bg-gray-50 text-gray-600 transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-4 text-xs font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id || item._id!, item.quantity + 1)}
                            className="p-2 hover:bg-gray-50 text-gray-600 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="font-serif text-base font-bold text-[#1a1a2e] min-w-[5rem] text-right">
                          {formatINR(itemPrice * item.quantity)}
                        </span>
                        <button
                          onClick={() => removeFromCart(item.id || item._id!)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white p-8 lg:p-10 sticky top-28">
              <h3 className="font-serif text-xl text-[#1a1a2e] font-bold mb-6">Order Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatINR(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span className="text-emerald-600">{shipping === 0 ? 'Free' : formatINR(shipping)}</span>
                </div>
                <hr className="border-gray-100" />
                <div className="flex justify-between text-[#1a1a2e] font-bold text-base">
                  <span>Total</span>
                  <span>{formatINR(total)}</span>
                </div>
              </div>
              {cart.length > 0 ? (
                <Link
                  to="/checkout"
                  className="block text-center w-full bg-[#1a1a2e] text-white py-4 mt-6 text-sm font-bold uppercase tracking-widest hover:bg-[#c9a96e] transition-all duration-500"
                >
                  Proceed to Checkout
                </Link>
              ) : (
                <button disabled className="w-full bg-gray-200 text-gray-400 py-4 mt-6 text-sm font-bold uppercase tracking-widest cursor-not-allowed">
                  Checkout
                </button>
              )}
              <Link to="/shop" className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-[#1a1a2e] mt-4 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
