"use client";

import { useEffect, useState } from "react";
import { StockCard } from "@/components/stock/stock-card";
import { fetchStockQuotes } from "@/lib/stock-quote";
import type { MockQuote } from "@/lib/mocks/stock-data";

const MARKET_TICKERS = ["SPY", "QQQ", "DIA"] as const;

/**
 * Live market snapshot built from the Python backend quote endpoint.
 */
export function MarketOverview() {
  const [quotes, setQuotes] = useState<MockQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const liveQuotes = await fetchStockQuotes([...MARKET_TICKERS], {
          includeChart: false,
        });
        if (!active) return;
        setQuotes(liveQuotes);
      } catch (e) {
        if (!active) return;
        setQuotes([]);
        setError(e instanceof Error ? e.message : "Could not load market data.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800">
        Market overview
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Live quotes are loaded from the Python backend.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">
          Loading live market data…
        </p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {quotes.map((quote) => (
            <StockCard key={quote.ticker} quote={quote} compact />
          ))}
        </div>
      )}
    </section>
  );
}
