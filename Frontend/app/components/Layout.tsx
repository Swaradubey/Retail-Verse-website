import { Outlet, useLocation } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';

export function Layout() {
  const { pathname } = useLocation();
  const hasSidebar = pathname.startsWith('/dashboard') || pathname.startsWith('/account');

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      {!hasSidebar && <Footer />}
    </div>
  );
}
