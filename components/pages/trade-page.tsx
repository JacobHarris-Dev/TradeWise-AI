"use client";

import { useCallback, useState } from "react";
import { fetchStockQuote } from "@/lib/stock-quote";
import { StockCard } from "@/components/stock/stock-card";
import type { MockQuote } from "@/lib/mocks/stock-data";

/**
 * Trade route: ticker input, mock quote via `fetchStockQuote` (swap for a real API later),
 * and non-functional Buy / Sell actions for layout only.
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
    } catch {
      setError("Could not load quote (demo).");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [tickerInput]);

  const simulateOrder = useCallback((side: "buy" | "sell") => {
    setLastAction(
      `${side === "buy" ? "Buy" : "Sell"} simulated — no order sent. ` +
        `(Ticker: ${quote?.ticker ?? tickerInput.trim().toUpperCase() || "—"})`,
    );
  }, [quote?.ticker, tickerInput]);

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Trade
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Look up a symbol (mock data). Wire `fetchStockQuote` in `lib/stock-quote.ts`
          to your brokerage or market data API when ready.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Ticker
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void loadQuote();
            }}
            placeholder="e.g. AAPL"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void loadQuote()}
            disabled={loading}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Loading…" : "Load quote"}
          </button>
        </div>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </section>

      {quote ? (
        <section className="flex flex-col gap-4">
          <StockCard quote={quote} />
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
              className="flex-1 rounded-lg border border-red-300 bg-white py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Sell
            </button>
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Load a quote to see mock price data and enable the order buttons (still
          non-functional).
        </p>
      )}

      {lastAction ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {lastAction}
        </p>
      ) : null}
    </div>
  );
}
