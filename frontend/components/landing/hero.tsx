"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Bell,
  Newspaper,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

const chartData = [
  { time: "9:30", price: 184.1 },
  { time: "10:00", price: 183.7 },
  { time: "10:30", price: 184.8 },
  { time: "11:00", price: 184.3 },
  { time: "11:30", price: 185.4 },
  { time: "12:00", price: 186.1 },
  { time: "12:30", price: 185.7 },
  { time: "13:00", price: 186.9 },
  { time: "13:30", price: 186.4 },
  { time: "14:00", price: 187.3 },
  { time: "14:30", price: 188.2 },
  { time: "15:00", price: 187.8 },
  { time: "15:30", price: 188.9 },
];

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f7faf9_0%,#ffffff_52%,#f8fafc_100%)] pb-20 pt-28 sm:pt-32 lg:pb-28 lg:pt-40">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.96))]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />

      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="animate-in fade-in slide-in-from-bottom-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold tracking-[0.18em] text-emerald-700 duration-500">
            TradeWise AI
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-600 duration-500 delay-100">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            Live signals, reasoning, and market context in one view
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 mt-8 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold tracking-wide text-emerald-700 duration-500 delay-150">
            <Zap className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
            Core engine active
          </div>

          <h1 className="animate-in fade-in slide-in-from-bottom-2 mt-8 max-w-4xl text-balance text-5xl font-black tracking-tight text-slate-950 duration-500 delay-200 sm:text-6xl lg:text-7xl">
            Trade with an AI desk that{" "}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
              explains every move
            </span>
            .
          </h1>

          <p className="animate-in fade-in slide-in-from-bottom-2 mx-auto mt-6 max-w-2xl text-balance text-lg font-medium leading-8 text-slate-600 duration-500 delay-300 lg:text-xl">
            TradeWise combines live quotes, machine-learned signals, recent news,
            and paper-trading tools into one calmer workflow built for faster
            decisions.
          </p>

          <div className="animate-in fade-in slide-in-from-bottom-2 mt-10 flex flex-col items-center justify-center gap-4 duration-500 delay-500 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-slate-800 sm:w-auto"
            >
              Open TradeWise
            </Link>
            <a
              href="#demo"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-50 sm:w-auto"
            >
              See the live demo
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
            </a>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-[1180px] px-1 sm:mt-20">
          <div className="absolute left-0 top-20 hidden rounded-2xl border border-amber-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur lg:block lg:-translate-x-10 lg:animate-[tw-float_6s_ease-in-out_infinite]">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Risk read
                </div>
                <div className="text-sm font-bold text-slate-900">
                  Earnings watch: moderate
                </div>
              </div>
            </div>
          </div>

          <div className="absolute right-0 top-36 hidden rounded-2xl border border-cyan-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur lg:block lg:translate-x-8 lg:animate-[tw-float-reverse_7s_ease-in-out_infinite]">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-2.5 text-cyan-600">
                <Newspaper className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Context linked
                </div>
                <div className="text-sm font-bold text-slate-900">
                  News reasoning attached
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white/90 shadow-[0_30px_120px_-45px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/85 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3 sm:gap-5">
                <div className="hidden gap-1.5 sm:flex">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                  <Search className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-900">AAPL</span>
                  <span className="hidden text-xs font-medium text-slate-500 sm:inline">
                    Apple Inc.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-slate-500">
                <Bell className="h-5 w-5" />
                <div className="rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 p-[1px]">
                  <div className="h-8 w-8 rounded-full border border-white bg-white" />
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="border-b border-slate-200 bg-white p-6 md:border-b-0 md:border-r lg:p-8">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Live quote
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <h2 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                        $188.90
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-700">
                        <TrendingUp className="h-4 w-4" />
                        +2.6%
                      </span>
                    </div>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                      The workspace keeps the live move, signal state, and context
                      layer on one screen so you are not switching tabs to make a
                      basic trade decision.
                    </p>
                  </div>

                  <div className="inline-flex w-max rounded-full border border-slate-200 bg-slate-50 p-1">
                    {["1D", "1W", "1M", "3M", "1Y"].map((range) => (
                      <button
                        key={range}
                        type="button"
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                          range === "1D"
                            ? "bg-white text-slate-950 shadow-sm"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-8 h-[260px] w-full rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.55))] p-4 sm:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
                    >
                      <defs>
                        <linearGradient id="landing-price-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b", fontSize: 12 }}
                      />
                      <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#ffffff",
                          borderColor: "#dbe2ea",
                          borderRadius: "14px",
                          boxShadow: "0 16px 40px -20px rgba(15, 23, 42, 0.28)",
                          color: "#0f172a",
                        }}
                        labelStyle={{ color: "#64748b", fontWeight: 600 }}
                        itemStyle={{ color: "#047857", fontWeight: 700 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke="#10b981"
                        strokeWidth={3}
                        fill="url(#landing-price-fill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: "Signal state",
                      value: "Strong buy",
                      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
                    },
                    {
                      label: "Reasoning",
                      value: "MACD + momentum confirmation",
                      tone: "border-cyan-200 bg-cyan-50 text-cyan-700",
                    },
                    {
                      label: "Practice mode",
                      value: "Paper trading ready",
                      tone: "border-amber-200 bg-amber-50 text-amber-700",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.label}
                      </div>
                      <div
                        className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${item.tone}`}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="bg-slate-50/80 p-6 lg:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    AI consensus
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-black tracking-wide text-slate-950">
                          STRONG BUY
                        </span>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                        92%
                      </span>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-slate-100">
                      <div className="h-2 w-[92%] rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" />
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      Momentum is rebuilding above support while the recent headline
                      flow keeps the setup constructive instead of purely technical.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    What the model sees
                  </div>
                  <ul className="mt-4 space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-2.5">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                      Momentum re-accelerated after a clean support retest.
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      Recent coverage adds context instead of conflicting with price.
                    </li>
                    <li className="flex items-start gap-2.5">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      Risk stays visible before the user decides or paper trades.
                    </li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
