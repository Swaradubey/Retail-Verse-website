import { LuxeProductCard } from './LuxeProductCard';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

interface CollectionProps {
  title: string;
  products: any[];
}

export function LuxeCollection({ title, products }: CollectionProps) {
  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="max-w-[88rem] mx-auto px-6">
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#c9a96e] mb-3 block">
              Curated Selection
            </span>
            <h2 className="font-serif text-3xl lg:text-4xl text-[#1a1a2e] font-bold">{title}</h2>
          </div>
          <Link to="/shop" className="hidden md:flex items-center gap-2 text-sm font-medium text-[#1a1a2e] hover:text-[#c9a96e] transition-colors">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {products.map((product: any, i: number) => (
            <LuxeProductCard key={product._id || i} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
