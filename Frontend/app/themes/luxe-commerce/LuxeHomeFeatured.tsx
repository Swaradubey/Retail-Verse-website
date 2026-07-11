import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';

const COLLECTIONS = [
  {
    title: 'Ready-to-Wear',
    description: 'Effortless elegance for every occasion',
    image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=600&auto=format&fit=crop',
    href: '/shop',
  },
  {
    title: 'Fine Accessories',
    description: 'The perfect finishing touches',
    image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=600&auto=format&fit=crop',
    href: '/shop',
  },
  {
    title: 'Home & Living',
    description: 'Curated pieces for inspired spaces',
    image: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?q=80&w=600&auto=format&fit=crop',
    href: '/shop',
  },
];

export function LuxeHomeFeatured() {
  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="max-w-[88rem] mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#c9a96e] mb-4 block">
            Curated Collections
          </span>
          <h2 className="font-serif text-4xl lg:text-5xl text-[#1a1a2e] font-bold">
            Discover by Category
          </h2>
          <div className="w-16 h-[2px] bg-[#c9a96e] mx-auto mt-6" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {COLLECTIONS.map((col) => (
            <Link
              key={col.title}
              to={col.href}
              className="group relative overflow-hidden bg-[#fcfbf8]"
            >
              <div className="aspect-[3/4] overflow-hidden">
                <img
                  src={col.image}
                  alt={col.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-8">
                <h3 className="font-serif text-2xl text-white font-bold mb-2">{col.title}</h3>
                <p className="text-white/80 text-sm mb-4">{col.description}</p>
                <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white group-hover:text-[#c9a96e] transition-colors">
                  Shop Now <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
