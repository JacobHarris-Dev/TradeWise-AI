"use client";

import { useBackendHealth } from "@/lib/hooks/use-backend";
import { LiveDemoCard } from "./demo-card";

export function LandingDemo() {
  const { healthy } = useBackendHealth();

  return (
    <section
      id="demo"
      className="scroll-mt-24 border-y border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eefaf5_100%)] py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">
            Live proof
          </p>
          <h2 className="mb-4 text-3xl font-black tracking-tight text-slate-900 md:text-5xl">
            See the real product surface
          </h2>
          <p className="text-lg font-medium text-slate-600">
            The design port is not just a static shell. This section keeps the
            live backend demo so the homepage still reflects what the current
            TradeWise stack can actually return.
          </p>
        </div>

        <div className="relative mb-8">
          <div className="absolute inset-x-16 top-12 -z-10 hidden h-40 rounded-full bg-emerald-200/45 blur-3xl md:block" />
          <LiveDemoCard />
        </div>

        {!healthy && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="text-sm text-amber-800">
              Live demo unavailable. The backend appears offline, so this section
              is showing the landing layout without fresh quote data.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
