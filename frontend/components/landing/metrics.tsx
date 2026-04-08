"use client";

const METRICS = [
  {
    value: "3",
    label: "Connected views",
    sub: "Dashboard, Trade, and Portfolio keep the same workflow context.",
  },
  {
    value: "2",
    label: "Reading modes",
    sub: "Student and advanced views change how the signal is explained.",
  },
  {
    value: "Live",
    label: "Quote flow",
    sub: "Current pricing powers the public demo and the trading workspace.",
  },
  {
    value: "Paper",
    label: "Practice first",
    sub: "Mock and paper-trading flows make the app useful before real capital.",
  },
];

export function LandingMetrics() {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">
            Product footprint
          </p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 md:text-5xl">
            Built around the actual TradeWise workflow
          </h2>
          <p className="mt-5 text-lg font-medium leading-8 text-slate-600">
            Instead of inventing enterprise vanity metrics, this section highlights
            the concrete product shape users step into after the homepage.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {METRICS.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm"
            >
              <div className="bg-gradient-to-br from-slate-900 to-slate-500 bg-clip-text text-5xl font-black tracking-tight text-transparent">
                {metric.value}
              </div>
              <div className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-slate-700">
                {metric.label}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">{metric.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
