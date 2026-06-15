import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, ArrowRight, Star, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router';
import { TrustMarquee } from '../components/TrustMarquee';
import { SellEverywhere } from '../components/SellEverywhere';
import { ResourcesSection } from '../components/ResourcesSection';
import { AnimatedShowcaseSection } from '../components/AnimatedShowcaseSection';
import { products } from '../data/products';

export function Home() {
  // Extract featured products for the showcase section
  const featuredProducts = products.filter(p => p.featured).slice(0, 4).map(p => ({
    id: p.id,
    title: p.name,
    subtitle: p.category,
    image: p.image,
    href: `/product/${p.slug}`
  }));

  return (
    <div className="flex flex-col gap-0 overflow-hidden">

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-20 lg:pt-10 pb-16 overflow-hidden bg-[#FCFBF8]">
        {/* Abstract Background Blobs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-100/40 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-50/50 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4" />

        <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/60 border border-amber-200/50 text-amber-900 text-xs font-bold uppercase tracking-widest mb-6 -mt-12">
                <Star className="w-3 h-3 fill-amber-600 text-amber-600" />
                Retail Verse
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#111111] leading-[1.05] mb-8">
                Elevate Your <span className="bg-gradient-to-r from-amber-600 to-amber-800 bg-clip-text text-transparent">Shopping</span> Experience.
              </h1>

              <p className="text-lg sm:text-xl text-gray-600 leading-relaxed mb-10 max-w-lg">
                Discover a curated collection of premium products designed for modern lifestyles. Seamlessly shop, track, and manage your orders.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  to="/shop"
                  className="group inline-flex items-center gap-2 rounded-full bg-[#111111] px-8 py-4 text-lg font-bold text-white shadow-xl shadow-black/10 transition-all hover:-translate-y-1 hover:bg-black"
                >
                  Shop Collection
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  to="/about"
                  className="inline-flex items-center gap-2 rounded-full bg-white border border-black/5 px-8 py-4 text-lg font-bold text-gray-900 shadow-sm transition-all hover:bg-gray-50"
                >
                  Our Story
                </Link>
              </div>

              <div className="mt-12 flex flex-wrap items-center gap-8 border-t border-black/5 pt-8">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-bold text-gray-600">Secure Payments</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-bold text-gray-600">Fast Delivery</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="relative z-10 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/10 aspect-[4/5] bg-gradient-to-br from-amber-50 to-amber-100/30">
                <img
                  src="https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=1000&auto=format&fit=crop"
                  alt="Premium Product"
                  className="w-full h-full object-cover mix-blend-multiply opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />

                {/* Floating Card */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute bottom-8 right-8 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-white/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">New Arrival</p>
                      <p className="text-sm font-bold text-gray-900">Premium Tech Bundle</p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-amber-400/20 rounded-full blur-2xl" />
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-400/10 rounded-full blur-3xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust & Features Marquee */}
      <TrustMarquee />

      {/* Omni-Channel Section */}
      <SellEverywhere />

      {/* Featured Products Showcase */}
      <AnimatedShowcaseSection
        heading="Curated Premium Collection"
        items={featuredProducts}
      />

      {/* Resources & Business Insights */}
      <ResourcesSection />
    </div>
  );
}
