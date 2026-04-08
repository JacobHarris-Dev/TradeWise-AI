import { Activity, LayoutDashboard, LineChart, MessageSquareText, TrendingDown, TrendingUp } from "lucide-react";

export default function Features() {
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
            Intelligence at every layer of your trade
          </h2>
          <p className="text-lg text-slate-600 font-medium">
            TradeWise isn't a black box. Our AI combines market data and sentiment to give you clear, explainable signals you can act on.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Feature 1 */}
          <div className="group rounded-2xl bg-slate-50 border border-slate-200 p-8 flex flex-col hover:border-emerald-300 transition-colors shadow-sm hover:shadow-md">
            <div className="h-48 rounded-xl bg-white border border-slate-200 mb-8 flex items-center justify-center overflow-hidden relative shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent z-10" />
              <div className="w-full max-w-[280px] space-y-3 p-4">
                {[{ ticker: "NVDA", price: "124.50", change: "+4.2%", up: true }, { ticker: "TSLA", price: "178.20", change: "-1.8%", up: false }, { ticker: "AMD", price: "162.90", change: "+2.1%", up: true }].map((stock) => (
                  <div key={stock.ticker} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 shadow-sm">
                    <div className="font-bold text-slate-900">{stock.ticker}</div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900">${stock.price}</div>
                      <div className={`text-xs font-bold flex items-center justify-end gap-1 ${stock.up ? "text-emerald-600" : "text-red-500"}`}>
                        {stock.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {stock.change}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100">
                <Activity className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900">Live Market Signals</h3>
            </div>
            <p className="text-slate-600 leading-relaxed font-medium text-sm">
              Real-time tick data streaming directly into our proprietary models, identifying momentum and reversals instantly.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="group rounded-2xl bg-slate-50 border border-slate-200 p-8 flex flex-col hover:border-cyan-300 transition-colors shadow-sm hover:shadow-md">
            <div className="h-48 rounded-xl bg-white border border-slate-200 mb-8 flex items-center justify-center p-6 relative shadow-sm">
              <div className="w-full max-w-[320px] rounded-lg bg-slate-50 border border-slate-200 p-4 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 to-cyan-400" />
                <div className="text-xs font-mono font-bold text-slate-500 mb-2 mt-1">AI Output</div>
                <div className="text-sm text-slate-700 font-medium leading-relaxed">
                  The <span className="font-bold text-cyan-700 bg-cyan-50 border border-cyan-100 px-1 rounded">VWAP cross</span> suggests heavy institutional accumulation. Coupled with a <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1 rounded">RSI divergence</span>, downside is minimal.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center border border-cyan-100">
                <MessageSquareText className="w-5 h-5 text-cyan-600" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900">Explainable AI Reasoning</h3>
            </div>
            <p className="text-slate-600 leading-relaxed font-medium text-sm">
              Never follow blindly. Every signal comes with a plain-english breakdown of the technical indicators and rationale behind it.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="group rounded-2xl bg-slate-50 border border-slate-200 p-8 flex flex-col hover:border-amber-300 transition-colors shadow-sm hover:shadow-md">
            <div className="h-48 rounded-xl bg-white border border-slate-200 mb-8 flex gap-3 p-4 overflow-hidden relative shadow-sm">
              <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white to-transparent z-10" />
              {[
                { title: "Fed leaves rates unchanged", sentiment: "Neutral", color: "text-slate-600 bg-slate-100 border-slate-200" },
                { title: "Supplier delays hit semi sector", sentiment: "Bearish", color: "text-red-700 bg-red-50 border-red-200" },
                { title: "Earnings crush estimates", sentiment: "Bullish", color: "text-emerald-700 bg-emerald-50 border-emerald-200" }
              ].map((news, i) => (
                <div key={i} className="min-w-[200px] h-[120px] rounded-lg bg-slate-50 border border-slate-200 p-4 flex flex-col justify-between shadow-sm">
                  <div className="text-sm font-bold text-slate-900 leading-snug">{news.title}</div>
                  <div className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border inline-block w-max mt-2 ${news.color}`}>{news.sentiment}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100">
                <LineChart className="w-5 h-5 text-amber-500" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900">News-Aware Trade Context</h3>
            </div>
            <p className="text-slate-600 leading-relaxed font-medium text-sm">
              Our models instantly digest financial news, SEC filings, and macro events to augment technical setups with fundamental context.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="group rounded-2xl bg-slate-50 border border-slate-200 p-8 flex flex-col hover:border-slate-400 transition-colors shadow-sm hover:shadow-md">
            <div className="h-48 rounded-xl bg-white border border-slate-200 mb-8 p-4 relative shadow-sm">
              {/* Mini Dashboard */}
              <div className="w-full h-full border border-slate-200 rounded-lg bg-slate-50 p-3 flex flex-col gap-2 shadow-sm">
                <div className="h-6 w-full flex gap-2">
                  <div className="h-full w-24 bg-white border border-slate-200 rounded" />
                  <div className="h-full flex-1 bg-white border border-slate-200 rounded" />
                </div>
                <div className="flex-1 flex gap-2">
                  <div className="w-1/3 h-full bg-white border border-slate-200 rounded" />
                  <div className="flex-1 h-full bg-white border border-slate-200 rounded flex flex-col justify-end p-2">
                    <div className="w-full h-1/2 border-t-2 border-dashed border-slate-300" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                <LayoutDashboard className="w-5 h-5 text-slate-700" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900">Clean Dashboard</h3>
            </div>
            <p className="text-slate-600 leading-relaxed font-medium text-sm">
              Execute rapidly with an uncluttered, high-contrast interface designed specifically for split-second market decisions.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
