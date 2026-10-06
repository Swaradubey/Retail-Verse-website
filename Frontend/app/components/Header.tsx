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

const PUBLIC_NAV_ITEMS = [
  { name: 'Home', href: '/' },
  { name: 'Products', href: '/products' },
  { name: 'Blogs', href: '/blogs' },
  { name: 'Pricing', href: '/pricing' },
  { name: 'Contact', href: '/contact' },
];

export function Header() {
  const { pathname } = useLocation();
  const { cartCount } = useCart();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const isDashboardRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/super-admin');
  const navItems = isDashboardRoute
    ? PUBLIC_NAV_ITEMS.filter((item) => item.name !== 'Blogs' && item.name !== 'Pricing')
    : PUBLIC_NAV_ITEMS;

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
    if (href === '/blogs' || href === '/blog') {
      return pathname === '/blogs' || pathname.startsWith('/blogs') || pathname === '/blog' || pathname.startsWith('/blog');
    }
    if (href === '/pricing') {
      return pathname === '/pricing' || pathname === '/subscription';
    }
    return pathname === href;
  };

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-[#2563EB]/40 bg-[#0B1F3A] backdrop-blur-xl">
        <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
          <div className="flex h-[84px] items-center justify-between">

            {/* Left side: Logo */}
            <Link to="/" className="flex items-center gap-3 transition-opacity duration-300 hover:opacity-90">
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
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF6B00] text-[#F8FAFC]">
                  <ShoppingBag className="h-6 w-6" />
                </div>
              )}
              <div className="flex flex-col leading-none">
                <span className="text-lg font-bold tracking-tight text-[#F8FAFC] sm:text-xl">
                  {brandName}
                </span>
                <span className="mt-1 text-[14px] font-semibold uppercase tracking-[0.2em] text-[#2563EB] sm:text-[10px]">
                  {brandSubtitle}
                </span>
              </div>
            </Link>

            {/* Centre: Desktop Nav */}
            {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav ? (
              <nav className="hidden lg:flex items-center rounded-full border border-[#2563EB] bg-[#0B1F3A] px-3 py-2">
                {navItems.map((item) => {
                  const active = isNavActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`rounded-full px-5 py-2.5 text-[16px] font-bold transition-all duration-300 ${
                        active
                          ? 'bg-[#2563EB] text-[#F8FAFC]'
                          : 'text-[#F8FAFC] hover:text-[#FF6B00]'
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
                        ? 'bg-[#2563EB] text-[#F8FAFC]'
                        : 'text-[#F8FAFC] hover:text-[#FF6B00]'
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
                        ? 'bg-[#2563EB] text-[#F8FAFC]'
                        : 'text-[#F8FAFC] hover:text-[#FF6B00]'
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
                    className="hidden sm:flex h-11 w-11 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#2563EB] transition-all duration-300 hover:bg-[#2563EB] hover:text-[#F8FAFC]"
                    aria-label="Search"
                  >
                    <Search className="h-5 w-5" />
                  </Link>

                  {/* Wishlist Icon */}
                  <Link
                    to="/account/wishlist"
                    className="relative hidden sm:flex h-11 w-11 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#2563EB] transition-all duration-300 hover:bg-[#2563EB] hover:text-[#F8FAFC]"
                    aria-label="Wishlist"
                  >
                    <Heart className="h-5 w-5" />
                  </Link>

                  {/* Cart Icon */}
                  <Link
                    to="/cart"
                    className="relative hidden sm:flex h-11 w-11 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#2563EB] transition-all duration-300 hover:bg-[#2563EB] hover:text-[#F8FAFC]"
                    aria-label="Cart"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FF6B00] px-1 text-[10px] font-bold text-[#F8FAFC]">
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
                    className="flex items-center gap-3 rounded-full border border-[#2563EB] bg-[#0B1F3A] px-3 py-2 transition-all duration-300 hover:border-[#FF6B00]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563EB] text-sm font-bold text-[#F8FAFC]">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-col items-start">
                      <span className="max-w-[110px] truncate text-sm font-semibold text-[#F8FAFC]">
                        {user.name}
                      </span>
                      <span className="max-w-[140px] truncate text-[10px] font-bold uppercase tracking-wide text-[#FF6B00]">
                        {accountRoleBadgeText(user.role) || 'User'}
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="text-sm font-semibold text-[#F8FAFC] transition-colors hover:text-[#FF6B00]"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-3">
                  <Link
                    to="/login"
                    className="rounded-full bg-[#FF6B00] border border-[#FF6B00] px-6 py-2.5 text-sm font-bold text-[#F8FAFC] transition-all duration-300 hover:bg-[#FF6B00]/90 active:scale-[0.98]"
                  >
                    Sign In
                  </Link>
                </div>
              )}

              {/* Mobile Action Icons */}
              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav && (
                <Link
                  to="/cart"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#2563EB] transition-all duration-300 hover:bg-[#2563EB] hover:text-[#F8FAFC] sm:hidden"
                  aria-label="Cart"
                >
                  <ShoppingCart className="h-4.5 w-4.5" />
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FF6B00] px-1 text-[9px] font-bold text-[#F8FAFC]">
                    {cartCount}
                  </span>
                </Link>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2563EB] bg-[#0B1F3A] text-[#F8FAFC] transition-all duration-300 hover:bg-[#2563EB] lg:hidden"
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
          <div className="absolute left-0 w-full border-t border-[#2563EB] bg-[#0B1F3A] lg:hidden z-50">
            <div className="mx-auto max-w-[88rem] px-4 pb-6 pt-5 sm:px-6">
              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav ? (
                <nav className="flex flex-col gap-2">
                  {navItems.map((item) => {
                    const active = isNavActive(item.href);
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={closeMobileMenu}
                        className={`rounded-2xl border px-5 py-4 text-lg font-semibold transition-all duration-300 ${
                          active
                            ? 'border-[#2563EB] bg-[#2563EB] text-[#F8FAFC]'
                            : 'border-transparent bg-[#0B1F3A] text-[#F8FAFC] hover:border-[#2563EB]'
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
                          ? 'border-[#2563EB] bg-[#2563EB] text-[#F8FAFC]'
                          : 'border-transparent bg-[#0B1F3A] text-[#F8FAFC] hover:border-[#2563EB]'
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
                          ? 'border-[#2563EB] bg-[#2563EB] text-[#F8FAFC]'
                          : 'border-transparent bg-[#0B1F3A] text-[#F8FAFC] hover:border-[#2563EB]'
                      }`}
                    >
                      POS
                    </Link>
                  )}
                </nav>
              ) : null}

              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav ? <div className="my-5 h-px bg-[#2563EB]/40" /> : null}

              {user ? (
                <div className="flex flex-col gap-3">
                  <Link
                    to={accountHomeHref}
                    onClick={closeMobileMenu}
                    className="flex items-center gap-3 rounded-2xl border border-[#2563EB] bg-[#0B1F3A] px-4 py-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563EB] text-sm font-bold text-[#F8FAFC]">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-[#2563EB]">
                        {isStaffRole(user.role) ? 'Dashboard' : 'Account'}
                      </span>
                      <span className="text-base font-semibold text-[#F8FAFC]">
                        {user.name}
                      </span>
                      <span className="text-xs font-semibold text-[#FF6B00]">
                        {accountRoleSubtitle(user.role)}
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="rounded-2xl border border-[#FF6B00] bg-[#FF6B00] px-4 py-4 text-left text-base font-semibold text-[#F8FAFC] transition-all duration-300 hover:bg-[#FF6B00]/90"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link
                    to="/login"
                    onClick={closeMobileMenu}
                    className="rounded-2xl bg-[#FF6B00] border border-[#FF6B00] px-5 py-4 text-center text-base font-bold text-[#F8FAFC] transition-all duration-300 active:scale-[0.98]"
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