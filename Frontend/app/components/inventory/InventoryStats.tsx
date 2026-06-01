import React from 'react';
import { motion } from 'framer-motion';
import { Package, CheckCircle, AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { InventoryItem } from '../../types/inventory';

interface InventoryStatsProps {
  items: InventoryItem[];
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

interface StatConfig {
  title: string;
  value: number;
  trend: { value: number; direction: 'up' | 'down' | 'flat' };
  icon: React.ElementType;
  gradient: string;
  glowColor: string;
  bgLight: string;
  bgDark: string;
  iconBg: string;
  iconColor: string;
}

function getTrend(trend: StatConfig['trend']) {
  if (trend.direction === 'up') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300">
        <TrendingUp className="h-3 w-3 shrink-0" />
        +{trend.value}%
      </span>
    );
  }
  if (trend.direction === 'down') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/60 bg-rose-50/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-300">
        <TrendingDown className="h-3 w-3 shrink-0" />
        -{trend.value}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
      <Minus className="h-3 w-3 shrink-0" />
      0%
    </span>
  );
}

export function InventoryStats({ items }: InventoryStatsProps) {
  const totalProducts = items.length;
  const inStock = items.filter((i) => i.stock >= 10).length;
  const lowStock = items.filter((i) => {
    const stock = Number(i.stock ?? 0);
    if (stock <= 0) return false;
    const threshold = Number(i.minStock ?? i.lowStockThreshold ?? 10);
    return stock < threshold;
  }).length;
  const outOfStock = items.filter((i) => i.stock === 0).length;

  const stats: StatConfig[] = [
    {
      title: 'Total Products',
      value: totalProducts,
      trend: { value: 12, direction: 'up' },
      icon: Package,
      gradient: 'from-violet-600 to-indigo-600',
      glowColor: 'shadow-violet-500/20',
      bgLight: 'bg-violet-50/80',
      bgDark: 'dark:bg-violet-950/30',
      iconBg: 'bg-violet-100 dark:bg-violet-900/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      title: 'In Stock',
      value: inStock,
      trend: { value: 8, direction: 'up' },
      icon: CheckCircle,
      gradient: 'from-emerald-500 to-teal-500',
      glowColor: 'shadow-emerald-500/20',
      bgLight: 'bg-emerald-50/80',
      bgDark: 'dark:bg-emerald-950/30',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Low Stock',
      value: lowStock,
      trend: { value: 5, direction: 'down' },
      icon: AlertTriangle,
      gradient: 'from-amber-500 to-orange-500',
      glowColor: 'shadow-amber-500/20',
      bgLight: 'bg-amber-50/80',
      bgDark: 'dark:bg-amber-950/30',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Out of Stock',
      value: outOfStock,
      trend: { value: 3, direction: 'down' },
      icon: XCircle,
      gradient: 'from-rose-500 to-red-500',
      glowColor: 'shadow-rose-500/20',
      bgLight: 'bg-rose-50/80',
      bgDark: 'dark:bg-rose-950/30',
      iconBg: 'bg-rose-100 dark:bg-rose-900/40',
      iconColor: 'text-rose-600 dark:text-rose-400',
    },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4"
    >
      {stats.map((stat) => (
        <motion.div
          key={stat.title}
          variants={item}
          whileHover={{ y: -4 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          className="group relative cursor-default"
        >
          <div
            className={`relative overflow-hidden rounded-[1.125rem] border border-white/70 bg-white/65 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06),0_8px_24px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:p-[1px] before:content-[''] before:bg-gradient-to-br before:from-white/90 before:via-transparent before:to-slate-200/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)] dark:before:from-white/10 dark:before:to-white/[0.02] group-hover:border-white/90 group-hover:shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)] dark:group-hover:border-white/[0.12] ${stat.glowColor}`}
          >
            <div
              className={`absolute left-4 right-4 top-0 h-px bg-gradient-to-r ${stat.gradient} opacity-80`}
              aria-hidden
            />
            <div
              className={`absolute -right-8 -top-12 h-36 w-36 rounded-full bg-gradient-to-br ${stat.gradient} opacity-[0.07] blur-3xl transition-opacity duration-300 group-hover:opacity-[0.12]`}
            />

            <div className="relative z-10 p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                    {stat.title}
                  </p>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
                    <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-[2rem] dark:text-white">
                      {stat.value}
                    </span>
                    {getTrend(stat.trend)}
                  </div>
                </div>
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-black/[0.04] ${stat.iconBg} ${stat.iconColor} shadow-inner transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-105 group-hover:shadow-md dark:ring-white/10`}
                >
                  <stat.icon className="h-5 w-5" strokeWidth={2} />
                </div>
              </div>

              <div className="flex h-4 items-end gap-[3px]">
                {[3, 5, 4, 7, 6, 8, 5, 9, 7, 10].map((h, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full bg-gradient-to-t ${stat.gradient} transition-all duration-300 group-hover:opacity-90`}
                    style={{ height: `${h * 10}%`, opacity: 0.18 + i * 0.07 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
