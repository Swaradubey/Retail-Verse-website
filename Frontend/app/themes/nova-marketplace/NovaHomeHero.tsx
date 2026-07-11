import { Link } from 'react-router';
import { ArrowRight, Zap, Truck, Shield } from 'lucide-react';

export function NovaHomeHero() {
  return (
    <section className="bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <div className="max-w-[88rem] mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-8 pb-12 lg:pt-12 lg:pb-16">
          <div className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              <Zap className="w-3.5 h-3.5" /> Flash Sale — Up to 60% Off
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#0f172a] leading-[1.1] mb-4">
              Everything You<br />
              <span className="text-blue-600">Need, Delivered</span>
            </h1>
            <p className="text-gray-600 text-lg mb-6 max-w-lg">
              Shop millions of products across categories with free delivery, 
              easy returns, and unbeatable prices. Start saving today!
            </p>
            <div className="flex flex-wrap gap-3 mb-8">
              <Link to="/shop" className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-3.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/25">
                Shop Now <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/shop" className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-800 px-8 py-3.5 rounded-lg font-bold text-sm hover:bg-gray-50 transition-all">
                View Deals
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Truck className="w-4 h-4 text-blue-600" /> Free Delivery</span>
              <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-blue-600" /> 30-Day Returns</span>
              <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-orange-500" /> Same Day Dispatch</span>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 row-span-2">
                <img src="https://images.unsplash.com/photo-1468495244123-6c6c332eeece?q=80&w=600&auto=format&fit=crop" alt="Electronics" className="w-full h-full object-cover" />
                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-bold">Electronics</div>
              </div>
              <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <img src="https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=400&auto=format&fit=crop" alt="Fashion" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <img src="https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=400&auto=format&fit=crop" alt="Groceries" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
