"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  addTickerToWatchlist,
  subscribeToWatchlist,
} from "@/lib/firestore";

export function WatchlistPanel() {
  const { user, loading: authLoading } = useAuth();
  const [tickers, setTickers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setTickers([]);
      return;
    }
    const unsub = subscribeToWatchlist(user.uid, setTickers);
    return unsub;
  }, [user]);

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
    return null;
  }

  if (!user) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Sign in to view and edit your watchlist.
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onAdd();
          }}
          placeholder="Ticker e.g. AAPL"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
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
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Your watchlist
        </h2>
        {tickers.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No tickers yet. Add one above.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tickers.map((t) => (
              <li
                key={t}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
