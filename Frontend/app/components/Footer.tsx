import { Link, useLocation } from 'react-router';
import {
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  Mail,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { getFullImageUrl } from '../utils/imageUrl';

export function Footer({ variant: explicitVariant }: { variant?: 'platform' | 'storefront' } = {}) {
  const location = useLocation();
  const { user } = useAuth();
  const { brandName: brandingBrandName, footerText, isLoading: brandingLoading, logo: brandingLogo } = useBranding();
  const isSuperAdmin = user?.role === 'super_admin';
  const isClientUser = user?.role === 'client';
  const logoUrl = isSuperAdmin ? '' : brandingLogo || (user as any)?.storeSettings?.logoUrl || '';
  const isPlatformRoute = location.pathname.startsWith('/super-admin') || location.pathname.startsWith('/dashboard');
  const variant = explicitVariant || (isPlatformRoute ? 'platform' : 'storefront');

  const brandName = variant === 'platform'
    ? 'Retail Verse'
    : isSuperAdmin
      ? 'Retail Verse'
      : isClientUser && user.businessName
        ? user.businessName
        : brandingBrandName || 'Retail Verse';
  const brandSubtitle = variant === 'platform'
    ? 'SMART COMMERCE PLATFORM'
    : !user
      ? 'Smart Living Store'
      : isSuperAdmin
        ? 'Smart Living Store'
        : isClientUser
          ? 'Store'
          : 'Smart Living Store';
  return (
    <footer className="relative mt-auto border-t border-[#2563EB]/40 bg-[#0B1F3A] text-[#F8FAFC]">
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        {/* Top section */}
        <div className="grid grid-cols-1 gap-10 border-b border-[#2563EB]/30 pb-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8 sm:pl-4 lg:pl-6">
          {/* Brand */}
          <div className="pl-2 sm:pl-3 lg:pl-4 lg:pr-6">
            <Link to="/" className="flex items-center gap-3 flex-wrap">
              {logoUrl ? (
                <img
                  src={getFullImageUrl(logoUrl)}
                  alt={`${brandName} logo`}
                  className="h-11 max-w-[160px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).onerror = null;
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB] text-[#F8FAFC]">
                  <ShoppingBag className="h-6 w-6" />
                </div>
              )}

              <div className="flex-1 min-w-[140px]">
                <span className="block text-lg sm:text-xl font-semibold tracking-tight text-[#F8FAFC] break-words leading-tight">
                  {brandName}
                </span>
                <span className="block text-xs uppercase tracking-[0.24em] text-[#2563EB]">
                  {brandSubtitle}
                </span>
              </div>
            </Link>

            <p className="mt-5 max-w-sm text-sm leading-7 text-[#F8FAFC]">
              Your destination for premium electronics, smart gadgets, and
              modern essentials — curated for performance, design, and everyday
              convenience.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <a
                href="#"
                aria-label="Facebook"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#2563EB] transition-all duration-300 hover:bg-[#2563EB] hover:text-[#F8FAFC]"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#2563EB] transition-all duration-300 hover:bg-[#2563EB] hover:text-[#F8FAFC]"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#2563EB] transition-all duration-300 hover:bg-[#2563EB] hover:text-[#F8FAFC]"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Youtube"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#2563EB] transition-all duration-300 hover:bg-[#2563EB] hover:text-[#F8FAFC]"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div className="pl-2 sm:pl-4 lg:pl-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#F8FAFC]">
              Shop
            </h3>
            <ul className="space-y-3 text-sm text-[#F8FAFC]">
              <li>
                <Link
                  to="/shop?category=Audio"
                  className="transition-colors hover:text-[#FF6B00]"
                >
                  Audio
                </Link>
              </li>
              <li>
                <Link
                  to="/shop?category=Gaming"
                  className="transition-colors hover:text-[#FF6B00]"
                >
                  Gaming
                </Link>
              </li>
              <li>
                <Link
                  to="/shop?category=Computers"
                  className="transition-colors hover:text-[#FF6B00]"
                >
                  Computers
                </Link>
              </li>
              <li>
                <Link
                  to="/shop?category=Mobile"
                  className="transition-colors hover:text-[#FF6B00]"
                >
                  Mobile
                </Link>
              </li>
              <li>
                <Link
                  to="/shop?category=Wearables"
                  className="transition-colors hover:text-[#FF6B00]"
                >
                  Wearables
                </Link>
              </li>
            </ul>
          </div>

          {/* Customer service */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#F8FAFC]">
              Customer Service
            </h3>
            <ul className="space-y-3 text-sm text-[#F8FAFC]">
              <li>
                <Link to="/contact" className="transition-colors hover:text-[#FF6B00]">
                  Contact Us
                </Link>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-[#FF6B00]">
                  Shipping Info
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-[#FF6B00]">
                  Returns
                </a>
              </li>
              <li>
                <Link to="/track-order" className="transition-colors hover:text-[#FF6B00]">
                  Track Order
                </Link>
              </li>
              <li>
                <Link to="/delete-account" className="transition-colors hover:text-[#FF6B00]">
                  Delete Account
                </Link>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-[#FF6B00]">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="min-w-0">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#F8FAFC]">
              Stay Updated
            </h3>
            <p className="mb-5 max-w-sm text-sm leading-7 text-[#F8FAFC]">
              Get product launches, exclusive deals, and curated tech updates in
              your inbox.
            </p>

            <form className="rounded-3xl border border-[#2563EB] bg-[#0B1F3A] p-2 min-w-0 overflow-hidden">
              <div className="flex flex-col gap-3">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="h-12 w-full rounded-2xl border border-transparent bg-[#F8FAFC] px-4 text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/60 outline-none"
                />
                <button
                  type="submit"
                  className="group inline-flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-[#FF6B00] border border-[#FF6B00] px-5 text-sm font-medium text-[#F8FAFC] transition-all duration-300 hover:bg-[#FF6B00]/90"
                >
                  Subscribe
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </button>
              </div>
            </form>

            <p className="mt-3 text-xs leading-6 text-[#F8FAFC]/70">
              No spam. Only useful updates and offers.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 pt-6 text-sm text-[#F8FAFC]/80 md:flex-row">
          <p>{footerText}</p>

          <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end">
            <Link to="/privacy-policy" className="transition-colors hover:text-[#FF6B00]">
              Privacy Policy
            </Link>
            <Link to="/terms-of-service" className="transition-colors hover:text-[#FF6B00]">
              Terms of Service
            </Link>
            <Link to="/delete-account" className="transition-colors hover:text-[#FF6B00]">
              Delete Account
            </Link>
            <a href="#" className="transition-colors hover:text-[#FF6B00]">
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}