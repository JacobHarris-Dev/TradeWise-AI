"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { AiDisclaimer } from "@/components/layout/ai-disclaimer";
import { HoldingCard } from "@/components/portfolio/holding-card";
import { usePortfolioWorkspace } from "@/components/providers/trade-workspace-provider";

const PortfolioAllocationChart = dynamic(
  () =>
    import("@/components/portfolio/portfolio-allocation-chart").then(
      (mod) => mod.PortfolioAllocationChart,
    ),
  { ssr: false },
);

const PortfolioGrowthChart = dynamic(
  () =>
    import("@/components/portfolio/portfolio-growth-chart").then(
      (mod) => mod.PortfolioGrowthChart,
    ),
  { ssr: false },
);

/**
 * Portfolio: live paper-account holdings linked to the Trade tab.
 */
export function PortfolioPage() {
  const {
    portfolio,
    portfolioLoading: loading,
    portfolioError: error,
    refreshPortfolio,
  } = usePortfolioWorkspace();

  const positionRows = useMemo(
    () => portfolio?.positions ?? [],
    [portfolio],
  );

  const allocationRows = useMemo(() => {
    if (!portfolio) {
      return [];
    }

    const rows = positionRows.map((position) => ({
      ticker: position.ticker,
      value: position.marketValue,
    }));

    if (portfolio.cash > 0) {
      rows.unshift({
        ticker: "Cash",
        value: portfolio.cash,
      });
    }

    return rows;
  }, [portfolio, positionRows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Portfolio
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Linked to your active paper-trading workspace.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Cash</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            ${portfolio ? portfolio.cash.toFixed(2) : "0.00"}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Positions Value</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            ${portfolio ? portfolio.positionsValue.toFixed(2) : "0.00"}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Total Equity</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            ${portfolio ? portfolio.totalEquity.toFixed(2) : "0.00"}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Day Return</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              (portfolio?.dayChange ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {portfolio
              ? `${portfolio.dayChange >= 0 ? "+" : "-"}$${Math.abs(portfolio.dayChange).toFixed(2)}`
              : "$0.00"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {portfolio ? `${portfolio.dayChangePercent >= 0 ? "+" : "-"}${Math.abs(portfolio.dayChangePercent).toFixed(2)}%` : "0.00%"}
          </p>
        </article>
      </div>

      <PortfolioGrowthChart
        totalValue={portfolio?.totalEquity ?? portfolio?.cash ?? 0}
        title="Total paper account value"
        points={portfolio?.points}
        dayChange={portfolio?.dayChange}
        dayChangePercent={portfolio?.dayChangePercent}
        updatedAt={portfolio?.updatedAt}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PortfolioAllocationChart
          positions={allocationRows}
          description="Cash and open positions in your paper account"
        />

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Holdings</h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                {portfolio?.positions.length ?? 0} position
                {(portfolio?.positions.length ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshPortfolio()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Refresh
            </button>
          </div>
          {portfolio?.updatedAt ? (
            <p className="mt-2 text-xs text-zinc-500">
              Last updated {new Date(portfolio.updatedAt).toLocaleTimeString()}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
          {loading ? (
            <p className="mt-3 text-sm text-zinc-500">Loading portfolio...</p>
          ) : null}

          {!loading && positionRows.length ? (
            <ul className="mt-4 flex flex-col gap-3">
              {positionRows.map((position) => (
                <li key={position.ticker}>
                  <HoldingCard
                    ticker={position.ticker}
                    shares={position.shares}
                    valueDisplay={`$${position.marketValue.toFixed(2)}`}
                  />
                </li>
              ))}
            </ul>
          ) : !loading ? (
            <div className="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6">
              <p className="text-sm text-zinc-600">
                No open paper positions yet. Your cash is still being tracked above,
                and the charts stay visible while you wait for the first buy.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <AiDisclaimer />
    </div>
  );
}
