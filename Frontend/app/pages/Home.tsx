import React from 'react';
import { TrustMarquee } from '../components/TrustMarquee';
import { ResourcesSection } from '../components/ResourcesSection';
import { SmartDigitalBusinessSection } from '../components/SmartDigitalBusinessSection';

export function Home() {
  return (
    <div className="flex flex-col gap-0 overflow-hidden bg-[#F8FAFC]">
      {/* Smart Digital Business Platform Section */}
      <SmartDigitalBusinessSection />

      {/* Trust & Features Marquee */}
      <TrustMarquee />

      {/* Resources & Business Insights */}
      <ResourcesSection />
    </div>
  );
}
