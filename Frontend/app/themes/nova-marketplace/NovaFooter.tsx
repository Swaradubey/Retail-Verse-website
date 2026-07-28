import { Link } from 'react-router';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram } from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';

export function NovaFooter() {
  const { brandName: brandingBrandName } = useBranding();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isClientUser = user?.role === 'client';
  const brandName = isSuperAdmin
    ? 'Retail Verse'
    : isClientUser && user.businessName
      ? user.businessName
      : brandingBrandName || 'Retail Verse';
  return (
    <footer className="bg-[#0f172a] text-gray-400">
      <div className="max-w-[88rem] mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          <div>
            <h3 className="text-lg font-bold text-white mb-4">
              {brandName}
            </h3>
            <p className="text-sm leading-relaxed mb-4">Your one-stop marketplace for everything you need. Best prices, fast delivery, and amazing deals every day.</p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors"><Facebook className="w-4 h-4" /></a>
              <a href="#" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors"><Twitter className="w-4 h-4" /></a>
              <a href="#" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors"><Instagram className="w-4 h-4" /></a>
            </div>
          </div>

          <div>
            <h4 className="text-white text-sm font-bold uppercase mb-4">Shop</h4>
            <ul className="space-y-2">
              {['Electronics', 'Fashion', 'Home & Kitchen', 'Beauty', 'Sports', 'Groceries'].map((item) => (
                <li key={item}><Link to="/shop" className="text-sm hover:text-white transition-colors">{item}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-bold uppercase mb-4">Help</h4>
            <ul className="space-y-2">
              <li><Link to="/delete-account" className="text-sm hover:text-white transition-colors">Delete Account</Link></li>
              {['Customer Service', 'Returns & Refunds', 'Shipping Info', 'FAQ', 'Track Order'].map((item) => (
                <li key={item}><Link to="/contact" className="text-sm hover:text-white transition-colors">{item}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-bold uppercase mb-4">Contact</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0" /> 123 Nova Street, Tech City, TC 10001</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 shrink-0" /> 1-800-NOVA-123</li>
              <li className="flex items-center gap-2"><Mail className="w-4 h-4 shrink-0" /> support@novamarket.com</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <p>&copy; 2026 {brandName}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms-of-service" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/delete-account" className="hover:text-white transition-colors">Delete Account</Link>
            <Link to="/contact" className="hover:text-white transition-colors">Support</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
