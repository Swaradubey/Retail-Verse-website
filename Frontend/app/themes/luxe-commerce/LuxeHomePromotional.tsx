import { Link } from 'react-router';

export function LuxeHomePromotional() {
  return (
    <section className="py-24 lg:py-32 bg-[#fcfbf8]">
      <div className="max-w-[88rem] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="aspect-[4/5] bg-[#e8d5b7]/40 overflow-hidden order-2 lg:order-1">
            <img
              src="https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop"
              alt="Timeless style"
              className="w-full h-full object-cover mix-blend-multiply"
            />
          </div>
          <div className="order-1 lg:order-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#c9a96e] mb-4 block">
              Timeless Style
            </span>
            <h2 className="font-serif text-4xl lg:text-5xl text-[#1a1a2e] font-bold leading-[1.1] mb-6">
              The Art of<br />Mindful Luxury
            </h2>
            <p className="text-gray-600 leading-relaxed mb-8 max-w-md">
              We believe in thoughtful consumption. Every piece in our collection is selected for its quality, 
              craftsmanship, and enduring appeal. Invest in pieces that transcend seasons.
            </p>
            <div className="grid grid-cols-3 gap-8 mb-10">
              {[
                { number: '500+', label: 'Curated Pieces' },
                { number: '50+', label: 'Global Brands' },
                { number: '15K', label: 'Happy Clients' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-serif text-3xl text-[#1a1a2e] font-bold">{stat.number}</p>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 bg-[#1a1a2e] text-white px-8 py-3 text-sm font-bold uppercase tracking-widest hover:bg-[#c9a96e] transition-all duration-500"
            >
              View Collection
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
