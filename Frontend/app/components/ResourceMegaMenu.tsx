import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  ChevronRight,
  BarChart3,
  Megaphone,
  RefreshCcw,
  Palette,
  Users,
  Layers3,
  Sparkles,
} from 'lucide-react';

interface MenuItem {
  title: string;
  href: string;
  icon: React.ElementType;
  isNew?: boolean;
  description: string;
}

interface UpdateCard {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  variant: 'featured' | 'light';
}

const leftColumnItems: MenuItem[] = [
  {
    title: 'Marketing Channels',
    href: '#',
    icon: Megaphone,
    description: 'Expand your reach across every key acquisition channel.',
  },
  {
    title: 'Acquire Customers',
    href: '#',
    icon: Sparkles,
    description: 'Convert new visitors with sharper customer journeys.',
  },
  {
    title: 'Retain Customers',
    href: '#',
    icon: RefreshCcw,
    description: 'Increase loyalty and repeat purchases with ease.',
  },
  {
    title: 'Reports',
    href: '#',
    icon: BarChart3,
    isNew: true,
    description: 'Track performance with beautifully organized insights.',
  },
];

const middleColumnItems: MenuItem[] = [
  {
    title: 'Business Models',
    href: '#',
    icon: Layers3,
    description: 'Support multiple selling models with flexibility.',
  },
  {
    title: 'Store Customization',
    href: '#',
    icon: Palette,
    description: 'Tailor the storefront to match your premium brand.',
  },
  {
    title: 'Staff Accounts',
    href: '#',
    icon: Users,
    description: 'Collaborate securely across teams and store roles.',
  },
  {
    title: 'daizy homes Igniter Series',
    href: '#',
    icon: Sparkles,
    description: 'Explore expert-led ideas to scale modern commerce.',
  },
];

const updateCards: UpdateCard[] = [
  {
    eyebrow: 'Featured Update',
    title: "Daizy Homes Igniter Fall ’24",
    description:
      'A premium spotlight on the newest growth features, product enhancements, and merchant-focused improvements.',
    href: '#',
    variant: 'featured',
  },
  {
    eyebrow: 'Latest Release Notes',
    title: 'Changelog',
    description:
      'Review the most recent updates, refinements, and quality-of-life improvements across the platform.',
    href: '#',
    variant: 'light',
  },
];

