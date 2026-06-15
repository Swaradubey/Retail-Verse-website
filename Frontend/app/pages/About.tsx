import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Lightbulb,
  Heart,
  Package,
  Headphones,
  Truck,
  Award,
  Users,
  ShoppingBag,
  LayoutGrid,
  Clock,
} from 'lucide-react';

/* ─── Animation helpers ─────────────────────────────────────── */
const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, delay, ease },
  }),
};

const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const cardFade = {
  hidden: { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease },
  },
};

/* ─── Data ──────────────────────────────────────────────────── */
const values = [
  {
    icon: Sparkles,
    accent: 'from-amber-500/20 to-amber-500/5',
    title: 'Uncompromising Quality',
    description:
      'Every product is vetted for materials, durability, and craftsmanship before it reaches our shelves.',
  },
  {
    icon: ShieldCheck,
    accent: 'from-emerald-500/20 to-emerald-500/5',
    title: 'Earned Trust',
    description:
      'Transparent pricing, honest reviews, and a no-questions-asked return policy build lasting confidence.',
  },
  {
    icon: Lightbulb,
    accent: 'from-indigo-500/20 to-indigo-500/5',
    title: 'Continuous Innovation',
    description:
      'We stay ahead of the curve, bringing you the latest technology and design trends as they emerge.',
  },
  {
    icon: Heart,
    accent: 'from-rose-500/20 to-rose-500/5',
    title: 'Customer-First Experience',
    description:
      'From discovery to delivery, every touchpoint is designed around clarity, speed, and delight.',
  },
];

const reasons = [
  {
    icon: Package,
    title: 'Curated Premium Products',
    description:
      'Hand-selected from top-tier brands for design, performance, and lasting value.',
  },
  {
    icon: Headphones,
    title: 'Reliable Human Support',
    description:
      'Real people who respond quickly and solve your problems on the first contact.',
  },
  {
    icon: Truck,
    title: 'Lightning-Fast Delivery',
    description:
      'Same-day dispatch and express shipping options so you never have to wait.',
  },
  {
    icon: Award,
    title: 'Seamless Shopping Experience',
    description:
      'A refined interface that makes browsing, comparing, and buying effortless.',
  },
];

const stats = [
  { icon: Users, value: '24K+', label: 'Happy customers' },
  { icon: ShoppingBag, value: '85K+', label: 'Products delivered' },
  { icon: LayoutGrid, value: '120+', label: 'Premium brands' },
  { icon: Clock, value: '24/7', label: 'Support available' },
];

