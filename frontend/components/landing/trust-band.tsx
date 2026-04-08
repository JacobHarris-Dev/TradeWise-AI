"use client";

import {
  Activity,
  BrainCircuit,
  LayoutDashboard,
  Newspaper,
  type LucideIcon,
} from "lucide-react";

type Capability = {
  description: string;
  icon: LucideIcon;
  title: string;
};

const CAPABILITIES: Capability[] = [
  {
    title: "Live signals",
    description: "Current quote movement translated into a usable signal state.",
    icon: Activity,
  },
  {
    title: "Reasoning layer",
    description: "AI summaries that show which technical factors mattered.",
    icon: BrainCircuit,
  },
  {
    title: "News context",
    description: "Recent headlines linked directly to the trade narrative.",
    icon: Newspaper,
  },
  {
    title: "Focused workspace",
    description: "Dashboard, trade, and portfolio stay connected.",
    icon: LayoutDashboard,
  },
];

export function LandingTrustBand() {
  return (
    <section className="border-y border-slate-200 bg-slate-50 py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <p className="mb-7 text-center text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
          Built for faster, more explainable trade decisions
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CAPABILITIES.map(({ description, icon: Icon, title }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2.5 text-emerald-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{title}</div>
                  <div className="mt-1 text-sm leading-5 text-slate-500">
                    {description}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
