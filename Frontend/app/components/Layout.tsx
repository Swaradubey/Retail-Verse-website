import { Outlet, useLocation } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';

const SHOW_COMING_SOON = true;

const comingSoonAllowedPathPrefixes = ["/home", "/products", "/category", "/contact"];

export function Layout() {
  const { pathname } = useLocation();
  const hasSidebar = pathname.startsWith('/dashboard') || pathname.startsWith('/account');

  const shouldShowComingSoon =
    SHOW_COMING_SOON && (pathname === "/" || comingSoonAllowedPathPrefixes.some(p => pathname.startsWith(p)));

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="relative flex-1 flex flex-col">
        {shouldShowComingSoon && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <div className="text-center text-white px-4">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">Coming Soon</h1>
              <p className="text-lg md:text-xl">We are working on something amazing. Stay tuned!</p>
            </div>
          </div>
        )}
        <div
          className={`flex-1 flex flex-col ${shouldShowComingSoon ? 'pointer-events-none select-none' : ''}`}
          style={shouldShowComingSoon ? { filter: 'blur(8px)', WebkitFilter: 'blur(8px)' } : {}}
        >
          <main className="flex-1">
            <Outlet />
          </main>
          {!hasSidebar && <Footer />}
        </div>
      </div>
    </div>
  );
}
