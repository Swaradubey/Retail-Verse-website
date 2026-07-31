import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { Heart, LogOut, Store, Package, ShoppingCart, Truck, LayoutDashboard, Mic } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isInventoryManagerRole, isCustomerAccountRole } from '../utils/staffRoles';
import { Footer } from '../components/Footer';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
} from '../components/ui/sidebar';

const accountNav = [
  { title: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
  { title: 'Wishlist', icon: Heart, href: '/account/wishlist' },
  { title: 'Orders', icon: ShoppingCart, href: '/dashboard/orders' },
  { title: 'Track Order', icon: Truck, href: '/account/track' },
  { title: 'Products', icon: Package, href: '/dashboard/products' },
  { title: 'POS', icon: ShoppingCart, href: '/pos', hideForUser: true },
];

export function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const pageTitle =
    location.pathname === '/account/wishlist'
      ? 'Wishlist'
      : location.pathname === '/account/track'
        ? 'Track Order'
        : 'My account';

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#fafafa] dark:bg-[#09090b]">
        <Sidebar collapsible="icon" className="border-r border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-xl">
          <SidebarHeader className="group-data-[collapsible=icon]:h-14 h-16 flex items-center px-6">
            <div className="flex items-center gap-3 w-full group-data-[collapsible=icon]:hidden">
              <Link to="/" className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                  <span className="font-bold text-lg">E</span>
                </div>
                <span className="font-bold text-xl tracking-tight">My account</span>
              </Link>
              <SidebarTrigger className="ml-auto size-7" />
            </div>
            <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full h-full">
              <SidebarTrigger className="size-7" />
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2 pt-4 group-data-[collapsible=icon]:pt-8">
            <SidebarGroup>
              <SidebarGroupLabel className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">
                Account
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {accountNav
                    .filter(
                      (item) =>
                        !(item.href === '/account/track' && isInventoryManagerRole(user?.role)) &&
                        !('hideForUser' in item && item.hideForUser && isCustomerAccountRole(user?.role))
                    )
                    .map((item) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className={`
                            relative group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200
                            ${isActive
                              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-bold'
                              : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-white/5 hover:text-foreground'}
                          `}
                        >
                          <Link to={item.href} state={item.href === '/pos' ? { fromDashboard: location.pathname } : undefined}>
                            <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                            <span className="group-data-[collapsible=icon]:hidden text-[16px] font-semibold tracking-wide">
                              {item.title}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-4">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Shop" className="rounded-xl">
                      <Link to="/shop" className="flex items-center gap-3 px-4 py-2.5 text-muted-foreground hover:bg-gray-100 dark:hover:bg-white/5 hover:text-foreground transition-all duration-200 rounded-xl">
                        <Store className="w-5 h-5" />
                        <span className="group-data-[collapsible=icon]:hidden font-semibold">Continue shopping</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-gray-100 dark:border-white/5">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all duration-200 font-medium"
            >
              <LogOut className="w-5 h-5" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </button>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-[#09090b]">
          <header className="h-14 border-b border-gray-100 dark:border-white/10 flex items-center px-6 gap-4 justify-between bg-white/80 dark:bg-black/40 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <p className="text-sm text-muted-foreground">
                Signed in as <span className="font-semibold text-foreground">{user?.name}</span>
              </p>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="max-w-[1000px] mx-auto">
              {location.pathname !== '/account/track' && (
                <h1 className="text-2xl font-extrabold tracking-tight mb-6">{pageTitle}</h1>
              )}
              <Outlet />
            </div>
            <div className="max-w-[1000px] mx-auto mt-8">
              <Footer />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
