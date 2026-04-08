export default function Cta() {
  return (
    <section className="py-32 relative overflow-hidden bg-white border-t border-slate-200 flex flex-col items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-50/60 via-white to-white -z-10" />
      <div className="max-w-4xl mx-auto px-6 lg:px-12 text-center">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight leading-tight">
          Ready to trade with <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-cyan-500">absolute conviction</span>?
        </h2>
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
          Join thousands of modern traders who trust TradeWise AI to identify high-probability setups, explain the logic, and eliminate the noise.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button className="w-full sm:w-auto px-10 py-4 text-lg font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-full transition-colors shadow-lg shadow-slate-900/10">
            Start Your Free Trial
          </button>
          <button className="w-full sm:w-auto px-10 py-4 text-lg font-bold text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-full transition-colors shadow-sm">
            Contact Sales
          </button>
        </div>
      </div>
    </section>
  );
}
