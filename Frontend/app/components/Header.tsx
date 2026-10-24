import { Link, useNavigate, useLocation } from 'react-router';
import { 
  ShoppingCart, 
  Menu, 
  X, 
  Search, 
  Heart, 
  Bell, 
  ChevronDown, 
  Package, 
  User as UserIcon, 
  Store, 
  Tag, 
  HelpCircle, 
  LogOut, 
  LayoutDashboard,
  ExternalLink
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useState, useEffect, useRef, useMemo, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useDynamicCategories } from '../hooks/useDynamicCategories';
import { canAccessInventoryEditor } from '../utils/inventoryPermissions';
import { 
  accountRoleBadgeText, 
  accountRoleSubtitle, 
  isCustomerAccountRole, 
  isStaffRole, 
  isSuperAdminRole, 
  normalizeRole 
} from '../utils/staffRoles';
import { getFullImageUrl } from '../utils/imageUrl';

const HIDDEN_HEADER_ROLES = [
  'employee',
  'seo_manager',
  'inventory_manager',
];

export function Header() {
  const { pathname, search } = useLocation();
  const { cartCount } = useCart();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { categoryOptions, rawCategories } = useDynamicCategories();

  // Search & Navigation States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Dropdown States
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [watchlistDropdownOpen, setWatchlistDropdownOpen] = useState(false);

  // Dropdown Refs for Click Outside
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const watchlistDropdownRef = useRef<HTMLDivElement>(null);

  // Sync search input if URL contains ?q= or ?search= or ?category=
  useEffect(() => {
    const params = new URLSearchParams(search);
    const q = params.get('q') || params.get('search') || '';
    const cat = params.get('category') || '';
    if (q) setSearchQuery(q);
    if (!cat || cat === 'All' || cat === 'All Categories' || cat === 'All Products') {
      setSelectedCategory('');
    } else {
      const match = rawCategories.find((c) => c.toLowerCase() === cat.toLowerCase());
      setSelectedCategory(match || cat);
    }
  }, [search, rawCategories]);

  // Click outside listener for dropdown menus
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
      if (watchlistDropdownRef.current && !watchlistDropdownRef.current.contains(event.target as Node)) {
        setWatchlistDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  /** Hide storefront nav links for Super Admin and restricted employee roles. */
  const normalizedRole = normalizeRole(user?.role);
  const shouldHideHeaderNav = normalizedRole && HIDDEN_HEADER_ROLES.includes(normalizedRole);
  const hideStorefrontNavForSuperAdmin = Boolean(user && isSuperAdminRole(user.role));

  /** Dynamic brand name & logo handling */
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
    setUserDropdownOpen(false);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Search submission handler
  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    if (
      selectedCategory &&
      selectedCategory !== 'All Categories' &&
      selectedCategory !== 'All' &&
      selectedCategory !== 'All Products' &&
      selectedCategory.trim() !== ''
    ) {
      params.set('category', selectedCategory);
    }
    const queryStr = params.toString();
    navigate(queryStr ? `/shop?${queryStr}` : '/shop');
  };

  const primaryNavCategories = useMemo(() => {
    if (categoryOptions.length > 0) {
      const dynamicNav = categoryOptions.slice(0, 7).map((cat) => ({
        name: cat.label,
        href: `/shop?category=${encodeURIComponent(cat.value)}`,
      }));
      return [
        ...dynamicNav,
        { name: 'Deals', href: '/shop?sale=true', isBadge: true },
        { name: 'Stores', href: '/products' },
      ];
    }
    return [
      { name: 'Deals', href: '/shop?sale=true', isBadge: true },
      { name: 'Stores', href: '/products' },
    ];
  }, [categoryOptions]);

  const isNavActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || pathname === '/landing';
    }
    return pathname === href || (href.includes('?') && pathname + search === href);
  };

  return (
    <header className="sticky top-0 z-50 bg-white font-sans text-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      {/* ──────────────────────────────────────────────────────────────────
          1. TOP UTILITY BAR (eBay Classic Style)
      ────────────────────────────────────────────────────────────────── */}
      <div className="border-b border-[#E5E7EB] bg-white text-[12px] text-[#555555]">
        <div className="mx-auto flex h-9 max-w-[88rem] items-center justify-between px-3 sm:px-6 lg:px-8">
          
          {/* Left Side: Greeting & Sign in / Register + Quick Utility Links */}
          {/* Left Side: Utility Links */}
          <div className="flex items-center gap-3 sm:gap-4 truncate">
            {/* Daily Deals */}
            <Link
              to="/shop?sale=true"
              className="inline-flex items-center gap-1 text-[#555555] hover:text-[#0654ba] hover:underline transition-colors"
            >
              Daily Deals
            </Link>

            <span className="text-[#D1D5DB]">|</span>

            {/* Help & Contact */}
            <Link
              to="/contact"
              className="inline-flex items-center gap-1 text-[#555555] hover:text-[#0654ba] hover:underline transition-colors"
            >
              Help & Contact
            </Link>
          </div>

          {/* Right Side: Sell | Watchlist | My Retailverse | Bell | Cart */}
          <div className="flex items-center gap-3 sm:gap-5">
            {/* Sell Link */}
            <Link
              to={user ? "/dashboard" : "/login"}
              className="text-[#555555] hover:text-[#0654ba] hover:underline transition-colors"
            >
              Sell
            </Link>

            {/* Watchlist Dropdown */}
            <div className="relative hidden min-[480px]:inline-block" ref={watchlistDropdownRef}>
              <Link
                to="/account/wishlist"
                onMouseEnter={() => setWatchlistDropdownOpen(true)}
                className="flex items-center gap-0.5 text-[#555555] hover:text-[#0654ba] hover:underline transition-colors py-1"
              >
                <span>Watchlist</span>
                <ChevronDown className="h-3 w-3 text-[#707070]" />
              </Link>

              {watchlistDropdownOpen && (
                <div
                  onMouseLeave={() => setWatchlistDropdownOpen(false)}
                  className="absolute right-0 mt-1 w-52 rounded-md border border-[#E5E7EB] bg-white p-3 shadow-lg z-50 text-xs"
                >
                  <p className="font-semibold text-gray-800 mb-1">Your Watchlist</p>
                  <p className="text-[#707070] mb-2.5">Track products you love and get notified on price drops.</p>
                  <Link
                    to="/account/wishlist"
                    onClick={() => setWatchlistDropdownOpen(false)}
                    className="block text-center rounded bg-[#3665f3] py-1.5 font-bold text-white hover:bg-[#2b52cc] transition-colors"
                  >
                    View All Items
                  </Link>
                </div>
              )}
            </div>



            {/* Notification Bell */}
            <Link
              to={user ? "/dashboard/inbox" : "/login"}
              className="relative p-1 text-[#555555] hover:text-[#0654ba] transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </Link>

            {/* Cart Icon with Counter */}
            <Link
              to="/cart"
              className="relative flex items-center p-1 text-[#555555] hover:text-[#0654ba] transition-colors"
              aria-label={`Cart with ${cartCount} items`}
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[17px] items-center justify-center rounded-full bg-[#E53238] px-1 text-[10px] font-bold text-white ring-1 ring-white">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          2. MAIN HEADER BAR (eBay Brand & Search Row)
      ────────────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[88rem] px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5">
        <div className="flex items-center gap-3 sm:gap-5 lg:gap-6">
          
          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[#E5E7EB] text-[#111827] hover:bg-gray-100 lg:hidden shrink-0"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Left side: Logo */}
          <Link to="/" className="flex items-center gap-3 transition-opacity duration-300 hover:opacity-90 shrink-0">
            {logoUrl ? (
              <div className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-full bg-white/10 border-2 border-[#2563EB]/50 overflow-hidden flex items-center justify-center shadow-lg shadow-[#2563EB]/10">
                <img
                  src={getFullImageUrl(logoUrl)}
                  alt={`${brandName} logo`}
                  className="h-9 w-9 sm:h-10 sm:w-10 object-contain rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).onerror = null;
                    (e.target as HTMLImageElement).src = '/logo.png';
                  }}
                />
              </div>
            ) : (
              <div className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-full bg-white/10 border-2 border-[#2563EB]/50 overflow-hidden flex items-center justify-center shadow-lg shadow-[#2563EB]/10">
                <img
                  src="/logo.png"
                  alt={`${brandName} logo`}
                  className="h-9 w-9 sm:h-10 sm:w-10 object-contain rounded-full"
                />
              </div>
            )}
            <div className="flex flex-col leading-none">
              <span className="text-lg font-bold tracking-tight text-[#111827] sm:text-xl">
                {brandName}
              </span>
              <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2563EB] sm:text-[10px]">
                {brandSubtitle}
              </span>
            </div>
          </Link>

          {/* Center: Prominent eBay-Style Search Bar */}
          <div className="flex-1 min-w-0 max-w-4xl">
            <form onSubmit={handleSearchSubmit} className="flex items-center w-full">
              <div className="flex flex-1 items-center rounded-l-[4px] sm:rounded-l-[4px] border-2 border-r-0 border-[#111827] focus-within:border-[#3665f3] bg-white h-10 sm:h-11 transition-colors">
                
                {/* Search icon */}
                <div className="pl-3 pr-2 text-[#707070] hidden sm:flex items-center pointer-events-none">
                  <Search className="h-4.5 w-4.5" />
                </div>

                {/* Input text */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for anything..."
                  className="w-full h-full px-3 text-[14px] sm:text-[15px] text-[#111827] placeholder-[#707070] bg-transparent outline-none border-none"
                  aria-label="Search for products, brands, and categories"
                />

                {/* Category Dropdown Selector (eBay Style) */}
                <div className="relative hidden md:flex items-center border-l border-gray-200 h-full pr-2 shrink-0">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="h-full pl-2.5 pr-6 text-[13px] font-normal text-[#555555] bg-transparent outline-none cursor-pointer appearance-none hover:text-[#111827]"
                    aria-label="Select search category"
                  >
                    <option value="">All Categories</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-[#707070] absolute right-2 pointer-events-none" />
                </div>
              </div>

              {/* Bold eBay High-Contrast Blue Search Button */}
              <button
                type="submit"
                className="h-10 sm:h-11 px-5 sm:px-8 bg-[#3665F3] hover:bg-[#2B52CC] active:bg-[#2042A8] text-white font-bold text-[14px] sm:text-[15px] rounded-r-[4px] transition-colors shrink-0 flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Search className="h-4 w-4 sm:hidden" />
                <span>Search</span>
              </button>

              {/* Right: "Advanced" search text link */}
              <Link
                to="/shop"
                className="hidden xl:inline-block ml-3 text-[12px] font-normal text-[#555555] hover:text-[#0654ba] hover:underline whitespace-nowrap"
              >
                Advanced
              </Link>
            </form>
          </div>

          {/* Right: Sign In Option right next to Search */}
          <div className="shrink-0 flex items-center">
            {user ? (
              <div className="relative inline-block" ref={userDropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 h-10 sm:h-11 px-3 sm:px-3.5 rounded-[4px] border border-[#E5E7EB] hover:border-[#3665F3] bg-white transition-all shadow-xs"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3665F3] text-xs font-bold text-white shadow-xs">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:flex flex-col text-left leading-tight">
                    <span className="text-[13px] font-bold text-[#111827] max-w-[95px] truncate">
                      {user.name}
                    </span>
                    <span className="text-[10px] font-semibold uppercase text-[#3665F3]">
                      {accountRoleBadgeText(user.role) || 'Account'}
                    </span>
                  </div>
                  <ChevronDown className={`h-3.5 w-3.5 text-[#707070] hidden sm:block transition-transform duration-200 ${userDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* User Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-1.5 w-60 rounded-md border border-[#E5E7EB] bg-white p-2.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] pb-2.5 mb-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3665F3] text-xs font-bold text-white shadow-xs">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-[#111827]">{user.name}</p>
                        <p className="truncate text-[11px] text-[#707070]">{user.email}</p>
                        <span className="inline-block mt-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#3665f3] border border-blue-200/60">
                          {accountRoleBadgeText(user.role) || 'User'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5 text-xs text-[#333333]">
                      <Link
                        to="/account"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2 rounded px-2.5 py-1.5 hover:bg-gray-50 hover:text-[#0654ba]"
                      >
                        <UserIcon className="h-3.5 w-3.5 text-[#707070]" />
                        Account Settings
                      </Link>
                      <Link
                        to={accountHomeHref}
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2 rounded px-2.5 py-1.5 hover:bg-gray-50 hover:text-[#0654ba]"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5 text-[#707070]" />
                        Dashboard
                      </Link>
                      {canOpenInventory && (
                        <Link
                          to="/dashboard/inventory"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2 rounded px-2.5 py-1.5 hover:bg-gray-50 hover:text-[#0654ba]"
                        >
                          <Package className="h-3.5 w-3.5 text-[#707070]" />
                          Inventory Editor
                        </Link>
                      )}
                      {user && !isCustomerAccountRole(user.role) && (
                        <Link
                          to="/pos"
                          state={{ fromDashboard: pathname }}
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2 rounded px-2.5 py-1.5 hover:bg-gray-50 hover:text-[#0654ba]"
                        >
                          <Store className="h-3.5 w-3.5 text-[#707070]" />
                          POS Terminal
                        </Link>
                      )}
                      <div className="my-1 border-t border-[#E5E7EB]" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left font-medium text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="h-3.5 w-3.5 text-red-600" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-11 px-4 sm:px-6 rounded-[4px] bg-[#3665F3] hover:bg-[#2B52CC] active:bg-[#2042A8] text-white font-bold text-sm sm:text-[14px] shadow-sm transition-colors whitespace-nowrap"
              >
                <UserIcon className="h-4 w-4" />
                <span>Sign In</span>
              </Link>
            )}
          </div>

        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          3. BOTTOM CATEGORY NAVIGATION BAR (eBay Clean Horizontal Bar)
      ────────────────────────────────────────────────────────────────── */}
      {!hideStorefrontNavForSuperAdmin && !shouldHideHeaderNav && (
        <div className="border-t border-b border-[#E5E7EB] bg-white">
          <div className="mx-auto max-w-[88rem] px-3 sm:px-6 lg:px-8">
            <nav className="flex items-center justify-between gap-1 overflow-x-auto scrollbar-none py-1.5 sm:py-2 text-[13px]">
              
              {/* Category Links List */}
              <div className="flex items-center gap-1 sm:gap-2 lg:gap-4 shrink-0">
                {primaryNavCategories.map((cat) => {
                  const active = isNavActive(cat.href);
                  return (
                    <Link
                      key={cat.name}
                      to={cat.href}
                      className={`whitespace-nowrap px-2 sm:px-2.5 py-1 font-medium transition-colors duration-150 ${
                        active
                          ? 'text-[#111827] font-bold border-b-2 border-[#111827] -mb-[1px]'
                          : cat.isBadge
                            ? 'text-[#E53238] font-bold hover:underline'
                            : 'text-[#555555] hover:text-[#0654ba] hover:underline'
                      }`}
                    >
                      {cat.name}
                    </Link>
                  );
                })}
              </div>

              {/* Staff / Client Quick Links on Far Right of Category Strip */}
              <div className="hidden lg:flex items-center gap-3 shrink-0 pl-4 border-l border-gray-200 text-xs">
                {canOpenInventory && (
                  <Link
                    to="/dashboard/inventory"
                    className="inline-flex items-center gap-1 font-semibold text-[#555555] hover:text-[#0654ba]"
                  >
                    <Package className="h-3.5 w-3.5" />
                    Inventory
                  </Link>
                )}
                {user && !isCustomerAccountRole(user.role) && (
                  <Link
                    to="/pos"
                    state={{ fromDashboard: pathname }}
                    className="inline-flex items-center gap-1 font-semibold text-[#555555] hover:text-[#0654ba]"
                  >
                    <Store className="h-3.5 w-3.5" />
                    POS
                  </Link>
                )}
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────
          4. RESPONSIVE MOBILE DRAWER / MENU
      ────────────────────────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-[110px] z-50 flex flex-col bg-black/40 lg:hidden backdrop-blur-xs">
          <div className="w-full max-h-[calc(100vh-110px)] overflow-y-auto bg-white border-b border-[#E5E7EB] shadow-2xl p-4 sm:p-6 animate-in slide-in-from-top-2 duration-200">
            
            {/* User Profile Card or Sign In Banner */}
            <div className="mb-5 rounded-lg border border-[#E5E7EB] bg-gray-50 p-4">
              {user ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3665f3] font-bold text-white text-base">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-[#111827]">{user.name}</p>
                      <p className="text-xs text-[#707070]">{user.email}</p>
                      <span className="inline-block mt-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#3665f3]">
                        {accountRoleBadgeText(user.role) || 'User'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 text-center">
                  <p className="text-sm font-semibold text-[#111827]">Welcome to Retailverse</p>
                  <div className="flex gap-2">
                    <Link
                      to="/login"
                      onClick={closeMobileMenu}
                      className="flex-1 rounded-md bg-[#3665f3] py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#2b52cc]"
                    >
                      Sign In
                    </Link>
                    <Link
                      to="/register"
                      onClick={closeMobileMenu}
                      className="flex-1 rounded-md border border-[#3665f3] bg-white py-2.5 text-sm font-bold text-[#3665f3] hover:bg-blue-50"
                    >
                      Register
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Category Select */}
            <div className="mb-4">
              <label htmlFor="mobile-cat-select" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Browse Categories
              </label>
              <div className="grid grid-cols-2 gap-2">
                {primaryNavCategories.map((cat) => (
                  <Link
                    key={cat.name}
                    to={cat.href}
                    onClick={closeMobileMenu}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-800 hover:border-[#3665f3] hover:text-[#3665f3] hover:bg-blue-50/50"
                  >
                    <span>{cat.name}</span>
                    {cat.isBadge && (
                      <span className="rounded bg-red-100 px-1 text-[10px] font-bold text-red-600">
                        HOT
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div className="border-t border-[#E5E7EB] pt-4 flex flex-col gap-2 text-sm text-gray-700">
              <Link
                to="/account/wishlist"
                onClick={closeMobileMenu}
                className="flex items-center gap-2.5 py-1.5 hover:text-[#3665f3]"
              >
                <Heart className="h-4 w-4 text-[#707070]" />
                Watchlist & Saved Items
              </Link>
              <Link
                to={user ? "/dashboard" : "/login"}
                onClick={closeMobileMenu}
                className="flex items-center gap-2.5 py-1.5 hover:text-[#3665f3]"
              >
                <Tag className="h-4 w-4 text-[#707070]" />
                Sell on Retailverse
              </Link>
              <Link
                to="/contact"
                onClick={closeMobileMenu}
                className="flex items-center gap-2.5 py-1.5 hover:text-[#3665f3]"
              >
                <HelpCircle className="h-4 w-4 text-[#707070]" />
                Help & Contact
              </Link>
              {canOpenInventory && (
                <Link
                  to="/dashboard/inventory"
                  onClick={closeMobileMenu}
                  className="flex items-center gap-2.5 py-1.5 font-semibold text-[#3665f3]"
                >
                  <Package className="h-4 w-4" />
                  Inventory Management
                </Link>
              )}
              {user && !isCustomerAccountRole(user.role) && (
                <Link
                  to="/pos"
                  state={{ fromDashboard: pathname }}
                  onClick={closeMobileMenu}
                  className="flex items-center gap-2.5 py-1.5 font-semibold text-[#3665f3]"
                >
                  <Store className="h-4 w-4" />
                  POS Billing
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}