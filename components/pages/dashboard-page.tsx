"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { Watchlist } from "@/components/watchlist/watchlist";

/**
 * Dashboard route: personalized greeting, watchlist (Firestore when signed in), market strip.
 */
export function DashboardPage() {
  const { user, loading } = useAuth();

  const welcomeLine = (() => {
    if (loading) return "Welcome…";
    if (!user) return "Welcome to TradeWise";
    const name =
      user.displayName?.trim() ||
      user.email?.split("@")[0] ||
      "Trader";
    return `Welcome, ${name}`;
  })();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {welcomeLine}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Track symbols, scan the market snapshot, and use Trade or Portfolio for
          the next steps.
        </p>
      </section>

      <Watchlist />
      <MarketOverview />
    </div>
  );
}
