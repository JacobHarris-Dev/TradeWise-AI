"use client";

import { LandingCTA } from "./cta";
import { LandingDemo } from "./demo";
import { LandingFeatures } from "./features";
import { LandingFooter } from "./footer";
import { LandingHero } from "./hero";
import { LandingMetrics } from "./metrics";
import { LandingNavbar } from "./navbar";
import { LandingTrustBand } from "./trust-band";
import { LandingWalkthrough } from "./walkthrough";

export function LandingHomepage() {
  return (
    <div className="min-h-screen bg-[#f7faf9] text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      <LandingNavbar />
      <main className="overflow-x-clip">
        <LandingHero />
        <LandingTrustBand />
        <LandingFeatures />
        <LandingWalkthrough />
        <LandingDemo />
        <LandingMetrics />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
