"use client";

import { AiDisclaimer } from "@/components/layout/ai-disclaimer";
import { MOCK_HOLDINGS, getMockStockQuote } from "@/lib/mocks/stock-data";
import { HoldingCard } from "@/components/portfolio/holding-card";
import { PortfolioAllocationChart } from "@/components/portfolio/portfolio-allocation-chart";
import { PortfolioGrowthChart } from "@/components/portfolio/portfolio-growth-chart";

/**
 * Portfolio: growth chart, allocation donut, and holdings — mock data for hackathon demo.
 */
export function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Portfolio
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Demo data — charts are interactive; swap in live balances when you connect an API.
        </p>
      </div>

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

      <AiDisclaimer />
      <PortfolioGrowthChart />

      <div className="grid gap-6 lg:grid-cols-2">
        <PortfolioAllocationChart />

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Holdings</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {MOCK_HOLDINGS.length} position{MOCK_HOLDINGS.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {MOCK_HOLDINGS.map((h) => {
              const q = getMockStockQuote(h.ticker);
              const est = (q.lastPrice * h.shares).toFixed(2);
              return (
                <li key={h.ticker}>
                  <HoldingCard
                    ticker={h.ticker}
                    shares={h.shares}
                    valueDisplay={`$${est}`}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
