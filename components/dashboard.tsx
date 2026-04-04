"use client";

import { LoginButton } from "@/components/auth/login-button";
import { WatchlistPanel } from "@/components/watchlist/watchlist-panel";

export function Dashboard() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            TradeWise
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Sign in with Google and track tickers on your watchlist.
          </p>
        </div>
        <LoginButton />
      </header>
      <WatchlistPanel />
    </div>
  );
}
