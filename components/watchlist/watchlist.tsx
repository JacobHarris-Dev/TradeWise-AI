"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  addTickerToWatchlist,
  subscribeToWatchlist,
} from "@/lib/firestore";
import {
  MOCK_WATCHLIST_TICKERS,
  getMockStockQuote,
} from "@/lib/mocks/stock-data";
import { StockCard } from "@/components/stock/stock-card";

/**
 * Watchlist block for the dashboard:
 * - Signed-in users: live Firestore list + add ticker.
 * - Guests: read-only demo tickers so the layout still looks complete.
 */
export function Watchlist() {
  const { user, loading: authLoading } = useAuth();
  const [tickers, setTickers] = useState<string[]>([]);
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

  const displayTickers = useMemo(() => {
    if (user) return tickers;
    return [...MOCK_WATCHLIST_TICKERS];
  }, [user, tickers]);

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
        {displayTickers.length === 0 ? (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">
            No tickers yet. Add symbols above.
          </li>
        ) : (
          displayTickers.map((t) => (
            <li key={t}>
              <StockCard quote={getMockStockQuote(t)} />
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
