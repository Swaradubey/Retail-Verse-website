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
      iconBg: 'bg-[#2563EB]',
      tagBg: 'bg-[#2563EB]/10 text-[#2563EB]',
      tag: 'Ultra-Fast'
    },
    {
      id: 'inventory-mgmt',
      icon: PackageSearch,
      title: 'Inventory Management',
      description: 'Track stock, low inventory alerts, and product management.',
      iconBg: 'bg-[#FF6B00]',
      tagBg: 'bg-[#FF6B00]/10 text-[#FF6B00]',
      tag: 'Real-Time'
    },
    {
      id: 'ecommerce-web',
      icon: Globe,
      title: 'Ecommerce Website',
      description: 'Launch your own online store with mobile-friendly design.',
      iconBg: 'bg-[#2563EB]',
      tagBg: 'bg-[#2563EB]/10 text-[#2563EB]',
      tag: '1-Click Launch'
    },
    {
      id: 'customer-mgmt',
      icon: Users,
      title: 'Customer Management',
      description: 'Manage customer profiles, loyalty, and purchase history.',
      iconBg: 'bg-[#FF6B00]',
      tagBg: 'bg-[#FF6B00]/10 text-[#FF6B00]',
      tag: 'Loyalty Boost'
    },
    {
      id: 'reports-analytics',
      icon: BarChart3,
      title: 'Reports & Analytics',
      description: 'Sales reports, profit tracking, and business insights.',
      iconBg: 'bg-[#2563EB]',
      tagBg: 'bg-[#2563EB]/10 text-[#2563EB]',
      tag: 'Smart Insights'
    },
    {
      id: 'barcode-printing',
      icon: Barcode,
      title: 'Barcode & Label Printing',
      description: 'Generate and print barcode labels easily.',
      iconBg: 'bg-[#FF6B00]',
      tagBg: 'bg-[#FF6B00]/10 text-[#FF6B00]',
      tag: 'Custom Labels'
    },
    {
      id: 'cloud-backup',
      icon: Cloud,
      title: 'Cloud Backup',
      description: 'Secure automatic cloud backup with real-time sync.',
      iconBg: 'bg-[#2563EB]',
      tagBg: 'bg-[#2563EB]/10 text-[#2563EB]',
      tag: '99.9% Reliable'
    },
    {
      id: 'multi-device',
      icon: MonitorSmartphone,
      title: 'Multi-Device Access',
      description: 'Manage your business from desktop, tablet, and mobile.',
      iconBg: 'bg-[#FF6B00]',
      tagBg: 'bg-[#FF6B00]/10 text-[#FF6B00]',
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
    { title: 'Faster Billing', desc: 'Process checkout in seconds with barcode scanning', icon: Zap },
    { title: 'Increase Sales', desc: 'Connect online and offline store inventory seamlessly', icon: TrendingUp },
    { title: 'Reduce Manual Work', desc: 'Automate stock updates and GST invoice creation', icon: Activity },
    { title: 'Accurate Inventory', desc: 'Eliminate stock discrepancies with instant sync', icon: ShieldCheck },
    { title: 'Secure Cloud Storage', desc: 'Encrypted storage for all business data', icon: Cloud },
    { title: 'Easy To Use', desc: 'Zero technical experience required to get started', icon: Award }
  ];

  return (
    <section className="relative w-full bg-[#F8FAFC] pt-12 sm:pt-16 pb-20 lg:pb-28 overflow-hidden text-[#0B1F3A]">
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
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#2563EB]/10 border border-[#2563EB] text-[#2563EB] text-xs sm:text-sm font-bold uppercase tracking-wider mb-5 shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-[#2563EB]" />
            Smart Digital Business Platform
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0B1F3A] leading-[1.15]"
          >
            Transform Your Store Into a{' '}
            <span className="text-[#FF6B00]">
              Smart Digital Business
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-base sm:text-lg lg:text-xl text-[#0B1F3A]/80 leading-relaxed font-normal"
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
                  className="group relative p-6 rounded-[20px] bg-[#F8FAFC] border border-[#0B1F3A]/20 hover:border-[#2563EB] shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden"
                >
                  <div>
                    {/* Header Row: Icon & Pill Tag */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center text-[#F8FAFC] shadow-md group-hover:scale-110 transition-transform duration-300`}>
                        <IconComp className="w-6 h-6" />
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border border-current ${card.tagBg}`}>
                        {card.tag}
                      </span>
                    </div>

                    {/* Card Content */}
                    <h3 className="text-lg font-bold text-[#0B1F3A] mb-2 group-hover:text-[#2563EB] transition-colors duration-200">
                      {card.title}
                    </h3>
                    <p className="text-sm text-[#0B1F3A]/80 leading-relaxed">
                      {card.description}
                    </p>
                  </div>

                  {/* Card Bottom Indicator */}
                  <div className="mt-4 pt-3 border-t border-[#0B1F3A]/10 flex items-center text-xs font-semibold text-[#2563EB] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
              className="sticky top-28 bg-[#0B1F3A] p-6 sm:p-8 rounded-[24px] shadow-2xl border border-[#2563EB] text-[#F8FAFC] overflow-hidden"
            >
              {/* Top Mockup Header Bar */}
              <div className="flex items-center justify-between border-b border-[#2563EB]/40 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF6B00]" />
                  <div className="w-3 h-3 rounded-full bg-[#2563EB]" />
                  <div className="w-3 h-3 rounded-full bg-[#F8FAFC]" />
                  <span className="ml-2 text-xs font-semibold text-[#F8FAFC]/70">Retail Verse OS v4.2</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#2563EB]/20 text-[#2563EB] text-xs font-medium border border-[#2563EB]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
                    POS Active
                  </span>
                </div>
              </div>

              {/* Central POS Dashboard Mockup View */}
              <div className="space-y-4">

                {/* Main Billing Banner Card */}
                <div className="bg-[#0B1F3A] p-4 rounded-xl border border-[#2563EB]/50 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-[#F8FAFC]/70 uppercase tracking-wider font-semibold">Live POS Billing Station</p>
                      <p className="text-lg font-bold text-[#F8FAFC]">Store #01 - Main Counter</p>
                    </div>
                    <div className="px-3 py-1 bg-[#FF6B00] text-[#F8FAFC] text-xs font-bold rounded-lg shadow-md">
                      GST Active
                    </div>
                  </div>

                  {/* Cart Items Mock Row */}
                  <div className="space-y-2 bg-[#0B1F3A] p-3 rounded-lg border border-[#2563EB]/30 text-xs font-mono">
                    <div className="flex justify-between text-[#F8FAFC]/90">
                      <span>Wireless Barcode Scanner x1</span>
                      <span className="font-bold text-[#F8FAFC]">$129.00</span>
                    </div>
                    <div className="flex justify-between text-[#F8FAFC]/90">
                      <span>Thermal Receipt Roll (Pack of 10)</span>
                      <span className="font-bold text-[#F8FAFC]">$24.50</span>
                    </div>
                    <div className="flex justify-between text-[#F8FAFC]/90">
                      <span>Premium Smart POS Stand</span>
                      <span className="font-bold text-[#F8FAFC]">$89.00</span>
                    </div>
                    <div className="border-t border-[#2563EB]/40 pt-2 flex justify-between text-sm font-sans font-bold text-[#FF6B00]">
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
                    className="p-3 bg-[#0B1F3A] rounded-xl border border-[#2563EB]/40 flex items-center gap-3 shadow-md"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#2563EB]/20 text-[#2563EB] flex items-center justify-center shrink-0">
                      <ScanLine className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#F8FAFC] truncate">Barcode Scanner</p>
                      <p className="text-[10px] text-[#2563EB] font-medium">Ready (USB/BT)</p>
                    </div>
                  </motion.div>

                  {/* Floating Item 2: Receipt Printer */}
                  <motion.div
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-3 bg-[#0B1F3A] rounded-xl border border-[#2563EB]/40 flex items-center gap-3 shadow-md"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#FF6B00]/20 text-[#FF6B00] flex items-center justify-center shrink-0">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#F8FAFC] truncate">Receipt Printer</p>
                      <p className="text-[10px] text-[#FF6B00] font-medium">80mm Thermal</p>
                    </div>
                  </motion.div>

                  {/* Floating Item 3: Barcode Label Printer */}
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-3 bg-[#0B1F3A] rounded-xl border border-[#2563EB]/40 flex items-center gap-3 shadow-md"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#2563EB]/20 text-[#2563EB] flex items-center justify-center shrink-0">
                      <Printer className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#F8FAFC] truncate">Label Printer</p>
                      <p className="text-[10px] text-[#2563EB] font-medium">Auto-Cut</p>
                    </div>
                  </motion.div>

                  {/* Floating Item 4: Cash Drawer */}
                  <motion.div
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="p-3 bg-[#0B1F3A] rounded-xl border border-[#2563EB]/40 flex items-center gap-3 shadow-md"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#FF6B00]/20 text-[#FF6B00] flex items-center justify-center shrink-0">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#F8FAFC] truncate">Cash Drawer</p>
                      <p className="text-[10px] text-[#FF6B00] font-medium">Auto-Trigger</p>
                    </div>
                  </motion.div>
                </div>

                {/* Floating Mobile App Preview Card */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="mt-4 p-4 rounded-xl bg-[#0B1F3A] border border-[#2563EB] flex items-center justify-between shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-[#F8FAFC] flex items-center justify-center shadow-md">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#F8FAFC]">Mobile App Preview</p>
                      <p className="text-[11px] text-[#F8FAFC]/70">iOS & Android Real-Time Sync</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-[#FF6B00] text-[#F8FAFC] text-xs font-bold rounded-lg shadow">
                    Live
                  </span>
                </motion.div>

              </div>
            </motion.div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* PREMIUM SOLUTION BANNER */}
        {/* ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative rounded-[24px] bg-[#0B1F3A] p-8 sm:p-12 text-[#F8FAFC] shadow-2xl border border-[#2563EB] overflow-hidden mb-24 sm:mb-32"
        >
          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <span className="inline-block px-4 py-1 rounded-full bg-[#2563EB] text-[#F8FAFC] text-xs font-bold uppercase tracking-widest mb-4 border border-[#2563EB]">
              All-In-One Solution
            </span>

            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight mb-8 text-[#F8FAFC]">
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
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-[#0B1F3A] border border-[#2563EB]/50 hover:border-[#2563EB] text-xs sm:text-sm font-semibold transition-all duration-200"
                >
                  <div className="w-5 h-5 rounded-full bg-[#FF6B00] text-[#F8FAFC] flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <span className="text-[#F8FAFC]">{badge}</span>
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
            <h3 className="text-2xl sm:text-3xl font-extrabold text-[#0B1F3A]">
              Trusted by Growing Retailers Nationwide
            </h3>
            <p className="mt-2 text-[#0B1F3A]/80 text-sm sm:text-base">
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
                  className="relative p-6 sm:p-8 rounded-[20px] bg-[#F8FAFC] border border-[#0B1F3A]/20 hover:border-[#2563EB] shadow-lg text-center flex flex-col items-center justify-center group transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#2563EB] text-[#F8FAFC] flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-[#FF6B00] transition-all duration-300">
                    <IconComponent className="w-6 h-6" />
                  </div>

                  <div className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight mb-1">
                    {stat.isRaw ? (
                      <span>24×7</span>
                    ) : stat.isFloat ? (
                      <span>99.9%</span>
                    ) : (
                      <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                    )}
                  </div>

                  <p className="text-base font-bold text-[#0B1F3A] mt-1">{stat.label}</p>
                  <p className="text-xs text-[#0B1F3A]/70 mt-1">{stat.desc}</p>
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
            <span className="text-[#FF6B00] font-bold text-xs uppercase tracking-widest">Key Advantages</span>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-[#0B1F3A] mt-1">
              Why Retailers Choose Smart Digital Business
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit, idx) => {
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.08 }}
                  whileHover={{ y: -4 }}
                  className="p-6 rounded-[20px] bg-[#F8FAFC] border border-[#0B1F3A]/20 hover:border-[#2563EB] shadow-md transition-all duration-300 flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5 border border-[#2563EB]/20">
                    <CheckCircle2 className="w-6 h-6 text-[#2563EB]" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[#0B1F3A] mb-1 flex items-center gap-2">
                      <span>{benefit.title}</span>
                    </h4>
                    <p className="text-sm text-[#0B1F3A]/80 leading-relaxed">{benefit.desc}</p>
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
          className="relative rounded-[28px] bg-[#0B1F3A] p-10 sm:p-16 text-center text-[#F8FAFC] shadow-2xl overflow-hidden border border-[#2563EB]"
        >
          <div className="relative z-10 max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#2563EB]/20 text-[#F8FAFC] text-xs font-bold uppercase tracking-wider mb-6 border border-[#2563EB]">
              <Zap className="w-3.5 h-3.5 text-[#FF6B00]" />
              Instant Setup & 14-Day Free Trial
            </span>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#F8FAFC] leading-tight mb-6">
              Ready to Digitize Your Business?
            </h2>

            <p className="text-base sm:text-lg lg:text-xl text-[#F8FAFC]/80 mb-10 leading-relaxed max-w-2xl mx-auto font-normal">
              Join thousands of retailers who trust Retail Verse to manage their business efficiently.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-[#FF6B00] hover:bg-[#2563EB] text-[#F8FAFC] text-base font-bold shadow-xl transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <span>Get Started Today</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                type="button"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-[#0B1F3A] hover:bg-[#2563EB] text-[#F8FAFC] text-base font-bold border border-[#F8FAFC] hover:border-[#2563EB] transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <span>Book Free Demo</span>
              </button>
            </div>

            <p className="mt-6 text-xs text-[#F8FAFC]/70">
              No credit card required • Instant onboarding • Cancel anytime
            </p>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
