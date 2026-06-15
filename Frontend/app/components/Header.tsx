import { Link, useNavigate } from 'react-router';
import { ShoppingCart, Menu, X, ArrowRight, Package, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { canAccessInventoryEditor } from '../utils/inventoryPermissions';
import { accountRoleBadgeText, accountRoleSubtitle, isCustomerAccountRole, isStaffRole, isSuperAdminRole, normalizeRole } from '../utils/staffRoles';

const HIDDEN_HEADER_ROLES = [
  'employee',
  'seo_manager',
  'inventory_manager',
];

export function Header() {
  const { cartCount } = useCart();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  /** Hide storefront nav links (Products, Category, etc.) for Super Admin and restricted employee roles. */
  const normalizedRole = normalizeRole(user?.role);
  const shouldHideHeaderNav = normalizedRole && HIDDEN_HEADER_ROLES.includes(normalizedRole);
  const hideStorefrontNavForSuperAdmin = Boolean(user && isSuperAdminRole(user.role));

  /** Dynamic brand name: client sees their own business name, super_admin sees "Retail Verse" */
  const isSuperAdmin = user?.role === 'super_admin';
  const isClientUser = user?.role === 'client';
  const brandName = !user
    ? 'Retail Verse'
    : isSuperAdmin
      ? 'Retail Verse'
      : isClientUser && user.businessName
        ? user.businessName
        : 'Retail Verse';
  const brandSubtitle = !user
    ? 'Premium Commerce'
    : isSuperAdmin
      ? 'Premium Commerce'
      : isClientUser
        ? 'Store'
        : 'Premium Commerce';

  /** Pricing link is now disabled globally per requirement. */
  const hidePricing = true;

  const canOpenInventory = canAccessInventoryEditor(user?.role);
  const accountHomeHref = '/dashboard';

  const handleLogout = () => {
    logout();
    navigate('/');
    setMobileMenuOpen(false);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-black/[0.06] bg-[#FCFBF8]/88 backdrop-blur-xl">
        <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
          <div className="flex h-[84px] items-center justify-between">


            <Link to="/" className="flex items-center gap-3 transition-opacity duration-300 hover:opacity-80">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6]">
                <ShoppingBag className="h-6 w-6 text-white" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-lg font-bold tracking-tight text-[#111111] sm:text-xl">
                  {brandName}
                </span>
                <span className="mt-1 text-[14px] font-semibold uppercase tracking-[0.2em] text-black sm:text-[10px]">
                  {brandSubtitle}
                </span>
              </div>
            </Link>

          {/* Desktop Nav — hidden for Super Admin and restricted employee roles */}
          {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav ? (
            <nav className="hidden lg:flex items-center rounded-full border border-black/6 bg-white/70 px-3 py-2 shadow-[0_4px_18px_rgba(0,0,0,0.03)] backdrop-blur-sm">
              <Link
                to="/shop"
                className="rounded-full px-5 py-2.5 text-[16px] font-bold text-[#555] transition-all duration-300 hover:bg-black/5 hover:text-[#111111]"
              >
                Products
              </Link>
              <Link
                to="/shop?category=Resources"
                className="rounded-full px-5 py-2.5 text-[16px] font-bold text-[#555] transition-all duration-300 hover:bg-black/5 hover:text-[#111111]"
              >
                Category
              </Link>
              {!hidePricing && (
                <Link
                  to="/shop?category=Pricing"
                  className="rounded-full px-5 py-2.5 text-[16px] font-bold text-[#555] transition-all duration-300 hover:bg-black/5 hover:text-[#111111]"
                >
                  Pricing
                </Link>
              )}
              {canOpenInventory && (
                <Link
                  to="/dashboard/inventory"
                  className="group inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[16px] font-bold text-[#555] transition-all duration-300 hover:bg-black/5 hover:text-[#111111]"
                >
                  <Package className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                  Inventory
                </Link>
              )}
              {user && !isCustomerAccountRole(user.role) && (
                <Link
                  to="/pos"
                  className="rounded-full px-5 py-2.5 text-[16px] font-bold text-[#555] transition-all duration-300 hover:bg-black/5 hover:text-[#111111]"
                >
                  POS
                </Link>
              )}
              <Link
                to="/contact"
                className="rounded-full px-5 py-2.5 text-[16px] font-bold text-[#555] transition-all duration-300 hover:bg-black/5 hover:text-[#111111]"
              >
                Contact
              </Link>
            </nav>
          ) : (
            <div className="hidden lg:block" aria-hidden="true" />
          )}

           {/* Right Actions */}
           <div className="flex items-center gap-1.5 min-[375px]:gap-2 sm:gap-3 lg:gap-4">
{/* Cart - hidden for Super Admin and restricted employee roles */}
              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav && (
                <Link
                  to="/cart"
                  className="relative hidden sm:flex h-11 w-11 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] shadow-[0_4px_14px_rgba(0,0,0,0.03)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {cartCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C4973F] px-1 text-[10px] font-bold text-black shadow-sm">
                      {cartCount}
                    </span>
                  )}
                </Link>
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
                      className={`max-w-[140px] truncate text-[10px] font-bold uppercase tracking-wide ${user.role === 'super_admin'
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
              <div className="hidden sm:flex items-center gap-4">
                <Link
                  to="/login"
                  className="rounded-full bg-gradient-to-r from-[#C4973F] to-[#E6C200] px-6 py-2.5 text-sm font-bold text-[#111] shadow-[0_4px_15px_rgba(196,151,63,0.25)] transition-all duration-300 hover:scale-105 hover:shadow-[0_8px_25px_rgba(196,151,63,0.35)] active:scale-[0.98]"
                >
                  Login
                </Link>

                <Link
                  to="/register"
                  className="group inline-flex items-center gap-2 rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-black"
                >
                  Get started
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>
            )}

{/* Mobile Cart - hidden for Super Admin and restricted employee roles */}
              {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav && (
                <Link
                  to="/cart"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/70 text-[#111111] backdrop-blur-sm transition-all duration-300 hover:bg-white sm:hidden"
                >
                  <ShoppingCart className="h-4.5 w-4.5" />
                  {cartCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#C4973F] px-1 text-[9px] font-bold text-black">
                      {cartCount}
                    </span>
                  )}
                </Link>
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
                <Link
                  to="/shop"
                  onClick={closeMobileMenu}
                  className="rounded-2xl border border-transparent bg-white/60 px-5 py-4 text-lg font-semibold text-[#111111] transition-all duration-300 hover:border-black/8 hover:bg-white"
                >
                  Products
                </Link>

                <Link
                  to="/shop?category=Resources"
                  onClick={closeMobileMenu}
                  className="rounded-2xl border border-transparent bg-white/60 px-5 py-4 text-lg font-semibold text-[#111111] transition-all duration-300 hover:border-black/8 hover:bg-white"
                >
                  Resources
                </Link>

                {!hidePricing && (
                  <Link
                    to="/shop?category=Pricing"
                    onClick={closeMobileMenu}
                    className="rounded-2xl border border-transparent bg-white/60 px-5 py-4 text-lg font-semibold text-[#111111] transition-all duration-300 hover:border-black/8 hover:bg-white"
                  >
                    Pricing
                  </Link>
                )}

                {canOpenInventory && (
                  <Link
                    to="/dashboard/inventory"
                    onClick={closeMobileMenu}
                    className="group inline-flex items-center gap-2 rounded-2xl border border-transparent bg-white/60 px-5 py-4 text-lg font-semibold text-[#111111] transition-all duration-300 hover:border-black/8 hover:bg-white"
                  >
                    <Package className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                    Inventory
                  </Link>
                )}
                {user && !isCustomerAccountRole(user.role) && (
                  <Link
                    to="/pos"
                    onClick={closeMobileMenu}
                    className="rounded-2xl border border-transparent bg-white/60 px-5 py-4 text-lg font-semibold text-[#111111] transition-all duration-300 hover:border-black/8 hover:bg-white"
                  >
                    POS
                  </Link>
                )}

                <Link
                  to="/contact"
                  onClick={closeMobileMenu}
                  className="rounded-2xl border border-transparent bg-white/60 px-5 py-4 text-lg font-semibold text-[#111111] transition-all duration-300 hover:border-black/8 hover:bg-white"
                >
                  Contact
                </Link>
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
                      className={`text-xs font-semibold ${user.role === 'super_admin'
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
                  Login
                </Link>

                <Link
                  to="/register"
                  onClick={closeMobileMenu}
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111111] px-5 py-4 text-base font-semibold text-white transition-all duration-300 hover:bg-black"
                >
                  Get started
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </header >
  );
}