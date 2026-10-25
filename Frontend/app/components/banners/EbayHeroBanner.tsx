import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles } from 'lucide-react';
import { bannersApi, Banner } from '../../api/banners';
import { getFullImageUrl } from '../../utils/imageUrl';

interface EbayHeroBannerProps {
  /** Optional placement override, defaults to 'HOME_HERO' */
  placement?: 'HOME_HERO' | 'CATEGORY_TOP' | 'PROMO_STRIP';
  /** Optional auto-slide interval in milliseconds, defaults to 5000ms */
  autoplayInterval?: number;
  /** Custom container class name */
  className?: string;
}

export function EbayHeroBanner({
  placement = 'HOME_HERO',
  autoplayInterval = 5000,
  className = '',
}: EbayHeroBannerProps) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Keep isLoading only to suppress rendering until we know if banners exist.
  // We do NOT show any skeleton — the rest of the page renders immediately.
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch active banners on mount
  useEffect(() => {
    let isMounted = true;

    async function loadActiveBanners() {
      setIsLoading(true);
      try {
        const res = await bannersApi.getActive(placement);
        if (isMounted && res.success && Array.isArray(res.data)) {
          setBanners(res.data);
        }
      } catch (err) {
        console.warn('[EbayHeroBanner] Could not load active banners:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadActiveBanners();

    return () => {
      isMounted = false;
    };
  }, [placement]);

  // Next / Prev slide handlers
  const handleNext = useCallback(() => {
    if (banners.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  const handlePrev = useCallback(() => {
    if (banners.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  }, [banners.length]);

  // Autoplay timer with pause-on-hover
  useEffect(() => {
    if (banners.length <= 1 || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(handleNext, autoplayInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [banners.length, isPaused, autoplayInterval, handleNext]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (banners.length <= 1) return;
    if (e.key === 'ArrowRight') {
      handleNext();
    } else if (e.key === 'ArrowLeft') {
      handlePrev();
    }
  };

  // While fetching, render nothing — no skeleton blocks the page.
  // The rest of the homepage (SmartDigitalBusinessSection, TrustMarquee, etc.)
  // is visible immediately below the fold.
  if (isLoading) {
    return null;
  }

  // Gracefully hide if no active banners found
  if (banners.length === 0) {
    return null;
  }

  const currentBanner = banners[currentIndex];
  const desktopImg = getFullImageUrl(currentBanner.imageUrl);
  const mobileImg = currentBanner.mobileImageUrl
    ? getFullImageUrl(currentBanner.mobileImageUrl)
    : desktopImg;

  return (
    <section
      aria-label="Promotional Carousel"
      className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-5 ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <a
        href={currentBanner.ctaLink || '/shop'}
        className="relative block w-full rounded-3xl overflow-hidden transition-colors duration-700 shadow-sm border border-black/5 dark:border-white/10 group select-none min-h-[380px] sm:min-h-[420px] md:min-h-[460px] lg:min-h-[480px] cursor-pointer"
        style={{
          backgroundColor: currentBanner.backgroundColor || '#f7f7f7',
          color: currentBanner.textColor || '#111827',
        }}
      >
        {/* Subtle radial lighting overlay for richness */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40 mix-blend-soft-light"
          style={{
            background:
              'radial-gradient(circle at 75% 50%, rgba(255,255,255,0.4) 0%, rgba(0,0,0,0.1) 100%)',
          }}
        />

        <div className="relative z-10 p-6 sm:p-10 md:p-14 lg:p-16 flex flex-col md:flex-row items-center justify-between gap-8 sm:gap-12 min-h-[380px] sm:min-h-[420px] md:min-h-[460px] lg:min-h-[480px]">
          {/* ── Left Content Block (Prominent Typography) ─────────────── */}
          <div className="w-full md:w-7/12 flex flex-col items-start space-y-4 sm:space-y-6 text-left">
            {/* Pill Badge */}
            {currentBanner.badgeText && (
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-wider bg-rose-600 text-white shadow-md shadow-rose-600/20 transform transition-transform hover:scale-105">
                <Sparkles className="w-3.5 h-3.5" />
                {currentBanner.badgeText}
              </span>
            )}

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] transition-all duration-300">
              {currentBanner.headline}
            </h1>

            {/* Subheadline / Supporting Copy */}
            {currentBanner.subheadline && (
              <p className="text-sm sm:text-base md:text-lg opacity-90 max-w-xl font-normal leading-relaxed line-clamp-3">
                {currentBanner.subheadline}
              </p>
            )}

            {/* Optional CTA Button (only shown if custom ctaText is provided) */}
            {currentBanner.ctaText ? (
              <div className="pt-2 sm:pt-4">
                <span
                  className="inline-flex items-center gap-2.5 px-8 py-3.5 sm:py-4 rounded-full text-sm sm:text-base font-bold shadow-xl transition-all duration-300 group-hover:scale-105"
                  style={{
                    backgroundColor: currentBanner.textColor || '#111827',
                    color: currentBanner.backgroundColor || '#ffffff',
                  }}
                >
                  <span>{currentBanner.ctaText}</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            ) : null}
          </div>

          {/* ── Right Content Block (Responsive Product Cutout) ────────── */}
          <div className="w-full md:w-5/12 flex items-center justify-center relative">
            <div className="relative max-w-full flex items-center justify-center p-2">
              <picture>
                {/* Mobile cutout source */}
                <source media="(max-width: 768px)" srcSet={mobileImg} />
                {/* Desktop cutout source */}
                <img
                  src={desktopImg}
                  alt={currentBanner.headline}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  className="max-h-[240px] sm:max-h-[320px] md:max-h-[380px] lg:max-h-[420px] w-auto max-w-full object-contain drop-shadow-2xl transition-transform duration-700 ease-out group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLElement).style.opacity = '0.5';
                  }}
                />
              </picture>
            </div>
          </div>
        </div>

        {/* ── Carousel Navigators (Arrows) ────────────────────────────── */}
        {banners.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePrev();
              }}
              aria-label="Previous promotional slide"
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/70 dark:bg-black/40 hover:bg-white dark:hover:bg-black/70 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white shadow-lg transition-all duration-200 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:scale-110 active:scale-95 focus:opacity-100"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleNext();
              }}
              aria-label="Next promotional slide"
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/70 dark:bg-black/40 hover:bg-white dark:hover:bg-black/70 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white shadow-lg transition-all duration-200 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:scale-110 active:scale-95 focus:opacity-100"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* ── Dot Indicators with Active Pill Expansion ────────────── */}
            <div
              className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/20 backdrop-blur-md"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {banners.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  aria-label={`Go to slide ${idx + 1}`}
                  className={`h-2.5 rounded-full transition-all duration-300 focus:outline-none ${
                    idx === currentIndex
                      ? 'w-7 bg-white shadow-sm'
                      : 'w-2.5 bg-white/50 hover:bg-white/80'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </a>
    </section>
  );
}

export default EbayHeroBanner;
