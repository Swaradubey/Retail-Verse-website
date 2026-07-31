import { Link, useLocation } from 'react-router';
import { Search, ShoppingCart, Menu, X, ChevronDown, MapPin, Phone, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

const CATEGORIES = [
  { label: 'Electronics', href: '/shop' },
  { label: 'Fashion', href: '/shop' },
  { label: 'Home & Kitchen', href: '/shop' },
  { label: 'Beauty', href: '/shop' },
  { label: 'Sports', href: '/shop' },
  { label: 'Groceries', href: '/shop' },
];

export function NovaHeader() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
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

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      {/* Top bar */}
      <div className="bg-[#0f172a] text-white text-xs">
        <div className="max-w-[88rem] mx-auto px-4 flex items-center justify-between h-8">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Store Locator</span>
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> 1-800-NOVA</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/track-order" className="hover:text-blue-300 transition-colors">Track Order</Link>
            <Link
              to="/account"
              className="inline-flex items-center px-5 py-1.5 rounded-full bg-blue-600 text-white text-xs font-semibold tracking-wide hover:bg-blue-700 transition-all duration-300 shadow-sm hover:shadow-md hover:scale-105 active:scale-[0.98]"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Main bar */}
      <div className="max-w-[88rem] mx-auto px-4">
        <div className="flex items-center gap-4 h-14 lg:h-16">
          <button className="lg:hidden p-2 -ml-2" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>

          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6]">
              <ShoppingBag className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl lg:text-2xl font-bold text-[#0f172a] tracking-tight">
              {brandName}
            </span>
          </Link>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-2xl mx-4">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search products, categories, brands..."
                className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>

          <Link to="/cart" className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold">
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            <span className="bg-white text-blue-600 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center">{cartCount}</span>
          </Link>
        </div>
      </div>

      {/* Category nav */}
      {pathname !== '/' && (
        <nav className="hidden lg:block border-t border-gray-100 bg-gray-50/50">
          <div className="max-w-[88rem] mx-auto px-4 flex items-center gap-1">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.label}
                to={cat.href}
                className="px-4 py-2.5 text-xs font-semibold text-gray-700 hover:text-blue-600 hover:bg-white rounded-sm transition-colors"
              >
                {cat.label}
              </Link>
            ))}
            <div className="ml-auto px-4 py-2.5 text-xs font-bold text-orange-600 bg-orange-50 rounded-sm">
              🔥 Flash Sale Ends in 12h
            </div>
          </div>
        </nav>
      )}

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-white lg:hidden">
          <div className="flex items-center justify-between px-4 h-14 border-b">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6]">
                <ShoppingBag className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-[#0f172a]">{brandName}</span>
            </div>
            <button onClick={() => setMobileOpen(false)} className="p-2">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 py-4">
            <input
              type="text"
              placeholder="Search..."
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-sm mb-6"
            />
          </div>
          {pathname !== '/' && (
            <nav className="px-4 space-y-1">
              {CATEGORIES.map((cat) => (
                <Link key={cat.label} to={cat.href} onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
                  {cat.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      )}
    </header>
  );
}
