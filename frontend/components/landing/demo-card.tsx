"use client";

import { useStockData } from "@/lib/hooks/use-backend";
import { AlertCircle, CheckCircle2, Newspaper } from "lucide-react";

export function LiveDemoCard() {
  const { quote, signal, news, loading } = useStockData("AAPL");

  if (loading && !quote && !signal && news.length === 0) {
    return (
      <div className="mx-auto h-96 w-full max-w-5xl animate-pulse rounded-[28px] bg-slate-100" />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_-48px_rgba(15,23,42,0.35)]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-slate-200" />
            <div>
              <div className="text-sm text-slate-500">Currently Analyzing</div>
              <div className="text-2xl font-bold text-slate-900">AAPL</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-500">Apple Inc.</div>
            <div className="text-3xl font-bold text-slate-900">
              ${quote ? quote.price.toFixed(2) : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        {/* Left: Signal & Reasoning */}
        <div className="space-y-6">
          {/* AI Signal */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              AI Consensus
            </div>
            {signal ? (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <div className="font-bold text-emerald-600">
                      {signal.signal}
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900">
                    {(signal.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-16 bg-slate-100 rounded animate-pulse" />
            )}
          </div>

          {/* Reasoning */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Why This Signal?
            </div>
            {signal ? (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-sm text-slate-700 leading-relaxed">
                  {signal.reasoning}
                </p>
                {signal.technicalFactors.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200">
                    {signal.technicalFactors.map((factor, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 rounded bg-emerald-50 border border-emerald-100 text-emerald-700 font-medium"
                      >
                        {factor}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-24 bg-slate-100 rounded animate-pulse" />
            )}
          </div>
        </div>

        {/* Right: News Context */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Recent Market Context
            </div>
            {news && news.length > 0 ? (
              <div className="space-y-2">
                {news.slice(0, 3).map((item, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200"
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-900 truncate">
                          {item.title}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border inline-block ${
                              item.sentiment === "BULLISH"
                                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                : item.sentiment === "BEARISH"
                                  ? "text-red-700 bg-red-50 border-red-200"
                                  : "text-slate-600 bg-slate-100 border-slate-200"
                            }`}
                          >
                            {item.sentiment}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {item.source}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            )}
          </div>

          {/* Risk Indicator */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Risk Assessment
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-100">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <div className="font-bold text-amber-900">Moderate Risk</div>
                <div className="text-sm text-amber-700">
                  High volatility expected around earnings
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
