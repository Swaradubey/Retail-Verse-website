import { NovaProductCard } from './NovaProductCard';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';

interface CollectionProps {
  title: string;
  products: any[];
}

export function NovaCollection({ title, products }: CollectionProps) {
  return (
    <section className="py-8">
      <div className="max-w-[88rem] mx-auto px-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-[#0f172a]">{title}</h2>
          <Link to="/shop" className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {products.map((product: any, i: number) => (
            <NovaProductCard key={product._id || i} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
