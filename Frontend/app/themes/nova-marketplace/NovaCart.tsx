import { Link } from 'react-router';
import { Trash2, ArrowLeft, ShoppingCart, Tag, Shield } from 'lucide-react';

export function NovaCart() {
  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-10">
      <div className="max-w-[88rem] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]">Shopping Cart</h1>
            <p className="text-sm text-gray-500">0 items in your cart</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
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
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
              <h3 className="font-bold text-[#0f172a] mb-4">Order Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span className="text-emerald-600 font-medium">Free</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Tax</span>
                  <span>$0.00</span>
                </div>
                <hr className="border-gray-100" />
                <div className="flex justify-between font-bold text-gray-900 text-base">
                  <span>Total</span>
                  <span>$0.00</span>
                </div>
              </div>
              <button disabled className="w-full bg-gray-200 text-gray-400 py-3 rounded-lg mt-5 font-semibold text-sm cursor-not-allowed">
                Checkout
              </button>
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
