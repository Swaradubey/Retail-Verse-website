import { Link } from 'react-router';
import { Trash2, ArrowLeft, ShoppingBag } from 'lucide-react';

export function LuxeCart() {
  return (
    <div className="min-h-screen bg-[#fcfbf8] pt-28 pb-16">
      <div className="max-w-[88rem] mx-auto px-6">
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-[#1a1a2e] font-bold mb-2">Shopping Bag</h1>
          <p className="text-gray-500">0 items in your bag</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
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
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white p-8 lg:p-10 sticky top-28">
              <h3 className="font-serif text-xl text-[#1a1a2e] font-bold mb-6">Order Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span className="text-emerald-600">Free</span>
                </div>
                <hr className="border-gray-100" />
                <div className="flex justify-between text-[#1a1a2e] font-bold text-base">
                  <span>Total</span>
                  <span>$0.00</span>
                </div>
              </div>
              <button disabled className="w-full bg-gray-200 text-gray-400 py-4 mt-6 text-sm font-bold uppercase tracking-widest cursor-not-allowed">
                Checkout
              </button>
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
