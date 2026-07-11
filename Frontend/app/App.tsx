import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { ThemeProvider } from './context/ThemeContext';
import { RouterProvider } from 'react-router/dom';
import { router } from './routes';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <AuthProvider>
      <BrandingProvider>
        <CartProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
            <Toaster position="top-right" richColors closeButton />
          </ThemeProvider>
        </CartProvider>
      </BrandingProvider>
    </AuthProvider>
  );
}
