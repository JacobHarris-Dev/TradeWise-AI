import { motion } from "motion/react";
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, ArrowUpRight, BarChart3, Bell, CheckCircle2, ListFilter, Newspaper, Search, Zap } from "lucide-react";

const chartData = [
  { time: "9:30", price: 182.4 },
  { time: "10:00", price: 181.9 },
  { time: "10:30", price: 183.1 },
  { time: "11:00", price: 182.8 },
  { time: "11:30", price: 184.5 },
  { time: "12:00", price: 185.2 },
  { time: "12:30", price: 184.9 },
  { time: "13:00", price: 186.3 },
  { time: "13:30", price: 185.8 },
  { time: "14:00", price: 187.1 },
  { time: "14:30", price: 188.4 },
  { time: "15:00", price: 187.9 },
  { time: "15:30", price: 189.2 },
];

export default function Hero() {
  return (
    <section className="relative pt-36 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-50/60 via-white to-white -z-10" />
      
      <div className="max-w-7xl mx-auto px-6 lg:px-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold tracking-wide mb-8"
        >
          <Zap className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
          TradeWise AI Core Engine 2.0 Live
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="text-5xl lg:text-7xl font-extrabold tracking-tight text-slate-900 max-w-4xl mx-auto leading-[1.1]"
        >
          Trade Smarter With AI That <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-cyan-500">Shows Its Work</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="mt-6 text-lg lg:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed font-medium"
        >
          TradeWise AI combines live quotes, ML-powered trade signals, and recent market news into one clear decision interface. High-conviction intelligence, entirely explainable.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button className="w-full sm:w-auto px-8 py-3.5 text-base font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-full transition-colors shadow-lg shadow-slate-900/10">
            Get Started Free
          </button>
          <button className="w-full sm:w-auto px-8 py-3.5 text-base font-bold text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-full transition-colors flex items-center justify-center gap-2 shadow-sm">
            View Live Demo <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </button>
        </motion.div>
      </div>

      {/* Complex Layered Hero UI */}
      <div className="relative max-w-[1100px] mx-auto mt-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
          className="relative rounded-2xl bg-white/80 backdrop-blur-xl border border-slate-200 shadow-2xl overflow-hidden shadow-slate-200/50 ring-1 ring-slate-900/5"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-4">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <div className="h-4 w-px bg-slate-200 mx-2" />
              <div className="flex items-center gap-2 bg-white rounded-md px-3 py-1.5 border border-slate-200 shadow-sm">
                <Search className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-900">AAPL</span>
                <span className="text-xs font-medium text-slate-500">Apple Inc.</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <Bell className="w-5 h-5 hover:text-slate-900 cursor-pointer transition-colors" />
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 p-[1px]">
                <div className="w-full h-full bg-white rounded-full border border-white" />
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex flex-col md:flex-row h-auto md:h-[500px]">
            {/* Chart Area */}
            <div className="flex-1 p-6 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 relative bg-white">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">$189.20</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                      <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> +3.7% ($6.80)
                    </span>
                    <span className="text-sm font-medium text-slate-500">Today</span>
                  </div>
                </div>
                <div className="flex gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                  {["1D", "1W", "1M", "3M", "1Y", "ALL"].map((t) => (
                    <button
                      key={t}
                      className={`text-xs font-bold px-3 py-1.5 rounded-md transition-colors ${
                        t === "1D" ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-h-[250px] w-full mt-4 -ml-4 relative overflow-hidden">
                <div className="absolute inset-0">
                  <AreaChart width={600} height={250} data={chartData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        borderColor: '#e2e8f0',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontWeight: 600,
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                      itemStyle={{ color: '#047857' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#10b981"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorPrice)"
                    />
                  </AreaChart>
                </div>
              </div>
            </div>

            {/* AI Sidebar */}
            <div className="w-full md:w-[320px] bg-slate-50/50 p-6 flex flex-col gap-4 relative z-10">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-900">AI Consensus</span>
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                </span>
              </div>

              {/* Signal Card */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 to-cyan-400" />
                <div className="flex items-center justify-between mb-2 mt-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-600" />
                    <span className="font-extrabold text-slate-900">STRONG BUY</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">94%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: "94%" }} />
                </div>
              </div>

              {/* Why this signal? */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Why this signal?</span>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2.5 text-sm text-slate-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-snug">Unusual options activity detected at $185 strike.</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-slate-700 font-medium">
                    <Newspaper className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                    <span className="leading-snug">Positive sentiment spike across top 5 tier-1 news outlets.</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-slate-700 font-medium">
                    <BarChart3 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-snug">MACD crossover confirms bullish reversal on 1H chart.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Floating Fragments */}
        <motion.div
          animate={{ y: [-10, 10, -10] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-12 top-24 hidden lg:flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-xl shadow-slate-200/50 z-20"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100">
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-semibold">Earnings Risk</div>
            <div className="text-sm font-extrabold text-slate-900">Moderate (42%)</div>
          </div>
        </motion.div>

        <motion.div
          animate={{ y: [10, -10, 10] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute -right-8 bottom-32 hidden lg:flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-xl shadow-slate-200/50 z-20"
        >
          <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center border border-cyan-100">
            <ListFilter className="w-5 h-5 text-cyan-500" />
          </div>
          <div>
            <div className="text-xs text-cyan-600 font-semibold">Context Sync</div>
            <div className="text-sm font-extrabold text-slate-900">12 Articles Analyzed</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
