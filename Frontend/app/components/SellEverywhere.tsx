import React, { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import {
  ArrowRight,
  Instagram,
  Facebook,
  ShoppingBag,
  Search,
  MessageCircle,
  Video,
  CheckCircle2,
  Globe,
  Zap
} from 'lucide-react';
import { Link } from 'react-router';

const platformIcons = [
  { icon: Instagram, color: 'bg-[#E1306C]', label: 'Instagram', delay: 0 },
  { icon: ShoppingBag, color: 'bg-[#FF9900]', label: 'Amazon', delay: 0.2 },
  { icon: Facebook, color: 'bg-[#1877F2]', label: 'Facebook', delay: 0.1 },
  { icon: Search, color: 'bg-[#4285F4]', label: 'Google', delay: 0.3 },
  { icon: MessageCircle, color: 'bg-[#25D366]', label: 'WhatsApp', delay: 0.15 },
  { icon: Video, color: 'bg-[#000000]', label: 'TikTok', delay: 0.25 },
];

export function SellEverywhere() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-10% 0px" });

  const fadeUp: any = {
    hidden: { opacity: 0, y: 40 },
    visible: (delay: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        delay,
        ease: [0.21, 0.47, 0.32, 0.98]
      }
    })
  };

  const floatingAnimation: any = {
    initial: { y: 0 },
    animate: (delay: number = 0) => ({
      y: [0, -12, 0],
      transition: {
        duration: 4,
        repeat: Infinity,
        repeatType: "reverse",
        ease: "easeInOut",
        delay
      }
    })
  };

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden py-24 sm:py-32 lg:py-40 
      bg-gradient-to-br from-[#faf7f2] via-[#f8f1e4] to-[#f3e2c2]"
    >

      {/* 🔥 PREMIUM GOLD BACKGROUND */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -right-20 h-[500px] w-[500px] rounded-full bg-[#C4973F]/20 blur-[120px]" />
        <div className="absolute bottom-1/4 -left-20 h-[500px] w-[500px] rounded-full bg-[#e6c98a]/20 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.02] [background-image:radial-gradient(#000_1px,transparent_1px)] [background-size:40px_40px]" />
      </div>

      <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-24">

          {/* LEFT CONTENT */}
          <div className="max-w-2xl order-2 lg:order-1">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate={isInView ? "visible" : "hidden"}
              custom={0}
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-4 py-1.5 backdrop-blur-sm shadow-sm">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/50">
                  Omni-Channel Commerce
                </span>
              </div>

              <h2 className="text-4xl font-bold tracking-tight text-[#111111] sm:text-5xl lg:text-7xl lg:leading-[1.05]">
                Sell Everywhere. <br />
                <span className="text-black/40">Managed in One Place.</span>
              </h2>

              <p className="mt-8 text-lg leading-8 text-[#5f5f5f] sm:text-xl">
                Scale your brand across social platforms, marketplaces, and messaging apps.
                Keep your inventory, orders, and pricing perfectly synchronized everywhere you sell.
              </p>

              {/* FEATURES */}
              <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {[
                  { title: "Centralized Inventory", desc: "Never oversell with real-time sync." },
                  { title: "Unified Orders", desc: "All channel sales in one dashboard." },
                  { title: "Multi-Currency", desc: "Sell globally with local pricing." },
                  { title: "Scale Faster", desc: "Connect new channels in minutes." }
                ].map((feature, idx) => (
                  <motion.div
                    key={idx}
                    variants={fadeUp}
                    custom={0.2 + idx * 0.1}
                    className="flex gap-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-black/5 shadow-sm">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#111111]">{feature.title}</h4>
                      <p className="text-sm text-[#5f5f5f]">{feature.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* BUTTONS */}
              <motion.div
                variants={fadeUp}
                custom={0.6}
                className="mt-12 flex flex-col sm:flex-row items-center gap-4"
              >
                <Link
                  to="/shop"
                  className="group relative flex w-full sm:w-auto items-center justify-center gap-3 overflow-hidden rounded-full bg-[#111111] px-10 py-5 text-sm font-bold text-white shadow-2xl transition-all duration-300 hover:scale-[1.02]"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  to="/contact"
                  className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-black/10 px-10 py-5 text-sm font-bold text-[#111111] hover:bg-black/5"
                >
                  View demo
                </Link>
              </motion.div>
            </motion.div>
          </div>

          {/* RIGHT SIDE VISUAL */}
          <div className="relative flex items-center justify-center order-1 lg:order-2 py-12 lg:py-0">
            <div className="relative h-[480px] w-full max-w-[320px] sm:h-[600px] sm:max-w-[400px] lg:h-[700px] lg:max-w-none flex items-center justify-center">
              
              {/* MAIN DEVICE MOCKUP */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
                animate={isInView ? { opacity: 1, scale: 1, rotateY: 0 } : {}}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="relative z-20 w-[260px] h-[530px] sm:w-[300px] sm:h-[610px] lg:w-[320px] lg:h-[650px]
                rounded-[3rem] border-[12px] border-[#111111] bg-[#111111] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)]"
              >
                {/* SCREEN CONTENT */}
                <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-white">
                  {/* PHONE TOP BAR */}
                  <div className="absolute top-0 left-0 right-0 z-30 h-8 flex items-center justify-between px-8 pt-2">
                    <span className="text-[10px] font-bold">9:41</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-4 rounded-[1px] border border-black/20 relative">
                        <div className="absolute top-0.5 left-0.5 bottom-0.5 right-1.5 bg-black rounded-[0.5px]" />
                      </div>
                    </div>
                  </div>

                  {/* DYNAMIC ISLAND */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 h-6 w-20 rounded-full bg-black" />

                  {/* APP UI MOCKUP */}
                  <div className="h-full w-full flex flex-col pt-12">
                    <div className="px-5 py-4 flex items-center justify-between border-b border-black/5">
                      <div className="h-4 w-24 rounded-full bg-black/5" />
                      <div className="h-8 w-8 rounded-full bg-[#C4973F]/20" />
                    </div>
                    <div className="flex-1 overflow-hidden p-5">
                      <div className="aspect-[4/5] w-full rounded-2xl bg-[#faf7f2] overflow-hidden mb-4 shadow-inner">
                        <img 
                          src="https://images.unsplash.com/photo-1741061961703-0739f3454314?auto=format&fit=crop&q=80&w=800"
                          alt="Product Preview"
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          width="800"
                          height="1000"
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="h-5 w-3/4 rounded-full bg-black/10" />
                        <div className="h-4 w-1/2 rounded-full bg-black/5" />
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="h-10 rounded-xl bg-[#C4973F] shadow-lg shadow-[#C4973F]/20" />
                          <div className="h-10 rounded-xl border border-black/10" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PREMIUM GLOW EFFECT */}
                <div className="absolute -inset-4 z-10 rounded-[3.5rem] bg-gradient-to-tr from-[#C4973F]/30 to-transparent blur-2xl opacity-50" />
              </motion.div>

              {/* FLOATING PLATFORM ICONS */}
              {platformIcons.map((platform, idx) => (
                <motion.div
                  key={platform.label}
                  variants={floatingAnimation}
                  initial="initial"
                  animate="animate"
                  custom={platform.delay}
                  className={`absolute z-30 hidden sm:flex h-14 w-14 lg:h-16 lg:w-16 items-center justify-center rounded-2xl shadow-2xl backdrop-blur-md 
                    ${platform.color} border border-white/20`}
                  style={{
                    top: idx === 0 ? '10%' : idx === 1 ? '45%' : idx === 2 ? '75%' : idx === 3 ? '15%' : idx === 4 ? '55%' : '82%',
                    left: idx < 3 ? '-10%' : 'auto',
                    right: idx >= 3 ? '-10%' : 'auto',
                  }}
                >
                  <platform.icon className="h-6 w-6 lg:h-7 lg:w-7 text-white" />
                  
                  {/* LABEL (DESKTOP ONLY) */}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    {platform.label}
                  </div>
                </motion.div>
              ))}

              {/* MOBILE-ONLY ICONS (SIMPLIFIED & CENTERED) */}
              <div className="absolute -bottom-8 left-0 right-0 flex sm:hidden items-center justify-center gap-4 z-30">
                {platformIcons.slice(0, 4).map((platform) => (
                  <div 
                    key={platform.label}
                    className={`h-10 w-10 flex items-center justify-center rounded-xl shadow-lg ${platform.color}`}
                  >
                    <platform.icon className="h-5 w-5 text-white" />
                  </div>
                ))}
              </div>

              {/* GLASS ACTIVITY CARDS */}
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.8, delay: 0.8 }}
                className="absolute right-[-40px] top-[30%] z-40 hidden xl:flex w-64 items-start gap-4 rounded-3xl border border-white/40 bg-white/60 p-5 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h5 className="font-bold text-[#111111] text-sm">Inventory Synced</h5>
                  <p className="text-xs text-[#5f5f5f] mt-1">Real-time update across all 12 connected channels.</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -40 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.8, delay: 1 }}
                className="absolute left-[-60px] bottom-[20%] z-40 hidden xl:flex w-64 items-start gap-4 rounded-3xl border border-white/40 bg-white/60 p-5 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF9900] shadow-lg shadow-[#FF9900]/30">
                  <ShoppingBag className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h5 className="font-bold text-[#111111] text-sm">New Sale: Amazon</h5>
                  <p className="text-xs text-[#5f5f5f] mt-1">Flagship Smartphone Pro sold in United Kingdom.</p>
                </div>
              </motion.div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}