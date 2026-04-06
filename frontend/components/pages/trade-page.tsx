"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { fetchStockQuote } from "@/lib/stock-quote";
import { StockCard } from "@/components/stock/stock-card";
import type { MockQuote } from "@/lib/mocks/stock-data";

const SIGNAL_BADGES = {
  bullish: "bg-emerald-100 text-emerald-800",
  bearish: "bg-red-100 text-red-800",
  neutral: "bg-zinc-100 text-zinc-700",
} as const;

/**
 * Trade route: ticker input, ML quote via `fetchStockQuote`, and non-functional
 * Buy / Sell actions for layout only.
 */
export function TradePage() {
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [quote, setQuote] = useState<MockQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const loadQuote = useCallback(async () => {
    const raw = tickerInput.trim();
    if (!raw) {
      setError("Enter a ticker symbol.");
      return;
    }
    setError(null);
    setLastAction(null);
    setLoading(true);
    try {
      const q = await fetchStockQuote(raw);
      setQuote(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quote.");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [tickerInput]);

  const simulateOrder = useCallback((side: "buy" | "sell") => {
    const orderTicker = quote?.ticker ?? (tickerInput.trim().toUpperCase() || "—");
    setLastAction(
      `${side === "buy" ? "Buy" : "Sell"} simulated — no order sent. ` +
        `(Ticker: ${orderTicker})`,
    );
  }, [quote?.ticker, tickerInput]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-8">
          <section>
            <h1 className="text-2xl font-semibold text-zinc-900">Trade</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Look up a symbol and pull the model output from the Python backend
              via the Next.js proxy route.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <label className="text-xs font-medium text-zinc-600">Ticker</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadQuote();
                }}
                placeholder="e.g. AAPL"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => void loadQuote()}
                disabled={loading}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {loading ? "Loading…" : "Load quote"}
              </button>
            </div>
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : null}
          </section>

          {quote ? (
            <section className="flex flex-col gap-4">
              <StockCard quote={quote} />
              {quote.chartDataUri ? (
                <section className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-3">
                  <Image
                    src={quote.chartDataUri}
                    alt={`${quote.ticker} synthetic price chart`}
                    width={960}
                    height={360}
                    unoptimized
                    className="h-auto w-full rounded-xl"
                  />
                </section>
              ) : null}
              {quote.signal ? (
                <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Model readout
                    </h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        SIGNAL_BADGES[quote.signal]
                      }`}
                    >
                      {quote.signal}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Confidence
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900">
                        {quote.confidence?.toFixed(1) ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Model
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900">
                        {quote.modelVersion ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Change
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900">
                        {quote.changePercent >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Last price
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900">
                        ${quote.lastPrice.toFixed(2)}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-sm leading-6 text-zinc-600">
                    {quote.explanation}
                  </p>
                </section>
              ) : null}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => simulateOrder("buy")}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => simulateOrder("sell")}
                  className="flex-1 rounded-lg border border-red-300 bg-white py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  Sell
                </button>
              </div>
            </section>
          ) : (
            <p className="text-sm text-zinc-500">
              Load a quote to see backend-backed price data and enable the order
              buttons (still non-functional).
            </p>
          )}

          {lastAction ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {lastAction}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