export default function ResourceMegaMenu() {
  return (
    <section
      className="relative overflow-hidden py-16 font-sans sm:py-24 lg:py-32"
      style={{
        fontFamily:
          "'Inter', ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        background:
          'linear-gradient(165deg, #fdfcfa 0%, #faf6ef 42%, #f7f2ea 72%, #fcfaf6 100%)',
      }}
    >
      {/* Premium ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-[12%] top-[-8%] h-[min(520px,90vw)] w-[min(520px,90vw)] rounded-full bg-[#e8d5b7]/25 blur-[120px]" />
        <div className="absolute -right-[8%] top-[20%] h-[420px] w-[420px] rounded-full bg-[#f5ebe0]/80 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[30%] h-[380px] w-[380px] rounded-full bg-amber-100/20 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(212,175,55,0.06),transparent)]" />
      </div>

      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="overflow-visible rounded-[28px] border border-stone-200/60 bg-white/45 p-6 shadow-[0_32px_80px_-24px_rgba(28,25,23,0.12),0_0_0_1px_rgba(255,255,255,0.6)_inset] backdrop-blur-xl sm:rounded-[32px] sm:p-10 md:p-14 lg:p-[4.5rem]">
          <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-x-16 lg:gap-y-0">
            {/* Left: navigation & hero */}
            <div className="lg:col-span-8">
              <header className="mb-14 max-w-2xl lg:mb-16">
                <div className="flex flex-col gap-6 sm:gap-8">
                  <div>
                    <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.32em] text-stone-500">
                      Platform Ecosystem
                    </span>
                    <div
                      className="mt-3 h-px w-12 rounded-full bg-gradient-to-r from-amber-600/50 to-transparent sm:mt-4"
                      aria-hidden
                    />
                  </div>
                  <div>
                    <h2 className="text-[1.875rem] font-semibold leading-[1.12] tracking-[-0.035em] text-[#1c1917] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.08]">
                      Explore the tools that <br className="hidden sm:block" />
                      power modern retail
                    </h2>
                    <p className="mt-6 max-w-xl text-base leading-[1.65] text-stone-600 sm:mt-8 sm:text-lg sm:leading-relaxed">
                      A curated collection of resources, insights, and tools designed to help you scale your commerce operations with precision.
                    </p>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-x-10 lg:gap-x-14">
                <nav aria-label="Growth & Insights" className="min-w-0">
                  <h3 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Growth & Insights
                  </h3>
                  <ul className="flex flex-col gap-3 sm:gap-3.5">
                    {leftColumnItems.map((item, index) => (
                      <MenuLink key={item.title} item={item} index={index} />
                    ))}
                  </ul>
                </nav>

                <nav aria-label="Commerce Operations" className="min-w-0">
                  <h3 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                    Commerce Operations
                  </h3>
                  <ul className="flex flex-col gap-3 sm:gap-3.5">
                    {middleColumnItems.map((item, index) => (
                      <MenuLink
                        key={item.title}
                        item={item}
                        index={index + 4}
                      />
                    ))}
                  </ul>
                </nav>
              </div>
            </div>

            {/* Right: highlights */}
            <aside className="relative min-w-0 lg:col-span-4 lg:pl-10 xl:pl-14">
              <div
                className="absolute left-0 top-0 hidden h-full w-px bg-gradient-to-b from-transparent via-stone-300/50 to-transparent lg:block"
                aria-hidden
              />

              <div className="h-full pt-2 lg:pt-0">
                <header className="mb-9 flex items-start justify-between gap-4 lg:mb-10">
                  <div className="min-w-0">
                    <span className="inline-flex text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-500">
                      Product Intelligence
                    </span>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-[#1c1917] sm:text-[1.65rem]">
                      Latest highlights
                    </h3>
                  </div>
                </header>

                <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2 sm:gap-5 lg:flex lg:flex-col lg:gap-6">
                  {updateCards.map((card, index) => (
                    <UpdateCardBlock
                      key={card.title}
                      card={card}
                      index={index}
                    />
                  ))}
                </div>

                <div className="mt-9 rounded-2xl border border-stone-200/70 bg-white/50 p-6 text-center shadow-[0_8px_32px_-16px_rgba(28,25,23,0.08)] backdrop-blur-sm transition-shadow duration-300 hover:shadow-[0_12px_40px_-12px_rgba(28,25,23,0.1)] lg:mt-11">
                  <p className="text-xs font-medium leading-relaxed text-stone-500">
                    Stay ahead with our monthly digest
                  </p>
                  <a
                    href="#"
                    className="mt-3 inline-flex items-center justify-center text-sm font-semibold text-[#292524] underline decoration-stone-300 underline-offset-[5px] transition-colors duration-300 hover:text-amber-900 hover:decoration-amber-600/50"
                  >
                    Subscribe to newsletter
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function MenuLink({ item, index }: { item: MenuItem; index: number }) {
  const Icon = item.icon;

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.05,
        ease: [0.23, 1, 0.32, 1],
      }}
    >
      <a
        href={item.href}
        className="group relative flex items-start gap-4 overflow-hidden rounded-2xl border border-stone-200/70 bg-white/55 p-4 shadow-[0_4px_24px_-8px_rgba(28,25,23,0.08)] backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-amber-200/45 hover:bg-white/85 hover:shadow-[0_16px_40px_-12px_rgba(180,140,90,0.12),0_8px_24px_-8px_rgba(28,25,23,0.1)] active:translate-y-0 active:scale-[0.995]"
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-stone-100 to-[#f5ebe0] text-stone-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-stone-200/80 transition-all duration-300 group-hover:scale-[1.06] group-hover:from-amber-50 group-hover:to-[#f0e4d4] group-hover:text-amber-950 group-hover:ring-amber-200/50 group-hover:shadow-[0_8px_20px_-6px_rgba(180,130,50,0.2)]"
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#1c1917] transition-colors duration-300 group-hover:text-[#0c0a09] sm:text-[16px]">
              {item.title}
            </h4>
            {item.isNew && (
              <span className="flex h-5 shrink-0 items-center rounded-full bg-gradient-to-r from-amber-50 to-[#f5ead8] px-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-900/90 ring-1 ring-amber-200/60">
                New
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-[14px] font-medium leading-relaxed text-stone-600 transition-colors duration-300 group-hover:text-stone-700 sm:text-[15px] sm:leading-[1.55]">
            {item.description}
          </p>
        </div>

        <div className="flex h-11 shrink-0 items-center opacity-0 transition-all duration-300 -translate-x-2 group-hover:translate-x-0 group-hover:opacity-100">
          <ChevronRight className="h-4 w-4 text-amber-800/40 transition-colors group-hover:text-amber-900/70" />
        </div>
      </a>
    </motion.li>
  );
}

function UpdateCardBlock({
  card,
  index,
}: {
  card: UpdateCard;
  index: number;
}) {
  const isFeatured = card.variant === 'featured';

  return (
    <motion.a
      href={card.href}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: 0.3 + index * 0.1,
        ease: [0.23, 1, 0.32, 1],
      }}
      className={`group relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] border p-6 transition-all duration-300 ease-out sm:p-7 ${isFeatured
          ? 'border-white/[0.1] bg-[#141312] text-white shadow-[0_0_0_1px_rgba(212,175,55,0.12),0_28px_56px_-18px_rgba(0,0,0,0.55),0_0_80px_-24px_rgba(180,130,60,0.18)] hover:-translate-y-1 hover:shadow-[0_0_0_1px_rgba(212,175,55,0.2),0_36px_72px_-20px_rgba(0,0,0,0.6),0_0_100px_-20px_rgba(200,160,80,0.22)]'
          : 'border-stone-200/80 bg-gradient-to-b from-white to-[#faf8f5] text-[#1c1917] shadow-[0_8px_36px_-12px_rgba(28,25,23,0.08)] hover:-translate-y-1 hover:border-stone-300/90 hover:shadow-[0_20px_48px_-16px_rgba(28,25,23,0.12)]'
        }`}
    >
      {isFeatured && (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          <div className="absolute inset-0 bg-gradient-to-br from-[#1f1d1b] via-[#141312] to-[#0c0b0a]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(212,175,55,0.09)_0%,transparent_45%,transparent_100%)]" />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-amber-400/12 via-transparent to-transparent opacity-90" />
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-amber-400/15 blur-3xl transition-all duration-500 group-hover:bg-amber-400/22" />
          <div className="absolute -bottom-6 -left-6 h-36 w-36 rounded-full bg-white/[0.04] blur-2xl" />
        </div>
      )}

      <div className="relative z-10 flex h-full min-h-0 flex-col justify-between gap-8">
        <div className="min-w-0">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${isFeatured
                ? 'bg-white/[0.08] text-white/55 ring-1 ring-white/[0.1]'
                : 'bg-stone-100/90 text-stone-500 ring-1 ring-stone-200/80'
              }`}
          >
            {card.eyebrow}
          </span>

          <h3
            className={`mt-4 text-xl font-semibold leading-tight tracking-[-0.02em] sm:text-2xl ${isFeatured ? 'text-white' : 'text-[#1c1917]'
              }`}
          >
            {card.title}
          </h3>

          <p
            className={`mt-3 text-[15px] font-medium leading-[1.6] sm:text-base ${isFeatured ? 'text-white/75' : 'text-stone-600'
              }`}
          >
            {card.description}
          </p>
        </div>

        <div className="mt-auto shrink-0">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] transition-all duration-300 ease-out group-hover:gap-3 ${isFeatured
                ? 'bg-white/[0.1] text-white/90 ring-1 ring-white/15 group-hover:bg-white/[0.16] group-hover:ring-white/25'
                : 'bg-stone-100/90 text-stone-700 ring-1 ring-stone-200/90 group-hover:bg-stone-200/80 group-hover:text-stone-900'
              }`}
          >
            Explore
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-80 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </motion.a>
  );
}
