import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, ArrowRight, Star, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router';
import { TrustMarquee } from '../components/TrustMarquee';
import { ResourcesSection } from '../components/ResourcesSection';
import { SmartDigitalBusinessSection } from '../components/SmartDigitalBusinessSection';

export function Home() {
  return (
    <div className="flex flex-col gap-0 overflow-hidden bg-[#F8FAFC]">

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-20 lg:pt-10 pb-16 overflow-hidden bg-[#F8FAFC]">
        <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FF6B00] border border-[#FF6B00] text-[#F8FAFC] text-xs font-bold uppercase tracking-widest mb-6 -mt-12">
                <Star className="w-3.5 h-3.5 fill-[#F8FAFC] text-[#F8FAFC]" />
                ★ RETAIL VERSE
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#0B1F3A] leading-[1.05] mb-8">
                Elevate Your <span className="text-[#FF6B00]">Shopping</span> Experience.
              </h1>

              <p className="text-lg sm:text-xl text-[#0B1F3A] leading-relaxed mb-10 max-w-lg font-normal">
                Discover a curated collection of premium products designed for modern lifestyles. Seamlessly shop, track, and manage your orders.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  to="/shop"
                  className="group inline-flex items-center gap-2 rounded-full bg-[#FF6B00] border border-[#FF6B00] px-8 py-4 text-lg font-bold text-[#F8FAFC] transition-all hover:bg-[#FF6B00]/90 hover:-translate-y-0.5"
                >
                  Shop Collection
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  to="/about"
                  className="inline-flex items-center gap-2 rounded-full bg-[#F8FAFC] border-2 border-[#2563EB] px-8 py-4 text-lg font-bold text-[#2563EB] transition-all hover:bg-[#2563EB] hover:text-[#F8FAFC]"
                >
                  Our Story
                </Link>
              </div>

              <div className="mt-12 flex flex-wrap items-center gap-8 border-t border-[#0B1F3A]/20 pt-8">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                  <span className="text-sm font-bold text-[#0B1F3A]">Secure Payments</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#FF6B00]" />
                  <span className="text-sm font-bold text-[#0B1F3A]">Fast Delivery</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="relative z-10 rounded-[2.5rem] overflow-hidden aspect-[4/5] bg-[#F8FAFC] border-2 border-[#0B1F3A]">
                <img
                  src="https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=1000&auto=format&fit=crop"
                  alt="Premium Product"
                  className="w-full h-full object-cover"
                />

                {/* Floating Card */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute bottom-8 right-8 bg-[#F8FAFC] p-4 rounded-2xl border border-[#0B1F3A]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FF6B00] flex items-center justify-center text-[#F8FAFC]">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#2563EB] uppercase tracking-wider">New Arrival</p>
                      <p className="text-sm font-bold text-[#0B1F3A]">Premium Tech Bundle</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Smart Digital Business Platform Section */}
      <SmartDigitalBusinessSection />

      {/* Trust & Features Marquee */}
      <TrustMarquee />

      {/* Resources & Business Insights */}
      <ResourcesSection />
    </div>
  );
}
