"use client";

import { MOCK_HOLDINGS, getMockStockQuote } from "@/lib/mocks/stock-data";
import { HoldingCard } from "@/components/portfolio/holding-card";

/**
 * Portfolio route: list holdings from mock data.
 * Later: fetch `holdings` from Firestore (or your ledger) and map into `HoldingCard`.
 */
export function PortfolioPage() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Portfolio
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Demo positions only. Replace <code className="font-mono text-xs">MOCK_HOLDINGS</code>{" "}
          in <code className="font-mono text-xs">lib/mocks/stock-data.ts</code> or load from
          Firestore per user.
        </p>
      </section>

      <ul className="flex max-w-lg flex-col gap-3">
        {MOCK_HOLDINGS.map((h) => {
          const q = getMockStockQuote(h.ticker);
          const est = (q.lastPrice * h.shares).toFixed(2);
          return (
            <li key={h.ticker}>
              <HoldingCard
                ticker={h.ticker}
                shares={h.shares}
                valueDisplay={`$${est} (mock)`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
