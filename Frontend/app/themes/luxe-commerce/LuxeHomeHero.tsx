import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export function LuxeHomeHero() {
  return (
    <section className="relative min-h-[100vh] flex items-center bg-[#fcfbf8] overflow-hidden pt-20">
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-[#c9a96e]/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-[#1a1a2e]/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-[88rem] mx-auto px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.3em] text-[#c9a96e] mb-8">
              Summer 2026 Collection
            </span>
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl xl:text-8xl text-[#1a1a2e] leading-[1.05] mb-8 font-bold">
              Elegance<br />
              <span className="italic font-normal">Redefined</span>
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed max-w-md mb-12">
              Discover our meticulously curated collection where timeless design meets contemporary craftsmanship. Each piece is a testament to enduring beauty.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/shop"
                className="group inline-flex items-center gap-3 bg-[#1a1a2e] text-white px-10 py-4 rounded-none text-sm font-bold uppercase tracking-widest hover:bg-[#c9a96e] transition-all duration-500"
              >
                Explore Collection
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 border-2 border-[#1a1a2e] text-[#1a1a2e] px-10 py-4 rounded-none text-sm font-bold uppercase tracking-widest hover:bg-[#1a1a2e] hover:text-white transition-all duration-500"
              >
                Our Story
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            className="relative"
          >
            <div className="aspect-[3/4] bg-gradient-to-br from-[#e8d5b7] to-[#c9a96e]/30 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=1000&auto=format&fit=crop"
                alt="Luxury lifestyle"
                className="w-full h-full object-cover mix-blend-multiply"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a2e]/30 via-transparent to-transparent" />
            </div>

            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-6 -left-6 bg-white/90 backdrop-blur-md p-6 shadow-xl max-w-[220px]"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#c9a96e] mb-1">New In</p>
              <p className="font-serif text-lg text-[#1a1a2e] font-bold">Artisan Collection</p>
              <p className="text-sm text-gray-500 mt-1">From $245</p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
