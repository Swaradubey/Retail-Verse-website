import { Link, useLocation } from 'react-router';
import { Search, ShoppingBag, Heart, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

const NAV_ITEMS = [
  { label: 'New In', href: '/shop' },
  { label: 'Collections', href: '/shop' },
  { label: 'Women', href: '/shop' },
  { label: 'Men', href: '/shop' },
  { label: 'Accessories', href: '/shop' },
  { label: 'Sale', href: '/shop' },
];

export function LuxeHeader() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { brandName: brandingBrandName } = useBranding();
  const { user } = useAuth();
  const { cartCount } = useCart();
  const isSuperAdmin = user?.role === 'super_admin';
  const isClientUser = user?.role === 'client';
  const brandName = isSuperAdmin
    ? 'Retail Verse'
    : isClientUser && user.businessName
      ? user.businessName
      : brandingBrandName || 'Retail Verse';

  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', () => setScrolled(window.scrollY > 40), { passive: true });
  }

  return (
    <header className={`sticky top-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/95 backdrop-blur-xl shadow-sm' : 'bg-transparent'}`}>
      {/* Top bar */}
      <div className="hidden lg:block border-b border-black/5">
        <div className="max-w-[88rem] mx-auto px-6 py-2 flex items-center justify-between text-[11px] tracking-widest uppercase text-gray-500 font-medium">
          <div className="flex items-center gap-6">
            <Link to="/track-order" className="hover:text-black transition-colors"></Link>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/account"
              className="inline-flex items-center px-5 py-1.5 rounded-full bg-[#c9a96e] text-white font-semibold tracking-wide hover:bg-[#b8954f] transition-all duration-300 shadow-sm hover:shadow-md hover:scale-105 active:scale-[0.98]"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="max-w-[88rem] mx-auto px-6">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <button className="lg:hidden p-2 -ml-2" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>

          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6]">
              <ShoppingBag className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl lg:text-3xl font-serif tracking-wide text-[#1a1a2e] font-bold">
              {brandName}
            </span>
          </Link>

          {pathname !== '/' && (
            <nav className="hidden lg:flex items-center gap-8">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  to={item.href}
                  className="text-sm font-medium text-gray-700 hover:text-[#1a1a2e] tracking-wide transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-4">
            <button className="hidden lg:flex p-2 text-gray-600 hover:text-[#1a1a2e] transition-colors" aria-label="Search">
              <Search className="w-5 h-5" />
            </button>
            <Link to="/account/wishlist" className="hidden lg:flex p-2 text-gray-600 hover:text-[#1a1a2e] transition-colors" aria-label="Wishlist">
              <Heart className="w-5 h-5" />
            </Link>
            <Link to="/cart" className="p-2 text-gray-600 hover:text-[#1a1a2e] transition-colors relative" aria-label="Cart">
              <ShoppingBag className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#c9a96e] text-white text-[9px] font-bold rounded-full flex items-center justify-center">{cartCount}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="flex items-center justify-between px-6 h-16 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6]">
                <ShoppingBag className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-serif font-bold text-[#1a1a2e]">{brandName}</span>
            </div>
            <button onClick={() => setMobileOpen(false)} className="p-2">
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="px-6 py-8 space-y-6">
            {pathname !== '/' && NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className="block text-lg font-medium text-gray-800 hover:text-[#1a1a2e] tracking-wide"
              >
                {item.label}
              </Link>
            ))}
            {pathname !== '/' && <hr className="border-gray-100" />}
            <Link to="/account" className="block text-lg font-medium text-gray-800" onClick={() => setMobileOpen(false)}>Sign In</Link>
            <Link to="/track-order" className="block text-lg font-medium text-gray-800" onClick={() => setMobileOpen(false)}>Track Order</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
