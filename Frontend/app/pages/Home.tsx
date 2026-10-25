import React from 'react';
import { EbayHeroBanner } from '../components/banners/EbayHeroBanner';
import { TrustMarquee } from '../components/TrustMarquee';
import { ResourcesSection } from '../components/ResourcesSection';
import { SmartDigitalBusinessSection } from '../components/SmartDigitalBusinessSection';

export function Home() {
  return (
    <div className="flex flex-col gap-0 overflow-hidden bg-[#F8FAFC]">
      {/* Dynamic eBay-Style Hero Banner (Shows dynamically when banners are active in dashboard) */}
      <EbayHeroBanner placement="HOME_HERO" />

      {/* Smart Digital Business Platform Section */}
      <SmartDigitalBusinessSection />

      {/* Trust & Features Marquee */}
      <TrustMarquee />

      {/* Resources & Business Insights */}
      <ResourcesSection />
    </div>
  );
}
