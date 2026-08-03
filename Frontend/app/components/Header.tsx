import { Link, useNavigate, useLocation } from 'react-router';
import { ShoppingCart, Menu, X, ArrowRight, Package, ShoppingBag, Search, Heart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { canAccessInventoryEditor } from '../utils/inventoryPermissions';
import { accountRoleBadgeText, accountRoleSubtitle, isCustomerAccountRole, isStaffRole, isSuperAdminRole, normalizeRole } from '../utils/staffRoles';
import { getFullImageUrl } from '../utils/imageUrl';

const HIDDEN_HEADER_ROLES = [
  'employee',
  'seo_manager',
  'inventory_manager',
];

const NAV_ITEMS = [
  { name: 'Home', href: '/' },
  { name: 'Products', href: '/products' },
  { name: 'Contact', href: '/contact' },
  { name: 'Pricing', href: '/pricing' },
];

export function Header() {
  const { pathname } = useLocation();
  const { cartCount } = useCart();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  /** Hide storefront nav links for Super Admin and restricted employee roles. */
  const normalizedRole = normalizeRole(user?.role);
  const shouldHideHeaderNav = normalizedRole && HIDDEN_HEADER_ROLES.includes(normalizedRole);
  const hideStorefrontNavForSuperAdmin = Boolean(user && isSuperAdminRole(user.role));

  /** Dynamic brand name: super_admin always sees default; client user uses businessName; otherwise BrandingContext or default */
  const { brandName: brandingBrandName, logo: brandingLogo } = useBranding();
  const isSuperAdmin = user?.role === 'super_admin';
  const isClientUser = user?.role === 'client';
  const logoUrl = isSuperAdmin ? '' : brandingLogo || (user as any)?.storeSettings?.logoUrl || '';
  const brandName = isSuperAdmin
    ? 'Retail Verse'
    : isClientUser && user.businessName
      ? user.businessName
      : brandingBrandName || 'Retail Verse';
  const brandSubtitle = !user
    ? 'Premium Commerce'
    : isSuperAdmin
      ? 'Premium Commerce'
      : isClientUser
        ? 'Store'
        : 'Premium Commerce';

  const canOpenInventory = canAccessInventoryEditor(user?.role);
  const accountHomeHref = '/dashboard';

  const handleLogout = () => {
    logout();
    navigate('/');
    setMobileMenuOpen(false);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const isNavActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || pathname === '/landing';
    }
    if (href === '/products') {
      return pathname === '/products' || pathname.startsWith('/products') || pathname === '/shop';
    }
    if (href === '/contact') {
      return pathname === '/contact';
    }
    if (href === '/pricing') {
      return pathname === '/pricing' || pathname === '/subscription';
    }
    return pathname === href;
  };

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-black/[0.06] bg-[#FCFBF8]/88 backdrop-blur-xl">
        <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
          <div className="flex h-[84px] items-center justify-between">

            {/* Left side: Logo */}
            <Link to="/" className="flex items-center gap-3 transition-opacity duration-300 hover:opacity-80">
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
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6]">
                  <ShoppingBag className="h-6 w-6 text-white" />
                </div>
              )}
              <div className="flex flex-col leading-none">
                <span className="text-lg font-bold tracking-tight text-[#111111] sm:text-xl">
                  {brandName}
                </span>
                <span className="mt-1 text-[14px] font-semibold uppercase tracking-[0.2em] text-black sm:text-[10px]">
                  {brandSubtitle}
                </span>
              </div>
            </Link>

            {/* Centre: Desktop Nav — Home | Products | Contact | Pricing */}
            {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav ? (
              <nav className="hidden lg:flex items-center rounded-full border border-black/6 bg-white/70 px-3 py-2 shadow-[0_4px_18px_rgba(0,0,0,0.03)] backdrop-blur-sm">
                {NAV_ITEMS.map((item) => {
                  const active = isNavActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`rounded-full px-5 py-2.5 text-[16px] font-bold transition-all duration-300 ${
                        active
                          ? 'bg-[#111111] text-white shadow-sm'
                          : 'text-[#555] hover:bg-black/5 hover:text-[#111111]'
                      }`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
                {canOpenInventory && (
                  <Link
                    to="/dashboard/inventory"
                    className={`group inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[16px] font-bold transition-all duration-300 ${
                      pathname.startsWith('/dashboard/inventory')
                        ? 'bg-[#111111] text-white shadow-sm'
                        : 'text-[#555] hover:bg-black/5 hover:text-[#111111]'
                    }`}
                  >
                    <Package className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                    Inventory
                  </Link>
                )}
                {user && !isCustomerAccountRole(user.role) && (
                  <Link
                    to="/pos"
                    state={{ fromDashboard: pathname }}
                    className={`rounded-full px-5 py-2.5 text-[16px] font-bold transition-all duration-300 ${
                      pathname === '/pos'
                        ? 'bg-[#111111] text-white shadow-sm'
                        : 'text-[#555] hover:bg-black/5 hover:text-[#111111]'
                    }`}
                  >
                    POS
                  </Link>
                )}
              </nav>
            ) : (
              <div className="hidden lg:block" aria-hidden="true" />
            )}

            {/* Right side: Search | Wishlist | Cart | Sign In */}
            <div className="flex items-center gap-1.5 min-[375px]:gap-2 sm:gap-3 lg:gap-4">
              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav && (
                <>
                  {/* Search Icon */}
                  <Link
                    to="/products"
                    className="hidden sm:flex h-11 w-11 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] shadow-[0_4px_14px_rgba(0,0,0,0.03)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
                    aria-label="Search"
                  >
                    <Search className="h-5 w-5" />
                  </Link>

                  {/* Wishlist Icon */}
                  <Link
                    to="/account/wishlist"
                    className="relative hidden sm:flex h-11 w-11 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] shadow-[0_4px_14px_rgba(0,0,0,0.03)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
                    aria-label="Wishlist"
                  >
                    <Heart className="h-5 w-5" />
                  </Link>

                  {/* Cart Icon */}
                  <Link
                    to="/cart"
                    className="relative hidden sm:flex h-11 w-11 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] shadow-[0_4px_14px_rgba(0,0,0,0.03)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
                    aria-label="Cart"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C4973F] px-1 text-[10px] font-bold text-black shadow-sm">
                      {cartCount}
                    </span>
                  </Link>
                </>
              )}

              {/* Desktop Auth */}
              {user ? (
                <div className="hidden sm:flex items-center gap-3">
                  <Link
                    to={accountHomeHref}
                    className="flex items-center gap-3 rounded-full border border-black/8 bg-white/70 px-3 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.03)] backdrop-blur-sm transition-all duration-300 hover:bg-white"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-sm font-bold text-white">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-col items-start">
                      <span className="max-w-[110px] truncate text-sm font-semibold text-[#111111]">
                        {user.name}
                      </span>
                      <span
                        className={`max-w-[140px] truncate text-[10px] font-bold uppercase tracking-wide ${
                          user.role === 'super_admin'
                            ? 'text-violet-800'
                            : user.role === 'admin'
                              ? 'text-amber-900'
                              : 'text-stone-500'
                        }`}
                      >
                        {accountRoleBadgeText(user.role) || 'User'}
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="text-sm font-semibold text-[#666] transition-colors hover:text-[#111111]"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-3">
                  <Link
                    to="/login"
                    className="rounded-full bg-gradient-to-r from-[#C4973F] to-[#E6C200] px-6 py-2.5 text-sm font-bold text-[#111] shadow-[0_4px_15px_rgba(196,151,63,0.25)] transition-all duration-300 hover:scale-105 hover:shadow-[0_8px_25px_rgba(196,151,63,0.35)] active:scale-[0.98]"
                  >
                    Sign In
                  </Link>
                </div>
              )}

              {/* Mobile Action Icons */}
              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav && (
                <>
                  <Link
                    to="/products"
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] backdrop-blur-sm transition-all duration-300 hover:bg-white sm:hidden"
                    aria-label="Search"
                  >
                    <Search className="h-4.5 w-4.5" />
                  </Link>
                  <Link
                    to="/account/wishlist"
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] backdrop-blur-sm transition-all duration-300 hover:bg-white sm:hidden"
                    aria-label="Wishlist"
                  >
                    <Heart className="h-4.5 w-4.5" />
                  </Link>
                  <Link
                    to="/cart"
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] backdrop-blur-sm transition-all duration-300 hover:bg-white sm:hidden"
                    aria-label="Cart"
                  >
                    <ShoppingCart className="h-4.5 w-4.5" />
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#C4973F] px-1 text-[9px] font-bold text-black">
                      {cartCount}
                    </span>
                  </Link>
                </>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] backdrop-blur-sm transition-all duration-300 hover:bg-white lg:hidden"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="absolute left-0 w-full border-t border-black/8 bg-[#f7f6f2]/95 backdrop-blur-xl lg:hidden">
            <div className="mx-auto max-w-[88rem] px-4 pb-6 pt-5 sm:px-6">
              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav ? (
                <nav className="flex flex-col gap-2">
                  {NAV_ITEMS.map((item) => {
                    const active = isNavActive(item.href);
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={closeMobileMenu}
                        className={`rounded-2xl border px-5 py-4 text-lg font-semibold transition-all duration-300 ${
                          active
                            ? 'border-black/10 bg-[#111111] text-white shadow-sm'
                            : 'border-transparent bg-white/60 text-[#111111] hover:border-black/8 hover:bg-white'
                        }`}
                      >
                        {item.name}
                      </Link>
                    );
                  })}

                  {canOpenInventory && (
                    <Link
                      to="/dashboard/inventory"
                      onClick={closeMobileMenu}
                      className={`group inline-flex items-center gap-2 rounded-2xl border px-5 py-4 text-lg font-semibold transition-all duration-300 ${
                        pathname.startsWith('/dashboard/inventory')
                          ? 'border-black/10 bg-[#111111] text-white shadow-sm'
                          : 'border-transparent bg-white/60 text-[#111111] hover:border-black/8 hover:bg-white'
                      }`}
                    >
                      <Package className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                      Inventory
                    </Link>
                  )}
                  {user && !isCustomerAccountRole(user.role) && (
                    <Link
                      to="/pos"
                      state={{ fromDashboard: pathname }}
                      onClick={closeMobileMenu}
                      className={`rounded-2xl border px-5 py-4 text-lg font-semibold transition-all duration-300 ${
                        pathname === '/pos'
                          ? 'border-black/10 bg-[#111111] text-white shadow-sm'
                          : 'border-transparent bg-white/60 text-[#111111] hover:border-black/8 hover:bg-white'
                      }`}
                    >
                      POS
                    </Link>
                  )}
                </nav>
              ) : null}

              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav ? <div className="my-5 h-px bg-black/8" /> : null}

              {user ? (
                <div className="flex flex-col gap-3">
                  <Link
                    to={accountHomeHref}
                    onClick={closeMobileMenu}
                    className="flex items-center gap-3 rounded-2xl border border-black/8 bg-white px-4 py-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-sm font-bold text-white">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-black/45">
                        {isStaffRole(user.role) ? 'Dashboard' : 'Account'}
                      </span>
                      <span className="text-base font-semibold text-[#111111]">
                        {user.name}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          user.role === 'super_admin'
                            ? 'text-violet-800'
                            : user.role === 'admin'
                              ? 'text-amber-900'
                              : 'text-stone-500'
                        }`}
                      >
                        {accountRoleSubtitle(user.role)}
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-left text-base font-semibold text-red-600 transition-all duration-300 hover:bg-red-100"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link
                    to="/login"
                    onClick={closeMobileMenu}
                    className="rounded-2xl bg-gradient-to-r from-[#C4973F] to-[#E6C200] px-5 py-4 text-center text-base font-bold text-[#111] shadow-[0_4px_12px_rgba(196,151,63,0.2)] transition-all duration-300 active:scale-[0.98]"
                  >
                    Sign In
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}