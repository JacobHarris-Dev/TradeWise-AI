"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { InvestmentChatBubble } from "@/components/dashboard/investment-chat-bubble";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { TradeStarterSectors } from "@/components/dashboard/trade-starter-sectors";
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
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {welcomeLine}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Track symbols, scan the market snapshot, and use Trade or Portfolio for
          the next steps.
        </p>
        <InvestmentChatBubble />
      </section>

      <TradeStarterSectors />
      <Watchlist />
      <MarketOverview />
    </div>
  );
}
