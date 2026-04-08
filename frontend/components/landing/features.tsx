"use client";

import {
  Activity,
  LayoutDashboard,
  LineChart,
  MessageSquareText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const features = [
  {
    key: "signals",
    anchorId: "signals",
    title: "Live signal desk",
    description:
      "The homepage now opens with a clearer product surface instead of generic marketing blocks. Price movement, model direction, and trade context stay readable at a glance.",
    icon: Activity,
    color: "emerald",
  },
  {
    key: "reasoning",
    title: "Explainable reasoning",
    description:
      "Signals come with a plain-language breakdown so users can see why the model leans bullish, bearish, or neutral before trusting it.",
    icon: MessageSquareText,
    color: "cyan",
  },
  {
    key: "news",
    anchorId: "news-context",
    title: "News-aware context",
    description:
      "Headline context sits beside the technical read so sentiment and catalyst risk are visible before a decision is made.",
    icon: LineChart,
    color: "amber",
  },
  {
    key: "workspace",
    anchorId: "paper-trading",
    title: "Focused workspace",
    description:
      "Dashboard, trade view, and portfolio stay aligned so users can move from discovery to practice trading without a UI reset.",
    icon: LayoutDashboard,
    color: "slate",
  },
];

export function LandingFeatures() {
  return (
    <section id="product" className="scroll-mt-24 border-t border-slate-200 bg-white py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">
            Product surface
          </p>
          <h2 className="mb-4 text-3xl font-black tracking-tight text-slate-900 md:text-5xl">
            Intelligence at every layer of the workflow
          </h2>
          <p className="text-lg font-medium text-slate-600">
            The design bundle had the right overall composition. This version ports
            that structure into the real Next app and keeps the product story tied
            to what TradeWise actually does.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon;
            const borderColorClass = {
              emerald: "hover:border-emerald-300",
              cyan: "hover:border-cyan-300",
              amber: "hover:border-amber-300",
              slate: "hover:border-slate-400",
            }[feature.color];

            const bgColorClass = {
              emerald: "bg-emerald-50 border-emerald-100",
              cyan: "bg-cyan-50 border-cyan-100",
              amber: "bg-amber-50 border-amber-100",
              slate: "bg-slate-100 border-slate-200",
            }[feature.color];

            const textColorClass = {
              emerald: "text-emerald-600",
              cyan: "text-cyan-600",
              amber: "text-amber-500",
              slate: "text-slate-700",
            }[feature.color];

            return (
              <article
                key={feature.key}
                id={feature.anchorId}
                className={`group scroll-mt-28 rounded-[28px] border border-slate-200 bg-slate-50 p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${borderColorClass}`}
              >
                <div className="relative mb-6 flex h-48 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent z-10" />
                  {feature.key === "signals" && (
                    <div className="w-full max-w-[280px] space-y-3 p-4">
                      {[
                        {
                          ticker: "NVDA",
                          price: "124.50",
                          change: "+4.2%",
                          up: true,
                        },
                        {
                          ticker: "TSLA",
                          price: "178.20",
                          change: "-1.8%",
                          up: false,
                        },
                        {
                          ticker: "AMD",
                          price: "162.90",
                          change: "+2.1%",
                          up: true,
                        },
                      ].map((stock) => (
                        <div
                          key={stock.ticker}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm"
                        >
                          <div className="font-bold text-slate-900">{stock.ticker}</div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-slate-900">
                              ${stock.price}
                            </div>
                            <div
                              className={`flex items-center justify-end gap-1 text-xs font-bold ${
                                stock.up ? "text-emerald-600" : "text-red-500"
                              }`}
                            >
                              {stock.up ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {stock.change}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {feature.key === "reasoning" && (
                    <div className="relative w-full max-w-[320px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-cyan-400" />
                      <div className="mb-2 mt-1 text-xs font-mono font-bold text-slate-500">
                        AI Output
                      </div>
                      <div className="text-sm font-medium leading-relaxed text-slate-700">
                        The{" "}
                        <span className="rounded border border-cyan-100 bg-cyan-50 px-1 font-bold text-cyan-700">
                          VWAP cross
                        </span>{" "}
                        suggests institutional accumulation. RSI divergence and price
                        compression point in the same direction.
                      </div>
                    </div>
                  )}
                  {feature.key === "news" && (
                    <div className="flex w-full gap-2 overflow-x-auto px-3">
                      {[
                        {
                          title: "Fed leaves rates unchanged",
                          sentiment: "Neutral",
                          color: "text-slate-600 bg-slate-100 border-slate-200",
                        },
                        {
                          title: "Earnings crush",
                          sentiment: "Bullish",
                          color:
                            "text-emerald-700 bg-emerald-50 border-emerald-200",
                        },
                        {
                          title: "Supply disruptions",
                          sentiment: "Bearish",
                          color: "text-red-700 bg-red-50 border-red-200",
                        },
                      ].map((news, i) => (
                        <div
                          key={i}
                          className="flex h-[100px] min-w-[140px] flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm"
                        >
                          <div className="text-xs font-bold leading-tight text-slate-900">
                            {news.title}
                          </div>
                          <div
                            className={`inline-block w-max rounded border px-2 py-0.5 text-[9px] font-extrabold uppercase ${news.color}`}
                          >
                            {news.sentiment}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {feature.key === "workspace" && (
                    <div className="h-full w-full p-4">
                      <div className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                        <div className="flex gap-2">
                          <div className="h-9 w-28 rounded-xl border border-slate-200 bg-white" />
                          <div className="h-9 flex-1 rounded-xl border border-slate-200 bg-white" />
                        </div>
                        <div className="grid flex-1 gap-3 sm:grid-cols-[0.75fr_1.25fr]">
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="h-4 w-20 rounded-full bg-slate-100" />
                            <div className="mt-3 space-y-2">
                              {[1, 2, 3].map((bar) => (
                                <div key={bar} className="h-8 rounded-xl bg-slate-50" />
                              ))}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="h-full rounded-xl bg-[linear-gradient(180deg,#f8fafc,#ffffff)] p-3">
                              <div className="h-4 w-24 rounded-full bg-slate-100" />
                              <div className="mt-4 h-[70%] rounded-2xl border border-dashed border-slate-300" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mb-3 flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border ${bgColorClass}`}
                  >
                    <Icon className={`h-5 w-5 ${textColorClass}`} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">{feature.title}</h3>
                </div>
                <p className="text-sm font-medium leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
