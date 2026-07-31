import { Link } from 'react-router';
import { Trash2, ArrowLeft, ShoppingCart, Tag, Shield, Plus, Minus } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatINR';

export function NovaCart() {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartCount } = useCart();

  const shipping = cartTotal > 50 ? 0 : 10;
  const total = cartTotal + (cart.length > 0 ? shipping : 0);

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-10">
      <div className="max-w-[88rem] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]">Shopping Cart</h1>
            <p className="text-sm text-gray-500">{cartCount} {cartCount === 1 ? 'item' : 'items'} in your cart</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {cart.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <ShoppingCart className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Your cart is empty</h3>
                <p className="text-gray-500 text-sm mb-6">Looks like you haven't added anything yet.</p>
                <Link to="/shop" className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors">
                  Start Shopping
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {cart.map((item) => {
                  const itemPrice = item.salePrice || item.price;
                  return (
                    <div key={item.id || item._id} className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-20 h-20 object-cover rounded-lg bg-gray-50 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{item.category}</p>
                        <Link to={`/product/${item.slug || item.id}`} className="text-sm font-semibold text-[#0f172a] hover:text-blue-600 transition-colors truncate block">
                          {item.name}
                        </Link>
                        <p className="text-sm font-bold text-gray-900 mt-1">{formatINR(itemPrice)}</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center border border-gray-200 rounded-lg">
                          <button
                            onClick={() => updateQuantity(item.id || item._id!, item.quantity - 1)}
                            className="p-2 hover:bg-gray-50 text-gray-600 transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-3 text-xs font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id || item._id!, item.quantity + 1)}
                            className="p-2 hover:bg-gray-50 text-gray-600 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-bold text-gray-900 min-w-[4.5rem] text-right">
                          {formatINR(itemPrice * item.quantity)}
                        </span>
                        <button
                          onClick={() => removeFromCart(item.id || item._id!)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
              <h3 className="font-bold text-[#0f172a] mb-4">Order Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatINR(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span className="text-emerald-600 font-medium">{shipping === 0 ? 'Free' : formatINR(shipping)}</span>
                </div>
                <hr className="border-gray-100" />
                <div className="flex justify-between font-bold text-gray-900 text-base">
                  <span>Total</span>
                  <span>{formatINR(total)}</span>
                </div>
              </div>
              {cart.length > 0 ? (
                <Link
                  to="/checkout"
                  className="block text-center w-full bg-blue-600 text-white py-3 rounded-lg mt-5 font-semibold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
                >
                  Proceed to Checkout
                </Link>
              ) : (
                <button disabled className="w-full bg-gray-200 text-gray-400 py-3 rounded-lg mt-5 font-semibold text-sm cursor-not-allowed">
                  Checkout
                </button>
              )}
              <Link to="/shop" className="flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-700 mt-3 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Continue Shopping
              </Link>
              <div className="mt-5 space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Tag className="w-3.5 h-3.5" /> Apply coupon code at checkout
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Shield className="w-3.5 h-3.5" /> Secure checkout with SSL
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
