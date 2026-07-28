import { createBrowserRouter, Navigate } from 'react-router';
import React, { lazy, Suspense } from 'react';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { SuperAdminRoute } from './components/SuperAdminRoute';
import { SuperAdminOnlyRoute } from './components/SuperAdminOnlyRoute';
import { SuperAdminOrClientRoute } from './components/SuperAdminOrClientRoute';
import { FullAdminOnlyRoute } from './components/FullAdminOnlyRoute';
import { HelpCenterRoute } from './components/HelpCenterRoute';
import { SupportRoute } from './components/SupportRoute';
// Home page is eagerly loaded — it is the first visible screen
import { Home } from './pages/Home';
import { RootRoute } from './components/RootRoute';

import { useAuth } from './context/AuthContext';
import { isSuperAdminRole } from './utils/staffRoles';

function PricingRedirect() {
  return <Navigate to="/subscription" replace />;
}

function BlockSuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user && isSuperAdminRole(user.role)) {
    return <Navigate to="/super-admin" replace />;
  }

  return <>{children}</>;
}

// ── Page-level lazy imports ─────────────────────────────────────────────────
// These are only downloaded when the user navigates to that route.
const Shop = lazy(() => import('./pages/Shop').then(m => ({ default: m.Shop })));
const ProductsPreview = lazy(() => import('./pages/ProductsPreview').then(m => ({ default: m.ProductsPreview })));
const ProductDetail = lazy(() => import('./pages/ProductDetail').then(m => ({ default: m.ProductDetail })));
const Cart = lazy(() => import('./pages/Cart').then(m => ({ default: m.Cart })));
const Checkout = lazy(() => import('./pages/Checkout').then(m => ({ default: m.Checkout })));
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation').then(m => ({ default: m.OrderConfirmation })));
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Login = lazy(() => import('./pages/auth/Login').then(m => ({ default: m.Login })));
const SuperAdminLogin = lazy(() => import('./pages/auth/SuperAdminLogin').then(m => ({ default: m.SuperAdminLogin })));
const SuperAdminDashboard = lazy(() => import('./pages/super-admin/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
const Register = lazy(() => import('./pages/auth/Register').then(m => ({ default: m.Register })));
const GoogleAuthCallback = lazy(() => import('./pages/auth/GoogleAuthCallback').then(m => ({ default: m.GoogleAuthCallback })));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword').then(m => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword').then(m => ({ default: m.ResetPassword })));
const Contact = lazy(() => import('./pages/Contact').then(m => ({ default: m.Contact })));
const About = lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Pos = lazy(() => import('./pages/Pos').then(m => ({ default: m.Pos })));
const DashboardProducts = lazy(() => import('./pages/dashboard/DashboardProducts').then(m => ({ default: m.DashboardProducts })));
const DashboardOrders = lazy(() => import('./pages/dashboard/DashboardOrders').then(m => ({ default: m.DashboardOrders })));
const DashboardInvoices = lazy(() => import('./pages/dashboard/DashboardInvoices').then(m => ({ default: m.DashboardInvoices })));
const DashboardCustomers = lazy(() => import('./pages/dashboard/DashboardCustomers').then(m => ({ default: m.DashboardCustomers })));
const DashboardAnalytics = lazy(() => import('./pages/dashboard/DashboardAnalytics').then(m => ({ default: m.DashboardAnalytics })));
const DashboardInbox = lazy(() => import('./pages/dashboard/DashboardInbox').then(m => ({ default: m.DashboardInbox })));
const DashboardSettings = lazy(() => import('./pages/dashboard/DashboardSettings').then(m => ({ default: m.DashboardSettings })));
const DashboardHelpCenter = lazy(() => import('./pages/dashboard/DashboardHelpCenter').then(m => ({ default: m.DashboardHelpCenter })));
const DashboardWishlistActivity = lazy(() => import('./pages/dashboard/DashboardWishlistActivity').then(m => ({ default: m.DashboardWishlistActivity })));
const DashboardContactMessages = lazy(() => import('./pages/dashboard/DashboardContactMessages').then(m => ({ default: m.DashboardContactMessages })));
const DashboardUsers = lazy(() => import('./pages/dashboard/DashboardUsers').then(m => ({ default: m.DashboardUsers })));
const DashboardSubscription = lazy(() => import('./pages/dashboard/DashboardSubscription').then(m => ({ default: m.DashboardSubscription })));
const DashboardSeo = lazy(() => import('./pages/dashboard/DashboardSeo').then(m => ({ default: m.DashboardSeo })));
const DashboardAdminLogs = lazy(() => import('./pages/dashboard/DashboardAdminLogs').then(m => ({ default: m.DashboardAdminLogs })));
const DashboardSupport = lazy(() => import('./pages/dashboard/DashboardSupport').then(m => ({ default: m.DashboardSupport })));
const DashboardClients = lazy(() => import('./pages/dashboard/DashboardClients').then(m => ({ default: m.DashboardClients })));
const DashboardAddEmployee = lazy(() => import('./pages/dashboard/DashboardAddEmployee').then(m => ({ default: m.DashboardAddEmployee })));
const DashboardCustomersContactForm = lazy(() => import('./pages/dashboard/DashboardCustomersContactForm').then(m => ({ default: m.DashboardCustomersContactForm })));
const Account = lazy(() => import('./pages/Account').then(m => ({ default: m.Account })));
const WishlistPage = lazy(() => import('./pages/WishlistPage').then(m => ({ default: m.WishlistPage })));
const TrackOrder = lazy(() => import('./pages/TrackOrder').then(m => ({ default: m.TrackOrder })));
const CustomDomain = lazy(() => import('./pages/super-admin/CustomDomain').then(m => ({ default: m.CustomDomain })));
const SuperAdminClients = lazy(() => import('./pages/super-admin/SuperAdminClients').then(m => ({ default: m.SuperAdminClients })));
const SuperAdminClientDetail = lazy(() => import('./pages/super-admin/SuperAdminClientDetail').then(m => ({ default: m.SuperAdminClientDetail })));
const InvoiceDetail = lazy(() => import('./pages/super-admin/InvoiceDetail').then(m => ({ default: m.InvoiceDetail })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })));
const DeleteAccount = lazy(() => import('./pages/DeleteAccount').then(m => ({ default: m.DeleteAccount })));
const DashboardVoiceOrders = lazy(() => import('./pages/dashboard/DashboardVoiceOrders').then(m => ({ default: m.DashboardVoiceOrders })));
const SuperAdminVoiceOrders = lazy(() => import('./pages/super-admin/SuperAdminVoiceOrders').then(m => ({ default: m.SuperAdminVoiceOrders })));
const DashboardMarketplaces = lazy(() => import('./pages/dashboard/DashboardMarketplaces').then(m => ({ default: m.DashboardMarketplaces })));
const MarketplaceDetail = lazy(() => import('./pages/dashboard/MarketplaceDetail').then(m => ({ default: m.MarketplaceDetail })));
const DashboardMarketplaceLogs = lazy(() => import('./pages/dashboard/DashboardMarketplaceLogs').then(m => ({ default: m.DashboardMarketplaceLogs })));

