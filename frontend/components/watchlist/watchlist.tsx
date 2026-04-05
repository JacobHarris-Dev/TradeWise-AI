"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  addTickerToWatchlist,
  subscribeToWatchlist,
} from "@/lib/firestore";
import { fetchStockQuotes } from "@/lib/stock-quote";
import type { MockQuote } from "@/lib/mocks/stock-data";
import { StockCard } from "@/components/stock/stock-card";

const GUEST_WATCHLIST_TICKERS = ["AAPL", "MSFT", "GOOGL", "NVDA"] as const;

/**
 * Watchlist block for the dashboard:
 * - Signed-in users: live Firestore list + add ticker.
 * - Guests: live quotes for a fixed starter symbol set.
 */
export function Watchlist() {
  const { user, loading: authLoading } = useAuth();
  const [tickers, setTickers] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<MockQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to the user’s watchlist document when we have a Firebase user.
  useEffect(() => {
    if (!user) {
      setTickers([]);
      return;
    }
    return subscribeToWatchlist(user.uid, setTickers);
  }, [user]);

  const displayTickers = user ? tickers : GUEST_WATCHLIST_TICKERS;

  useEffect(() => {
    let active = true;

    if (authLoading) {
      setQuotes([]);
      setQuotesError(null);
      setQuotesLoading(false);
      return () => {
        active = false;
      };
    }

    if (displayTickers.length === 0) {
      setQuotes([]);
      setQuotesError(null);
      setQuotesLoading(false);
      return () => {
        active = false;
      };
    }

    setQuotesLoading(true);
    setQuotesError(null);

    void (async () => {
      try {
        const liveQuotes = await fetchStockQuotes([...displayTickers], {
          includeChart: false,
        });
        if (!active) return;
        setQuotes(liveQuotes);
      } catch (e) {
        if (!active) return;
        setQuotes([]);
        setQuotesError(e instanceof Error ? e.message : "Could not load live quotes.");
      } finally {
        if (active) {
          setQuotesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [authLoading, displayTickers]);

  const onAdd = useCallback(async () => {
    if (!user) return;
    setError(null);
    setPending(true);
    try {
      await addTickerToWatchlist(user.uid, input);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add ticker.");
    } finally {
      setPending(false);
    }
  }, [user, input]);

  if (authLoading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading watchlist…</p>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Watchlist
        </h2>
        {!user ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Sign in to edit and sync your list.
          </p>
        ) : null}
      </div>

      {user ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onAdd();
            }}
            placeholder="Ticker e.g. AAPL"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            disabled={pending || !input.trim()}
            onClick={() => void onAdd()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add ticker"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {quotesLoading ? (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">
            Loading live quotes…
          </li>
        ) : quotesError ? (
          <li className="text-sm text-red-600 dark:text-red-400">
            {quotesError}
          </li>
        ) : displayTickers.length === 0 ? (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">
            No tickers yet. Add symbols above.
          </li>
        ) : (
          quotes.map((quote) => (
            <li key={quote.ticker}>
              <StockCard quote={quote} />
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
