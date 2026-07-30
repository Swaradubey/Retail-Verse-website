import React, { useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  CreditCard,
  PackageSearch,
  Globe,
  Users,
  BarChart3,
  Barcode,
  Cloud,
  MonitorSmartphone,
  CheckCircle2,
  Check,
  Zap,
  ShieldCheck,
  TrendingUp,
  Printer,
  Smartphone,
  Sparkles,
  ArrowRight,
  ScanLine,
  Receipt,
  Clock,
  Layers,
  Store,
  DollarSign,
  Activity,
  Server,
  Headphones,
  Award
} from 'lucide-react';

interface AnimatedCounterProps {
  end: number;
  suffix?: string;
  duration?: number;
}

function AnimatedCounter({ end, suffix = '', duration = 2 }: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      // Ease out expo
      const currentCount = Math.floor((1 - Math.pow(1 - progress, 3)) * end);
      setCount(currentCount);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [isInView, end, duration]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}{suffix}
    </span>
  );
}

export function SmartDigitalBusinessSection() {
  const featureCards = [
    {
      id: 'pos-billing',
      icon: CreditCard,
      title: 'POS Billing',
      description: 'Fast GST billing with barcode and thermal printer support.',
      gradient: 'from-[#0B5FFF]/10 to-blue-50',
      iconBg: 'bg-[#0B5FFF]',
      accentColor: '#0B5FFF',
      tag: 'Ultra-Fast'
    },
    {
      id: 'inventory-mgmt',
      icon: PackageSearch,
      title: 'Inventory Management',
      description: 'Track stock, low inventory alerts, and product management.',
      gradient: 'from-amber-500/10 to-orange-50',
      iconBg: 'bg-[#FF8A00]',
      accentColor: '#FF8A00',
      tag: 'Real-Time'
    },
    {
      id: 'ecommerce-web',
      icon: Globe,
      title: 'Ecommerce Website',
      description: 'Launch your own online store with mobile-friendly design.',
      gradient: 'from-blue-600/10 to-cyan-50',
      iconBg: 'bg-blue-600',
      accentColor: '#2563EB',
      tag: '1-Click Launch'
    },
    {
      id: 'customer-mgmt',
      icon: Users,
      title: 'Customer Management',
      description: 'Manage customer profiles, loyalty, and purchase history.',
      gradient: 'from-emerald-500/10 to-green-50',
      iconBg: 'bg-emerald-600',
      accentColor: '#10B981',
      tag: 'Loyalty Boost'
    },
    {
      id: 'reports-analytics',
      icon: BarChart3,
      title: 'Reports & Analytics',
      description: 'Sales reports, profit tracking, and business insights.',
      gradient: 'from-purple-500/10 to-indigo-50',
      iconBg: 'bg-purple-600',
      accentColor: '#9333EA',
      tag: 'AI Insights'
    },
    {
      id: 'barcode-printing',
      icon: Barcode,
      title: 'Barcode & Label Printing',
      description: 'Generate and print barcode labels easily.',
      gradient: 'from-rose-500/10 to-red-50',
      iconBg: 'bg-rose-600',
      accentColor: '#E11D48',
      tag: 'Custom Labels'
    },
    {
      id: 'cloud-backup',
      icon: Cloud,
      title: 'Cloud Backup',
      description: 'Secure automatic cloud backup with real-time sync.',
      gradient: 'from-sky-500/10 to-blue-50',
      iconBg: 'bg-sky-500',
      accentColor: '#0EA5E9',
      tag: '99.9% Reliable'
    },
    {
      id: 'multi-device',
      icon: MonitorSmartphone,
      title: 'Multi-Device Access',
      description: 'Manage your business from desktop, tablet, and mobile.',
      gradient: 'from-indigo-500/10 to-violet-50',
      iconBg: 'bg-indigo-600',
      accentColor: '#4F46E5',
      tag: 'Cross-Platform'
    }
  ];

  const bannerBadges = [
    'POS Software',
    'Inventory Management',
    'Ecommerce Website',
    'GST Billing',
    'Barcode System',
    'Cloud Backup',
    'Business Reports',
    'Customer Management',
    'Payment Integration',
    'Mobile App',
    'Technical Support',
    'Staff Management'
  ];

  const stats = [
    { value: 50000, suffix: '+', label: 'Products Managed', icon: Layers, desc: 'Across retail stores' },
    { value: 10000, suffix: '+', label: 'Businesses', icon: Store, desc: 'Trusting Retail Verse' },
    { value: 99.9, suffix: '%', label: 'Uptime', isFloat: true, icon: Server, desc: 'High availability SLA' },
    { value: 24, suffix: '×7', label: 'Customer Support', isRaw: true, icon: Headphones, desc: 'Always ready to help' }
  ];

  const benefits = [
    { title: 'Faster Billing', desc: 'Process checkout in seconds with barcode scanning', icon: Zap, bg: 'bg-amber-500/10 text-[#FF8A00]' },
    { title: 'Increase Sales', desc: 'Connect online and offline store inventory seamlessly', icon: TrendingUp, bg: 'bg-[#0B5FFF]/10 text-[#0B5FFF]' },
    { title: 'Reduce Manual Work', desc: 'Automate stock updates and GST invoice creation', icon: Activity, bg: 'bg-purple-500/10 text-purple-600' },
    { title: 'Accurate Inventory', desc: 'Eliminate stock discrepancies with instant sync', icon: ShieldCheck, bg: 'bg-emerald-500/10 text-emerald-600' },
    { title: 'Secure Cloud Storage', desc: 'Bank-grade encryption for all business data', icon: Cloud, bg: 'bg-sky-500/10 text-sky-600' },
    { title: 'Easy To Use', desc: 'Zero technical experience required to get started', icon: Award, bg: 'bg-rose-500/10 text-rose-600' }
  ];

  return (
    <section className="relative w-full bg-gradient-to-b from-[#FAFBFD] via-white to-[#F4F7FF] py-20 lg:py-28 overflow-hidden text-gray-900 border-t border-gray-100">
      {/* Background Decorative Glows */}
      <div className="pointer-events-none absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-[#0B5FFF]/10 via-[#FF8A00]/5 to-transparent rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute bottom-20 right-0 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[120px]" />

      <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">

        {/* ========================================================================= */}
        {/* SECTION HEADER */}
        {/* ========================================================================= */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0B5FFF]/10 border border-[#0B5FFF]/20 text-[#0B5FFF] text-xs sm:text-sm font-bold uppercase tracking-wider mb-5 shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-[#0B5FFF]" />
            Smart Digital Business Platform
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 leading-[1.15]"
          >
            Transform Your Store Into a{' '}
            <span className="bg-gradient-to-r from-[#0B5FFF] via-[#0048D9] to-[#FF8A00] bg-clip-text text-transparent">
              Smart Digital Business
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-base sm:text-lg lg:text-xl text-gray-600 leading-relaxed font-normal"
          >
            Everything you need to run your retail business from one powerful platform. Manage POS billing, inventory, website, online orders, customers, analytics, and payments with Retail Verse.
          </motion.p>
        </div>

        {/* ========================================================================= */}
        {/* TWO-COLUMN LAYOUT: 8 FEATURE CARDS (LEFT) & MOCKUP SHOWCASE (RIGHT) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start mb-24 sm:mb-32">

          {/* LEFT SIDE: Responsive Grid of 8 Premium Feature Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {featureCards.map((card, idx) => {
              const IconComp = card.icon;
              return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.06 }}
                  whileHover={{ y: -6, transition: { duration: 0.2 } }}
                  className="group relative p-6 rounded-[20px] bg-white border border-gray-100 shadow-md shadow-slate-200/50 hover:shadow-xl hover:shadow-blue-500/10 hover:border-[#0B5FFF]/30 transition-all duration-300 flex flex-col justify-between overflow-hidden"
                >
                  {/* Subtle Card Background Accent */}
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${card.gradient} rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

                  <div>
                    {/* Header Row: Icon & Pill Tag */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center text-white shadow-md shadow-gray-300/50 group-hover:scale-110 transition-transform duration-300`}>
                        <IconComp className="w-6 h-6" />
                      </div>
                      <span className="text-[11px] font-bold text-gray-500 bg-gray-100 group-hover:bg-[#0B5FFF]/10 group-hover:text-[#0B5FFF] px-2.5 py-1 rounded-full transition-colors duration-300">
                        {card.tag}
                      </span>
                    </div>

                    {/* Card Content */}
                    <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-[#0B5FFF] transition-colors duration-200">
                      {card.title}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {card.description}
                    </p>
                  </div>

                  {/* Card Bottom Indicator */}
                  <div className="mt-4 pt-3 border-t border-gray-50 flex items-center text-xs font-semibold text-[#0B5FFF] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span>Learn more</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-1" />
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* RIGHT SIDE: Premium Retail Eco-System SaaS Mockup */}
          <div className="lg:col-span-5 relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="sticky top-28 bg-gradient-to-br from-slate-900 via-slate-850 to-blue-950 p-6 sm:p-8 rounded-[24px] shadow-2xl border border-slate-800 text-white overflow-hidden"
            >
              {/* Top Mockup Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="ml-2 text-xs font-semibold text-slate-400">Retail Verse OS v4.2</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    POS Active
                  </span>
                </div>
              </div>

              {/* Central POS Dashboard Mockup View */}
              <div className="space-y-4">

                {/* Main Billing Banner Card */}
                <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/80 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Live POS Billing Station</p>
                      <p className="text-lg font-bold text-white">Store #01 - Main Counter</p>
                    </div>
                    <div className="px-3 py-1 bg-[#0B5FFF] text-white text-xs font-bold rounded-lg shadow-md">
                      GST Active
                    </div>
                  </div>

                  {/* Cart Items Mock Row */}
                  <div className="space-y-2 bg-slate-900/90 p-3 rounded-lg border border-slate-800 text-xs font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span>Wireless Barcode Scanner x1</span>
                      <span className="font-bold text-white">$129.00</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Thermal Receipt Roll (Pack of 10)</span>
                      <span className="font-bold text-white">$24.50</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Premium Smart POS Stand</span>
                      <span className="font-bold text-white">$89.00</span>
                    </div>
                    <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-sans font-bold text-emerald-400">
                      <span>Total Invoice (Incl. Tax)</span>
                      <span>$242.50</span>
                    </div>
                  </div>
                </div>

                {/* Grid of Interactive Hardware Badges */}
                <div className="grid grid-cols-2 gap-3">

                  {/* Floating Item 1: Barcode Scanner */}
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 flex items-center gap-3 shadow-md"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                      <ScanLine className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">Barcode Scanner</p>
                      <p className="text-[10px] text-emerald-400 font-medium">Ready (USB/BT)</p>
                    </div>
                  </motion.div>

                  {/* Floating Item 2: Receipt Printer */}
                  <motion.div
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 flex items-center gap-3 shadow-md"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-[#FF8A00] flex items-center justify-center shrink-0">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">Receipt Printer</p>
                      <p className="text-[10px] text-slate-400 font-medium">80mm Thermal</p>
                    </div>
                  </motion.div>

                  {/* Floating Item 3: Barcode Label Printer */}
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 flex items-center gap-3 shadow-md"
                  >
                    <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                      <Printer className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">Label Printer</p>
                      <p className="text-[10px] text-slate-400 font-medium">Auto-Cut</p>
                    </div>
                  </motion.div>

                  {/* Floating Item 4: Cash Drawer */}
                  <motion.div
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 flex items-center gap-3 shadow-md"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">Cash Drawer</p>
                      <p className="text-[10px] text-emerald-400 font-medium">Auto-Trigger</p>
                    </div>
                  </motion.div>
                </div>

                {/* Floating Mobile App Preview Card */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="mt-4 p-4 rounded-xl bg-gradient-to-r from-[#0B5FFF]/20 to-purple-600/20 border border-[#0B5FFF]/40 flex items-center justify-between shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0B5FFF] text-white flex items-center justify-center shadow-md">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Mobile App Preview</p>
                      <p className="text-[11px] text-slate-300">iOS & Android Real-Time Sync</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-white text-[#0B5FFF] text-xs font-bold rounded-lg shadow">
                    Live
                  </span>
                </motion.div>

              </div>
            </motion.div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* PREMIUM GRADIENT FEATURE BANNER */}
        {/* ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative rounded-[24px] bg-gradient-to-r from-[#0B5FFF] via-[#0549D8] to-[#04339B] p-8 sm:p-12 text-white shadow-2xl overflow-hidden mb-24 sm:mb-32"
        >
          {/* Background Pattern Effects */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/10 rounded-full blur-[90px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#FF8A00]/20 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <span className="inline-block px-4 py-1 rounded-full bg-white/15 text-white text-xs font-bold uppercase tracking-widest mb-4 border border-white/20">
              All-In-One Solution
            </span>

            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight mb-8">
              Everything Included In One Powerful Solution
            </h3>

            {/* 12 Feature Badges Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 text-left">
              {bannerBadges.map((badge, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-xs sm:text-sm font-semibold hover:bg-white/20 transition-all duration-200"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-400/40">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <span className="text-white drop-shadow-sm">{badge}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ========================================================================= */}
        {/* ANIMATED STATISTICS SECTION */}
        {/* ========================================================================= */}
        <div className="mb-24 sm:mb-32">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
              Trusted by Growing Retailers Nationwide
            </h3>
            <p className="mt-2 text-gray-600 text-sm sm:text-base">
              Proven performance and reliability for modern businesses of all sizes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, idx) => {
              const IconComponent = stat.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="relative p-6 sm:p-8 rounded-[20px] bg-white border border-gray-100 shadow-xl shadow-slate-200/60 text-center flex flex-col items-center justify-center group hover:border-[#0B5FFF]/40 hover:shadow-2xl transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#0B5FFF]/10 text-[#0B5FFF] flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-[#0B5FFF] group-hover:text-white transition-all duration-300">
                    <IconComponent className="w-6 h-6" />
                  </div>

                  <div className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-1">
                    {stat.isRaw ? (
                      <span>24×7</span>
                    ) : stat.isFloat ? (
                      <span>99.9%</span>
                    ) : (
                      <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                    )}
                  </div>

                  <p className="text-base font-bold text-gray-800 mt-1">{stat.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{stat.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BENEFITS ROW WITH ICON CARDS */}
        {/* ========================================================================= */}
        <div className="mb-24 sm:mb-32">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-[#FF8A00] font-bold text-xs uppercase tracking-widest">Key Advantages</span>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">
              Why Retailers Choose Smart Digital Business
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit, idx) => {
              const IconComp = benefit.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.08 }}
                  whileHover={{ y: -4 }}
                  className="p-6 rounded-[20px] bg-white border border-gray-100 shadow-md shadow-gray-200/50 hover:shadow-xl hover:border-emerald-500/30 transition-all duration-300 flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
                      <span>{benefit.title}</span>
                    </h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{benefit.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* FULL-WIDTH CALL-TO-ACTION (CTA) SECTION */}
        {/* ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative rounded-[28px] bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-10 sm:p-16 text-center text-white shadow-2xl overflow-hidden border border-slate-800"
        >
          {/* Subtle Glow Spheres */}
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-96 h-96 bg-[#0B5FFF]/30 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-96 h-96 bg-[#FF8A00]/20 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-6 border border-emerald-500/30">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              Instant Setup & 14-Day Free Trial
            </span>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight mb-6">
              Ready to Digitize Your Business?
            </h2>

            <p className="text-base sm:text-lg lg:text-xl text-slate-300 mb-10 leading-relaxed max-w-2xl mx-auto font-normal">
              Join thousands of retailers who trust Retail Verse to manage their business efficiently.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-[#0B5FFF] hover:bg-[#0048D9] text-white text-base font-bold shadow-xl shadow-blue-600/30 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <span>Get Started Today</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                type="button"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-base font-bold border border-white/20 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <span>Book Free Demo</span>
              </button>
            </div>

            <p className="mt-6 text-xs text-slate-400">
              No credit card required • Instant onboarding • Cancel anytime
            </p>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
