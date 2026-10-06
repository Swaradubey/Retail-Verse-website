import React, { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  Globe,
  Play,
  FileText,
} from 'lucide-react';
import { Link } from 'react-router';

interface ResourceCard {
  id: string;
  icon: React.ElementType;
  accent: string;
  title: string;
  description: string;
  cta: string;
  href: string;
}

const resourceCards: ResourceCard[] = [
  {
    id: 'reports',
    icon: BarChart3,
    accent: '#2563EB',
    title: 'Built-in ecommerce reports',
    description:
      'Track revenue, customer behavior, and campaign performance with clear analytics designed to support faster and smarter decisions.',
    cta: 'Explore reports',
    href: '/shop',
  },
  {
    id: 'help-center',
    icon: Globe,
    accent: '#2563EB',
    title: 'Help Center in 5 languages',
    description:
      'Access an intuitive support experience with multilingual guidance across features, workflows, and integrations.',
    cta: 'Visit Help Center',
    href: '/dashboard/help-center',
  },
  {
    id: 'tutorials',
    icon: Play,
    accent: '#2563EB',
    title: 'Step-by-step video tutorials',
    description:
      'Learn through beautifully structured tutorials that guide you from setup basics to advanced growth strategies.',
    cta: 'Watch tutorials',
    href: '/shop',
  },
  {
    id: 'articles',
    icon: FileText,
    accent: '#2563EB',
    title: '1,500+ marketing articles',
    description:
      'Discover practical insights, proven frameworks, and expert-led resources to scale visibility, sales, and retention.',
    cta: 'Read articles',
    href: '/shop',
  },
];

export interface ResourcesSectionProps {
  className?: string;
}

export function ResourcesSection({ className = '' }: ResourcesSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-10% 0px' });

  const fadeUp = {
    hidden: { opacity: 0, y: 32 },
    visible: (delay = 0) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.75,
        delay,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    }),
  };

  const gridVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.25,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 36 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.7,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  return (
    <section
      ref={sectionRef}
      className={`relative overflow-hidden bg-[#F8FAFC] py-20 sm:py-24 lg:py-32 border-t border-[#0B1F3A]/20 ${className}`}
    >
      <div className="relative mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-14 flex flex-col gap-8 lg:mb-20 lg:flex-row lg:items-end lg:justify-between">
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            className="max-w-3xl"
          >
            <div className="mb-4 inline-flex items-center rounded-full border border-[#2563EB] bg-[#2563EB] px-4 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#F8FAFC]">
                Resources
              </span>
            </div>

            <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-[#0B1F3A] sm:text-4xl lg:text-6xl lg:leading-[1.05]">
              Resources to make better
              <span className="block text-[#FF6B00]">business decisions</span>
            </h2>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#0B1F3A] sm:text-base sm:leading-8 font-normal">
              Explore expert-led tools, guides, and learning materials designed
              to help you grow with more clarity, confidence, and control.
            </p>
          </motion.div>

          <motion.div
            custom={0.15}
            variants={fadeUp}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            className="shrink-0"
          >
            <Link
              to="/shop"
              className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#FF6B00] border border-[#FF6B00] px-7 py-4 text-sm font-bold text-[#F8FAFC] transition-all duration-300 hover:-translate-y-1 hover:bg-[#FF6B00]/90"
            >
              Get started
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>

        {/* Cards */}
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4 xl:gap-7"
        >
          {resourceCards.map((card) => {
            const Icon = card.icon;

            return (
              <motion.div key={card.id} variants={cardVariants}>
                <Link
                  to={card.href}
                  className="group relative flex h-full min-h-[360px] flex-col justify-between overflow-hidden rounded-[28px] border border-[#0B1F3A] bg-[#F8FAFC] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#2563EB] sm:p-8"
                >
                  <div className="relative z-10">
                    {/* Icon */}
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#0B1F3A] bg-[#F8FAFC] text-[#0B1F3A] transition-all duration-300 group-hover:scale-105 group-hover:bg-[#2563EB] group-hover:text-[#F8FAFC] group-hover:border-[#2563EB]">
                      <Icon className="h-6 w-6" />
                    </div>

                    {/* Content */}
                    <h3 className="mt-8 max-w-[16rem] text-[1.45rem] font-bold leading-[1.2] tracking-[-0.03em] text-[#0B1F3A]">
                      {card.title}
                    </h3>

                    <p className="mt-4 text-[15px] leading-7 text-[#0B1F3A] font-normal">
                      {card.description}
                    </p>
                  </div>

                  {/* CTA */}
                  <div className="relative z-10 mt-10 inline-flex items-center gap-2 text-sm font-bold text-[#2563EB] group-hover:text-[#FF6B00] transition-colors">
                    <span>
                      {card.cta}
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}