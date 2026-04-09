"use client";

import { useStockData } from "@/lib/hooks/use-backend";
import {
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Newspaper,
  Loader2,
} from "lucide-react";

interface StockSignalDisplayProps {
  ticker: string;
  size?: "small" | "large";
}

/**
 * Reusable component to display stock signal with AI reasoning and news context
 */
export function StockSignalDisplay({
  ticker,
  size = "small",
}: StockSignalDisplayProps) {
  const { quote, signal, news, loading } = useStockData(ticker);

  if (loading) {
    return (
      <div className={`${size === "large" ? "p-6" : "p-4"} rounded-2xl border border-slate-800 bg-slate-900/90`}>
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          <span className="text-sm text-slate-400">Loading signal...</span>
        </div>
      </div>
    );
  }

  if (size === "small") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">{ticker}</div>
            <div className="text-lg font-bold text-white">
              ${quote?.price.toFixed(2) || "—"}
            </div>
            {quote && (
              <div
                className={`flex items-center gap-1 text-xs font-bold ${
                  quote.change >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {quote.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {quote.changePercent.toFixed(2)}%
              </div>
            )}
          </div>
          {signal && (
            <div className="text-right">
              <div className="mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                <span className="text-sm font-bold text-emerald-300">
                  {signal.signal}
                </span>
              </div>
              <div className="text-2xl font-bold text-white">
                {(signal.confidence * 100).toFixed(0)}%
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Large display
  return (
    <div className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-6">
        <div>
          <div className="text-sm font-medium text-slate-500">Analyzing</div>
          <div className="text-3xl font-bold text-white">{ticker}</div>
        </div>
        {quote && (
          <div className="text-right">
            <div className="text-3xl font-bold text-white">
              ${quote.price.toFixed(2)}
            </div>
            <div
              className={`flex items-center justify-end gap-1 text-lg font-bold ${
                quote.change >= 0 ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {quote.change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {quote.changePercent.toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Signal & Reasoning */}
        <div className="space-y-6">
          {signal && (
            <>
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  AI Signal
                </h3>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" />
                  <div>
                    <div className="text-xl font-bold text-emerald-300">
                      {signal.signal}
                    </div>
                    <div className="text-3xl font-extrabold text-white">
                      {(signal.confidence * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-slate-500">Confidence</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Reasoning
                </h3>
                <p className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300">
                  {signal.reasoning}
                </p>
                {signal.technicalFactors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {signal.technicalFactors.map((factor, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300"
                      >
                        {factor}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* News Context */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Market Context
          </h3>
          {news && news.length > 0 ? (
            <div className="space-y-3">
              {news.map((item, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3"
                >
                  <div className="flex items-start gap-2">
                    <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-100">
                        {item.title}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                            item.sentiment === "BULLISH"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : item.sentiment === "BEARISH"
                                ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                                : "border-slate-700 bg-slate-900 text-slate-300"
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
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-center text-sm text-slate-500">
              No recent news available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
