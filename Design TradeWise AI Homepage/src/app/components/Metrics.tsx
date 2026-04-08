export default function Metrics() {
  const metrics = [
    { value: "< 5ms", label: "Signal Refresh Speed", sub: "P99 latency on ticker updates" },
    { value: "12,000+", label: "Equities Tracked", sub: "Global coverage across 14 exchanges" },
    { value: "1.2s", label: "AI Explanation Latency", sub: "From signal trigger to natural language" },
    { value: "500k+", label: "Daily Headlines Digested", sub: "Real-time news sentiment parsing" },
  ];

  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
          Enterprise-grade infrastructure
        </h2>
        <p className="text-lg text-slate-600 font-medium max-w-2xl mx-auto mb-16">
          TradeWise AI is powered by low-latency data feeds and proprietary models optimized for high-frequency workflows.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((m, i) => (
            <div key={i} className="p-8 rounded-2xl bg-white border border-slate-200 flex flex-col items-center justify-center hover:shadow-md transition-shadow shadow-sm">
              <div className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-500">
                {m.value}
              </div>
              <div className="text-sm font-extrabold text-slate-700 uppercase tracking-wide mb-2">
                {m.label}
              </div>
              <div className="text-xs font-bold text-slate-400">
                {m.sub}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
