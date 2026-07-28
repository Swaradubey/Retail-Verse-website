import { Link } from 'react-router';
import { Mail, Phone, MapPin, Instagram, Twitter, Youtube } from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';

export function LuxeFooter() {
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
    <footer className="bg-[#1a1a2e] text-white/80">
      <div className="max-w-[88rem] mx-auto px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-2">
            <h3 className="text-2xl font-serif text-white mb-4">{brandName}</h3>
            <p className="text-white/60 leading-relaxed max-w-md mb-8">
              Curating the finest products for discerning customers since 2020. 
              Every piece tells a story of exceptional craftsmanship and timeless design.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#c9a96e] transition-colors" aria-label="Instagram">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#c9a96e] transition-colors" aria-label="Twitter">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#c9a96e] transition-colors" aria-label="Youtube">
                <Youtube className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white text-sm font-bold uppercase tracking-widest mb-6">Shop</h4>
            <ul className="space-y-3">
              {['New Arrivals', 'Collections', 'Women', 'Men', 'Accessories', 'Sale'].map((item) => (
                <li key={item}>
                  <Link to="/shop" className="text-white/60 hover:text-white transition-colors text-sm">{item}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-bold uppercase tracking-widest mb-6">Support</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/contact" className="text-white/60 hover:text-white transition-colors text-sm">Contact Us</Link>
              </li>
              <li>
                <Link to="/delete-account" className="text-white/60 hover:text-white transition-colors text-sm">Delete Account</Link>
              </li>
              {['Shipping & Returns', 'Size Guide', 'FAQ', 'Care Guide'].map((item) => (
                <li key={item}>
                  <Link to="/contact" className="text-white/60 hover:text-white transition-colors text-sm">{item}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-white/40">
            <Link to="/privacy-policy" className="hover:text-white/60 transition-colors">Privacy Policy</Link>
            <Link to="/terms-of-service" className="hover:text-white/60 transition-colors">Terms of Service</Link>
            <Link to="/delete-account" className="hover:text-white/60 transition-colors">Delete Account</Link>
          </div>
          <p className="text-sm text-white/40">
            &copy; 2026 {brandName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
