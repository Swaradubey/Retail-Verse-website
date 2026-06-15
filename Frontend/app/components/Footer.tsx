import { Link } from 'react-router';
import {
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  Mail,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

export function Footer() {
  const { user } = useAuth();
  const { brandName: brandingBrandName, footerText, isLoading: brandingLoading } = useBranding();
  const isSuperAdmin = user?.role === 'super_admin';
  const isClientUser = user?.role === 'client';
  const brandName = isSuperAdmin
    ? 'Daizy Homes'
    : isClientUser && user.businessName
      ? user.businessName
      : brandingBrandName || 'Daizy Homes';
  const brandSubtitle = !user
    ? 'Smart Living Store'
    : isSuperAdmin
      ? 'Smart Living Store'
      : isClientUser
        ? 'Store'
        : 'Smart Living Store';
  return (
    <footer className="relative mt-auto border-t border-white/10 bg-[#0b0b0c] text-white">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-0 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute right-[-10%] bottom-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        {/* Top section */}
        <div className="grid grid-cols-1 gap-10 border-b border-white/10 pb-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8 sm:pl-4 lg:pl-6">
          {/* Brand */}
          <div className="pl-2 sm:pl-3 lg:pl-4 lg:pr-6">
            <Link to="/" className="flex items-center gap-3 flex-wrap">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-[0_10px_30px_rgba(59,130,246,0.25)]">
                <span className="text-lg font-bold text-white">E</span>
              </div>

              <div className="flex-1 min-w-[140px]">
                <span className="block text-lg sm:text-xl font-semibold tracking-tight text-white break-words leading-tight">
                  {brandName}
                </span>
                <span className="block text-xs uppercase tracking-[0.24em] text-white/40">
                  {brandSubtitle}
                </span>
              </div>
            </Link>

            <p className="mt-5 max-w-sm text-sm leading-7 text-white/60">
              Your destination for premium electronics, smart gadgets, and
              modern essentials — curated for performance, design, and everyday
              convenience.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <a
                href="#"
                aria-label="Facebook"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-400"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-400"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-all duration-300 hover:-translate-y-1 hover:border-pink-500/40 hover:bg-pink-500/10 hover:text-pink-400"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Youtube"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-all duration-300 hover:-translate-y-1 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div className="pl-2 sm:pl-4 lg:pl-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-white/90">
              Shop
            </h3>
            <ul className="space-y-3 text-sm text-white/60">
              <li>
                <Link
                  to="/shop?category=Audio"
                  className="transition-colors hover:text-blue-400"
                >
                  Audio
                </Link>
              </li>
              <li>
                <Link
                  to="/shop?category=Gaming"
                  className="transition-colors hover:text-blue-400"
                >
                  Gaming
                </Link>
              </li>
              <li>
                <Link
                  to="/shop?category=Computers"
                  className="transition-colors hover:text-blue-400"
                >
                  Computers
                </Link>
              </li>
              <li>
                <Link
                  to="/shop?category=Mobile"
                  className="transition-colors hover:text-blue-400"
                >
                  Mobile
                </Link>
              </li>
              <li>
                <Link
                  to="/shop?category=Wearables"
                  className="transition-colors hover:text-blue-400"
                >
                  Wearables
                </Link>
              </li>
            </ul>
          </div>

          {/* Customer service */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-white/90">
              Customer Service
            </h3>
            <ul className="space-y-3 text-sm text-white/60">
              <li>
                <Link to="/contact" className="transition-colors hover:text-blue-400">
                  Contact Us
                </Link>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-blue-400">
                  Shipping Info
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-blue-400">
                  Returns
                </a>
              </li>
              <li>
                <Link to="/track-order" className="transition-colors hover:text-blue-400">
                  Track Order
                </Link>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-blue-400">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="min-w-0">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-white/90">
              Stay Updated
            </h3>
            <p className="mb-5 max-w-sm text-sm leading-7 text-white/60">
              Get product launches, exclusive deals, and curated tech updates in
              your inbox.
            </p>

            <form className="rounded-3xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm min-w-0 overflow-hidden">
              <div className="flex flex-col gap-3">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="h-12 w-full rounded-2xl border border-transparent bg-transparent px-4 text-sm text-white placeholder:text-white/35 outline-none"
                />
                <button
                  type="submit"
                  className="group inline-flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-medium text-white transition-all duration-300 hover:bg-blue-500"
                >
                  Subscribe
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </button>
              </div>
            </form>

            <p className="mt-3 text-xs leading-6 text-white/35">
              No spam. Only useful updates and offers.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 pt-6 text-sm text-white/40 md:flex-row">
          <p>
            {footerText} | Powered by{' '}
            <a
              href="https://hexerve.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white hover:underline"
            >
              Hexerve
            </a>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end">
            <Link to="/privacy-policy" className="transition-colors hover:text-white/70">
              Privacy Policy
            </Link>
            <Link to="/terms-of-service" className="transition-colors hover:text-white/70">
              Terms of Service
            </Link>
            <a href="#" className="transition-colors hover:text-white/70">
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}