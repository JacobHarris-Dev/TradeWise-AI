import { Activity, Shield, TrendingUp, Zap } from "lucide-react";

export default function TrustBand() {
  return (
    <section className="py-12 border-y border-slate-200 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <p className="text-center text-sm font-bold tracking-wider text-slate-500 uppercase mb-8">
          Built for faster, more explainable market decisions
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 grayscale hover:grayscale-0 transition-all duration-500 opacity-60 hover:opacity-100">
          <div className="flex items-center gap-2 font-extrabold text-xl text-slate-900">
            <Activity className="w-6 h-6 text-emerald-600" />
            QuantData
          </div>
          <div className="flex items-center gap-2 font-extrabold text-xl text-slate-900">
            <TrendingUp className="w-6 h-6 text-cyan-600" />
            AlphaStream
          </div>
          <div className="flex items-center gap-2 font-extrabold text-xl text-slate-900">
            <Zap className="w-6 h-6 text-amber-500" />
            FastTrade API
          </div>
          <div className="flex items-center gap-2 font-extrabold text-xl text-slate-900">
            <Shield className="w-6 h-6 text-slate-700" />
            FinGuard Sec
          </div>
        </div>
      </div>
    </section>
  );
}
