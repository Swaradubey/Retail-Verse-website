import { Link } from 'react-router';
import { ArrowRight, Clock } from 'lucide-react';

export function NovaHomePromotional() {
  return (
    <section className="py-10">
      <div className="max-w-[88rem] mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 lg:p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative">
              <div className="flex items-center gap-2 text-orange-200 text-xs font-bold uppercase tracking-wider mb-2">
                <Clock className="w-3.5 h-3.5" /> Limited Time
              </div>
              <h3 className="text-2xl lg:text-3xl font-extrabold mb-2">Flash Sale</h3>
              <p className="text-orange-100 text-sm mb-4">Get up to 60% off on selected items. Hurry, deals won't last long!</p>
              <Link to="/shop" className="inline-flex items-center gap-2 bg-white text-orange-600 px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-orange-50 transition-colors">
                Shop Sale <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 lg:p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative">
              <h3 className="text-2xl lg:text-3xl font-extrabold mb-2">Free Shipping</h3>
              <p className="text-blue-100 text-sm mb-4">On all orders above $49. Plus, enjoy easy 30-day returns on everything.</p>
              <Link to="/shop" className="inline-flex items-center gap-2 bg-white text-blue-600 px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-50 transition-colors">
                Learn More <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
