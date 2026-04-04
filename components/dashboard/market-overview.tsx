import { MOCK_MARKET_SUMMARY } from "@/lib/mocks/stock-data";
import { StockCard } from "@/components/stock/stock-card";

/**
 * Non-interactive placeholder for indices / macro context.
 * Hook this to a real market feed when you have API keys and rate limits sorted out.
 */
export function MarketOverview() {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Market overview
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Demo data only — connect a market data provider when you are ready.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {MOCK_MARKET_SUMMARY.map((q) => (
          <StockCard key={q.ticker} quote={q} compact />
        ))}
      </div>
    </section>
  );
}
