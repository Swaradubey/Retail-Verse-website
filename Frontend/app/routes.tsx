import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { SuperAdminRoute } from './components/SuperAdminRoute';
import { SuperAdminOnlyRoute } from './components/SuperAdminOnlyRoute';
import { SuperAdminOrClientRoute } from './components/SuperAdminOrClientRoute';
import { FullAdminOnlyRoute } from './components/FullAdminOnlyRoute';
import { HelpCenterRoute } from './components/HelpCenterRoute';
import { SupportRoute } from './components/SupportRoute';
import { Home } from './pages/Home';
import { Shop } from './pages/Shop';
import { ProductDetail } from './pages/ProductDetail';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { OrderConfirmation } from './pages/OrderConfirmation';
import { NotFound } from './pages/NotFound';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/auth/Login';
import { SuperAdminLogin } from './pages/auth/SuperAdminLogin';
import { SuperAdminDashboard } from './pages/super-admin/SuperAdminDashboard';
import { Register } from './pages/auth/Register';
import { GoogleAuthCallback } from './pages/auth/GoogleAuthCallback';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { Contact } from './pages/Contact';
import { About } from './pages/About';
import { Inventory } from './pages/Inventory';
import { Pos } from './pages/Pos';
import { DashboardProducts } from './pages/dashboard/DashboardProducts';
import { DashboardOrders } from './pages/dashboard/DashboardOrders';
import { DashboardInvoices } from './pages/dashboard/DashboardInvoices';
import { DashboardCustomers } from './pages/dashboard/DashboardCustomers';
import { DashboardAnalytics } from './pages/dashboard/DashboardAnalytics';
import { DashboardInbox } from './pages/dashboard/DashboardInbox';
import { DashboardSettings } from './pages/dashboard/DashboardSettings';
import { DashboardHelpCenter } from './pages/dashboard/DashboardHelpCenter';
import { DashboardWishlistActivity } from './pages/dashboard/DashboardWishlistActivity';
import { DashboardContactMessages } from './pages/dashboard/DashboardContactMessages';
import { DashboardUsers } from './pages/dashboard/DashboardUsers';
import { DashboardSeo } from './pages/dashboard/DashboardSeo';
import { DashboardAdminLogs } from './pages/dashboard/DashboardAdminLogs';
import { DashboardSupport } from './pages/dashboard/DashboardSupport';
import { DashboardClients } from './pages/dashboard/DashboardClients';
import { DashboardAddEmployee } from './pages/dashboard/DashboardAddEmployee';
import { DashboardCustomersContactForm } from './pages/dashboard/DashboardCustomersContactForm';
import { Account } from './pages/Account';
import { WishlistPage } from './pages/WishlistPage';
import { TrackOrder } from './pages/TrackOrder';
import { CustomDomain } from './pages/super-admin/CustomDomain';
import { SuperAdminClients } from './pages/super-admin/SuperAdminClients';
import { SuperAdminClientDetail } from './pages/super-admin/SuperAdminClientDetail';
import { InvoiceDetail } from './pages/super-admin/InvoiceDetail';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';