// Minimal loading fallback — a tiny spinner that doesn't block the visible UI
function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-black/10 border-t-black/50" />
    </div>
  );
}

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <RootRoute /> },
      { path: 'landing', Component: Home },
      { path: 'shop', element: withSuspense(<Shop />) },
      { path: 'products', element: withSuspense(<ProductsPreview />) },
      { path: 'products/all', element: withSuspense(<Shop />) },
      { path: 'product/:slug', element: withSuspense(<ProductDetail />) },
      { path: 'cart', element: withSuspense(<Cart />) },
      { path: 'checkout', element: withSuspense(<Checkout />) },
      { path: 'order-confirmation/:orderId', element: withSuspense(<OrderConfirmation />) },
      { path: 'track-order', element: withSuspense(<TrackOrder />) },
      { path: 'login', element: withSuspense(<Login />) },
      { path: 'super-admin/login', element: withSuspense(<SuperAdminLogin />) },
      {
        path: 'super-admin',
        element: withSuspense(
          <ProtectedRoute loginPath="/super-admin/login">
            <SuperAdminRoute>
              <SuperAdminDashboard />
            </SuperAdminRoute>
          </ProtectedRoute>
        ),
      },
      { path: 'register', element: withSuspense(<Register />) },
      { path: 'google-auth-callback', element: withSuspense(<GoogleAuthCallback />) },
      { path: 'forgot-password', element: withSuspense(<ForgotPassword />) },
      { path: 'reset-password/:token', element: withSuspense(<ResetPassword />) },
      { path: 'contact', element: withSuspense(<Contact />) },
      {
        path: 'pricing',
        element: withSuspense(
          <ProtectedRoute>
            <PricingRedirect />
          </ProtectedRoute>
        ),
      },
      {
        path: 'subscription',
        element: withSuspense(
          <ProtectedRoute>
            <DashboardSubscription />
          </ProtectedRoute>
        ),
      },
      { path: 'about', element: withSuspense(<About />) },
      { path: 'privacy-policy', element: withSuspense(<PrivacyPolicy />) },
      { path: 'terms-of-service', element: withSuspense(<TermsOfService />) },
      { path: 'delete-account', element: withSuspense(<DeleteAccount />) },
      {
        path: 'pos',
        element: withSuspense(
          <ProtectedRoute>
            <Pos />
          </ProtectedRoute>
        ),
      },
      {
        path: 'account',
        element: withSuspense(
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'wishlist', element: withSuspense(<WishlistPage />) },
          { path: 'track', element: withSuspense(<TrackOrder />) },
        ],
      },
      {
        element: withSuspense(
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ),
        children: [
          { path: 'dashboard', index: true, element: null },
          { path: 'dashboard/products', element: withSuspense(<DashboardProducts />) },
          {
            path: 'dashboard/inventory',
            element: withSuspense(
              <AdminRoute>
                <Inventory />
              </AdminRoute>
            ),
          },
          {
            path: 'dashboard/orders',
            element: withSuspense(<DashboardOrders />),
          },
          {
            path: 'dashboard/invoices',
            element: withSuspense(
              <SuperAdminOrClientRoute>
                <DashboardInvoices />
              </SuperAdminOrClientRoute>
            ),
          },
          {
            path: 'dashboard/customers',
            element: withSuspense(
              <SuperAdminOrClientRoute>
                <DashboardCustomers />
              </SuperAdminOrClientRoute>
            ),
          },
          {
            path: 'dashboard/customers/contact-form',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <DashboardCustomersContactForm />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/subscription',
            element: withSuspense(<DashboardSubscription />),
          },
          {
            path: 'dashboard/users',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <DashboardUsers />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/clients',
            element: withSuspense(
              <SuperAdminOnlyRoute>
                <DashboardClients />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/admin-logs',
            element: withSuspense(
              <SuperAdminOnlyRoute>
                <DashboardAdminLogs />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/support',
            element: withSuspense(<SupportRoute />),
          },
          {
            path: 'dashboard/analytics',
            element: withSuspense(
              <SuperAdminOrClientRoute>
                <DashboardAnalytics />
              </SuperAdminOrClientRoute>
            ),
          },
          {
            path: 'dashboard/inbox',
            element: withSuspense(
              <AdminRoute>
                <DashboardInbox />
              </AdminRoute>
            ),
          },
          {
            path: 'dashboard/contact-messages',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <DashboardContactMessages />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/settings',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <DashboardSettings />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/help-center',
            element: withSuspense(
              <HelpCenterRoute>
                <DashboardHelpCenter />
              </HelpCenterRoute>
            ),
          },
          { path: 'dashboard/wishlist', element: withSuspense(<WishlistPage />) },
          {
            path: 'dashboard/wishlist-activity',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <DashboardWishlistActivity />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/add-employee',
            element: withSuspense(
              <AdminRoute>
                <DashboardAddEmployee />
              </AdminRoute>
            ),
          },
          {
            path: 'dashboard/seo',
            element: withSuspense(
              // seo_manager is blocked from /dashboard/seo — they only get Products and Inventory
              <AdminRoute blockedRoles={['seo_manager']}>
                <DashboardSeo />
              </AdminRoute>
            ),
          },
          {
            path: 'super-admin/custom-domain',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <CustomDomain />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'super-admin/settings',
            element: withSuspense(
              <SuperAdminOnlyRoute>
                <DashboardSettings />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'super-admin/clients',
            element: withSuspense(
              <SuperAdminOnlyRoute>
                <SuperAdminClients />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'super-admin/clients/:clientId',
            element: withSuspense(
              <SuperAdminOnlyRoute>
                <SuperAdminClientDetail />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'super-admin/invoice/:orderId',
            element: withSuspense(
              <SuperAdminOnlyRoute>
                <InvoiceDetail />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/ai-voice-orders',
            element: withSuspense(
              <BlockSuperAdminRoute>
                <DashboardVoiceOrders />
              </BlockSuperAdminRoute>
            ),
          },
          {
            path: 'dashboard/marketplaces',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <DashboardMarketplaces />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'admin/marketplaces',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <DashboardMarketplaces />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/marketplaces/:id',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <MarketplaceDetail />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/marketplaces/:id/logs',
            element: withSuspense(
              <FullAdminOnlyRoute>
                <DashboardMarketplaceLogs />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'super-admin/ai-voice-orders',
            element: withSuspense(
              <BlockSuperAdminRoute>
                <SuperAdminOnlyRoute>
                  <SuperAdminVoiceOrders />
                </SuperAdminOnlyRoute>
              </BlockSuperAdminRoute>
            ),
          },
        ],
      },
      { path: '*', element: withSuspense(<NotFound />) },
    ],
  },
]);