/* ─── Component ─────────────────────────────────────────────── */
export function About() {
  const heroRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<HTMLDivElement>(null);
  const whyRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  const heroInView = useInView(heroRef, { once: true, margin: '-5% 0px' });
  const storyInView = useInView(storyRef, { once: true, margin: '-10% 0px' });
  const valuesInView = useInView(valuesRef, { once: true, margin: '-10% 0px' });
  const whyInView = useInView(whyRef, { once: true, margin: '-10% 0px' });
  const statsInView = useInView(statsRef, { once: true, margin: '-10% 0px' });
  const ctaInView = useInView(ctaRef, { once: true, margin: '-10% 0px' });

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f7f5] text-[#111111]">
      {/* ═══════════════════ HERO ══════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative overflow-hidden bg-[#f5f5f3] pb-20 pt-20 sm:pb-28 sm:pt-24 lg:pb-36 lg:pt-32"
      >
        {/* BG accents */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 top-0 h-80 w-80 rounded-full bg-indigo-200/20 blur-3xl" />
          <div className="absolute right-0 top-20 h-80 w-80 rounded-full bg-amber-200/20 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(rgba(0,0,0,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.7)_1px,transparent_1px)] [background-size:36px_36px]" />
        </div>

        <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate={heroInView ? 'visible' : 'hidden'}
            className="mx-auto max-w-3xl text-center"
          >
            <div className="mb-5 inline-flex items-center rounded-full border border-black/10 bg-white/70 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/55">
                About daizy homes
              </span>
            </div>

            <h1 className="text-[2.1rem] font-bold leading-[1.1] tracking-[-0.04em] text-[#111111] min-[400px]:text-[2.6rem] sm:text-5xl lg:text-7xl">
              Built for better
              <span className="block text-black/35">shopping experiences</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[#5f5f5f] sm:text-lg">
              We believe shopping should be effortless, inspiring, and
              trustworthy. EcoShop brings together premium products, thoughtful
              design, and customer-first service into one seamless experience.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/shop"
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#111111] px-8 py-4 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-1 hover:bg-black hover:shadow-[0_18px_40px_rgba(0,0,0,0.16)]"
              >
                Shop collection
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>

              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/70 px-8 py-4 text-sm font-semibold text-[#111111] backdrop-blur-sm transition-all duration-300 hover:border-black/20 hover:bg-white"
              >
                Contact us
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ BRAND STORY ═══════════════════════ */}
      <section
        ref={storyRef}
        className="relative overflow-hidden bg-white py-20 sm:py-24 lg:py-32"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-[-8%] top-0 h-72 w-72 rounded-full bg-amber-400/8 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            {/* Image side */}
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate={storyInView ? 'visible' : 'hidden'}
            >
              <div className="relative">
                <div className="overflow-hidden rounded-[28px] border border-black/6 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                  <img
                    src="https://images.unsplash.com/photo-1556761175-4b46a572b786?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
                    alt="EcoShop team collaborating"
                    className="aspect-[4/3] w-full object-cover"
                  />
                </div>

                {/* Floating card */}
                <div className="absolute -bottom-6 -right-3 hidden rounded-2xl border border-black/8 bg-white/90 px-5 py-4 shadow-lg backdrop-blur-sm sm:block">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Since 2019
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#111111]">
                    Trusted by 24,000+ customers
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Text side */}
            <motion.div
              custom={0.15}
              variants={fadeUp}
              initial="hidden"
              animate={storyInView ? 'visible' : 'hidden'}
            >
              <div className="mb-4 inline-flex items-center rounded-full border border-black/10 bg-[#f7f7f5] px-4 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/55">
                  Our Story
                </span>
              </div>

              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#111111] sm:text-4xl lg:text-5xl lg:leading-[1.1]">
                A new standard for
                <span className="block">online commerce</span>
              </h2>

              <div className="mt-6 space-y-5 text-[15px] leading-7 text-[#5f5f5f] sm:text-base sm:leading-8">
                <p>
                  EcoShop was founded with a simple belief: shopping online should
                  feel as premium as walking into the finest boutique. No clutter,
                  no friction — just carefully curated products, honest pricing,
                  and an experience that respects your time.
                </p>
                <p>
                  Today, we partner with over 120 premium brands to bring you a
                  collection of electronics, smart gadgets, and modern essentials
                  that meet the highest standards of design, durability, and
                  performance.
                </p>
                <p>
                  Behind every product on our shelves is a dedicated team of
                  curators, engineers, and support specialists working to ensure
                  every interaction — from first click to unboxing — exceeds
                  your expectations.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ VALUES ════════════════════════════ */}
      <section
        ref={valuesRef}
        className="relative overflow-hidden bg-[#f7f6f3] py-20 sm:py-24 lg:py-32"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-10%] top-0 h-72 w-72 rounded-full bg-indigo-500/5 blur-3xl" />
          <div className="absolute right-[-8%] bottom-0 h-72 w-72 rounded-full bg-rose-400/8 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(0,0,0,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.7)_1px,transparent_1px)] [background-size:36px_36px]" />
        </div>

        <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate={valuesInView ? 'visible' : 'hidden'}
            className="mx-auto mb-14 max-w-2xl text-center lg:mb-20"
          >
            <div className="mb-4 inline-flex items-center rounded-full border border-black/10 bg-white/70 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/55">
                Core Values
              </span>
            </div>

            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#111111] sm:text-4xl lg:text-5xl">
              What we stand for
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#5f5f5f] sm:text-base sm:leading-8">
              These principles guide every decision we make — from selecting
              products to designing customer experiences.
            </p>
          </motion.div>

          {/* Value cards */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={valuesInView ? 'visible' : 'hidden'}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4 xl:gap-7"
          >
            {values.map((v) => {
              const Icon = v.icon;
              return (
                <motion.div key={v.title} variants={cardFade}>
                  <div className="group relative flex h-full min-h-[300px] flex-col overflow-hidden rounded-[28px] border border-black/6 bg-white/85 p-7 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-all duration-500 hover:-translate-y-2 hover:border-black/10 hover:shadow-[0_20px_50px_rgba(0,0,0,0.10)] sm:p-8">
                    {/* Accent glow */}
                    <div
                      className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-br ${v.accent} opacity-80 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
                    />

                    <div className="relative z-10">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-black/6 bg-[#f8f8f6] shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:bg-white">
                        <Icon className="h-6 w-6 text-[#111111]" />
                      </div>

                      <h3 className="mt-8 text-[1.3rem] font-semibold leading-[1.2] tracking-[-0.02em] text-[#111111]">
                        {v.title}
                      </h3>

                      <p className="mt-4 text-[15px] leading-7 text-[#5f5f5f]">
                        {v.description}
                      </p>
                    </div>

                    <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-transparent transition-all duration-500 group-hover:ring-black/8" />
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ WHY CHOOSE US ════════════════════ */}
      <section
        ref={whyRef}
        className="relative overflow-hidden bg-white py-20 sm:py-24 lg:py-32"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-8%] bottom-0 h-72 w-72 rounded-full bg-emerald-400/8 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
          <div className="grid items-start gap-14 lg:grid-cols-2 lg:gap-20">
            {/* Text side */}
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate={whyInView ? 'visible' : 'hidden'}
              className="lg:sticky lg:top-32"
            >
              <div className="mb-4 inline-flex items-center rounded-full border border-black/10 bg-[#f7f7f5] px-4 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/55">
                  Why EcoShop
                </span>
              </div>

              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#111111] sm:text-4xl lg:text-5xl lg:leading-[1.1]">
                Why thousands of
                <span className="block">customers choose us</span>
              </h2>

              <p className="mt-5 max-w-lg text-sm leading-7 text-[#5f5f5f] sm:text-base sm:leading-8">
                We're not just another online store — we're a curated commerce
                platform built for people who value design, quality, and
                reliability.
              </p>

              <Link
                to="/shop"
                className="group mt-10 inline-flex items-center justify-center gap-3 rounded-full bg-[#111111] px-7 py-4 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-1 hover:bg-black hover:shadow-[0_18px_40px_rgba(0,0,0,0.16)]"
              >
                Start shopping
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </motion.div>

            {/* Cards side */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate={whyInView ? 'visible' : 'hidden'}
              className="grid gap-5 sm:grid-cols-2"
            >
              {reasons.map((r) => {
                const Icon = r.icon;
                return (
                  <motion.div key={r.title} variants={cardFade}>
                    <div className="group flex h-full flex-col rounded-[24px] border border-black/6 bg-[#fafaf9] p-6 transition-all duration-500 hover:-translate-y-1 hover:border-black/10 hover:bg-white hover:shadow-[0_16px_40px_rgba(0,0,0,0.07)] sm:p-7">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-black/6 bg-white shadow-sm transition-all duration-300 group-hover:scale-105">
                        <Icon className="h-5 w-5 text-[#111111]" />
                      </div>

                      <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-[#111111]">
                        {r.title}
                      </h3>

                      <p className="mt-3 text-[15px] leading-7 text-[#5f5f5f]">
                        {r.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ STATS ════════════════════════════ */}
      <section
        ref={statsRef}
        className="relative overflow-hidden border-y border-black/6 bg-[#111111] py-16 sm:py-20 lg:py-24"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-10%] top-0 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute right-[-10%] bottom-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:36px_36px]" />
        </div>

        <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate={statsInView ? 'visible' : 'hidden'}
            className="mb-12 text-center lg:mb-16"
          >
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Our impact in numbers
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-white/50 sm:text-base">
              The milestones that reflect our commitment to customers and quality.
            </p>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={statsInView ? 'visible' : 'hidden'}
            className="grid grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-4"
          >
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <motion.div key={s.label} variants={cardFade}>
                  <div className="group flex flex-col items-center rounded-[24px] border border-white/8 bg-white/5 p-7 text-center backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-white/15 hover:bg-white/8 sm:p-8">
                    <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                      <Icon className="h-5 w-5 text-white/70" />
                    </div>
                    <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                      {s.value}
                    </span>
                    <span className="mt-2 text-sm font-medium text-white/50">
                      {s.label}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ CTA ══════════════════════════════ */}
      <section
        ref={ctaRef}
        className="relative overflow-hidden bg-[#f7f6f3] py-20 sm:py-24 lg:py-32"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-10%] bottom-0 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="absolute right-[-8%] top-0 h-72 w-72 rounded-full bg-indigo-500/5 blur-3xl" />
        </div>

        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate={ctaInView ? 'visible' : 'hidden'}
          className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8"
        >
          <div className="mb-5 inline-flex items-center rounded-full border border-black/10 bg-white/70 px-4 py-1.5 backdrop-blur-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/55">
              Get Started
            </span>
          </div>

          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#111111] sm:text-4xl lg:text-5xl">
            Ready to explore our collection?
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#5f5f5f] sm:text-base sm:leading-8">
            Discover premium products curated for modern lifestyles. Every item
            hand-picked, every experience thoughtfully designed.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/shop"
              className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#111111] px-8 py-4 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-1 hover:bg-black hover:shadow-[0_18px_40px_rgba(0,0,0,0.16)]"
            >
              Shop now
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>

            <Link
              to="/contact"
              className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/70 px-8 py-4 text-sm font-semibold text-[#111111] backdrop-blur-sm transition-all duration-300 hover:border-black/20 hover:bg-white"
            >
              Contact us
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