import { RootRoute } from './components/RootRoute';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <RootRoute /> },
      { path: 'landing', Component: Home },
      { path: 'shop', Component: Shop },
      { path: 'product/:slug', Component: ProductDetail },
      { path: 'cart', Component: Cart },
      { path: 'checkout', Component: Checkout },
      { path: 'order-confirmation/:orderId', Component: OrderConfirmation },
      { path: 'track-order', Component: TrackOrder },
      { path: 'login', Component: Login },
      { path: 'super-admin/login', Component: SuperAdminLogin },
      {
        path: 'super-admin',
        element: (
          <ProtectedRoute loginPath="/super-admin/login">
            <SuperAdminRoute>
              <SuperAdminDashboard />
            </SuperAdminRoute>
          </ProtectedRoute>
        ),
      },
      { path: 'register', Component: Register },
      { path: 'google-auth-callback', Component: GoogleAuthCallback },
      { path: 'forgot-password', Component: ForgotPassword },
      { path: 'reset-password/:token', Component: ResetPassword },
      { path: 'contact', Component: Contact },
      { path: 'about', Component: About },
      { path: 'privacy-policy', Component: PrivacyPolicy },
      { path: 'terms-of-service', Component: TermsOfService },
      {
        path: 'pos',
        element: (
          <ProtectedRoute>
            <Pos />
          </ProtectedRoute>
        ),
      },
      {
        path: 'account',
        element: (
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'wishlist', element: <WishlistPage /> },
          { path: 'track', element: <TrackOrder variant="account" /> },
        ],
      },
      {
        element: (
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ),
        children: [
          { path: 'dashboard', index: true, element: null },
          { path: 'dashboard/products', element: <DashboardProducts /> },
          {
            path: 'dashboard/inventory',
            element: (
              <AdminRoute>
                <Inventory />
              </AdminRoute>
            ),
          },
          {
            path: 'dashboard/orders',
            element: <DashboardOrders />,
          },
          {
            path: 'dashboard/invoices',
            element: (
              <SuperAdminOrClientRoute>
                <DashboardInvoices />
              </SuperAdminOrClientRoute>
            ),
          },
          {
            path: 'dashboard/customers',
            element: (
              <SuperAdminOrClientRoute>
                <DashboardCustomers />
              </SuperAdminOrClientRoute>
            ),
          },
          {
            path: 'dashboard/customers/contact-form',
            element: (
              <FullAdminOnlyRoute>
                <DashboardCustomersContactForm />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/users',
            element: (
              <FullAdminOnlyRoute>
                <DashboardUsers />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/clients',
            element: (
              <SuperAdminOnlyRoute>
                <DashboardClients />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/admin-logs',
            element: (
              <SuperAdminOnlyRoute>
                <DashboardAdminLogs />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/support',
            element: <SupportRoute />,
          },
          {
            path: 'dashboard/analytics',
            element: (
              <SuperAdminOrClientRoute>
                <DashboardAnalytics />
              </SuperAdminOrClientRoute>
            ),
          },
          {
            path: 'dashboard/inbox',
            element: (
              <AdminRoute>
                <DashboardInbox />
              </AdminRoute>
            ),
          },
          {
            path: 'dashboard/contact-messages',
            element: (
              <FullAdminOnlyRoute>
                <DashboardContactMessages />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/settings',
            element: (
              <FullAdminOnlyRoute>
                <DashboardSettings />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/help-center',
            element: (
              <HelpCenterRoute>
                <DashboardHelpCenter />
              </HelpCenterRoute>
            ),
          },
          { path: 'dashboard/wishlist', element: <WishlistPage /> },
          {
            path: 'dashboard/wishlist-activity',
            element: (
              <FullAdminOnlyRoute>
                <DashboardWishlistActivity />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'dashboard/add-employee',
            element: (
              <AdminRoute>
                <DashboardAddEmployee />
              </AdminRoute>
            ),
          },
          {
            path: 'dashboard/seo',
            element: (
              // seo_manager is blocked from /dashboard/seo — they only get Products and Inventory
              <AdminRoute blockedRoles={['seo_manager']}>
                <DashboardSeo />
              </AdminRoute>
            ),
          },
          {
            path: 'super-admin/custom-domain',
            element: (
              <FullAdminOnlyRoute>
                <CustomDomain />
              </FullAdminOnlyRoute>
            ),
          },
          {
            path: 'super-admin/clients',
            element: (
              <SuperAdminOnlyRoute>
                <SuperAdminClients />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'super-admin/clients/:clientId',
            element: (
              <SuperAdminOnlyRoute>
                <SuperAdminClientDetail />
              </SuperAdminOnlyRoute>
            ),
          },
          {
            path: 'super-admin/invoice/:orderId',
            element: (
              <SuperAdminOnlyRoute>
                <InvoiceDetail />
              </SuperAdminOnlyRoute>
            ),
          },
        ],
      },
      { path: '*', Component: NotFound },
    ],
  },
]);
