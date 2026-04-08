"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  History,
  LineChart,
  PieChart,
  Wallet,
} from "lucide-react";
import { AiDisclaimer } from "@/components/layout/ai-disclaimer";
import { usePortfolioWorkspace, useTradeWorkspace } from "@/components/providers/trade-workspace-provider";
import { Line, LineChart as RechartsLineChart, ResponsiveContainer, YAxis } from "recharts";
import type { MockQuote } from "@/lib/mocks/stock-data";
import { fetchStockQuotes } from "@/lib/stock-quote";

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

const DEFAULT_FEATURED_TICKERS = ["AAPL", "MSFT", "NVDA"];

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PortfolioPage() {
  const {
    portfolio,
    portfolioLoading: loading,
    portfolioError: error,
    refreshPortfolio,
  } = usePortfolioWorkspace();
  const { paperTradeLog } = useTradeWorkspace();
  const [featuredQuotes, setFeaturedQuotes] = useState<MockQuote[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const positionRows = useMemo(() => portfolio?.positions ?? [], [portfolio]);

  const allocationRows = useMemo(() => {
    if (!portfolio) {
      return [];
    }

    const rows = positionRows.map((position) => ({
      ticker: position.ticker,
      value: position.marketValue,
    }));

    if (portfolio.cash > 0) {
      rows.unshift({ ticker: "Cash", value: portfolio.cash });
    }

    return rows;
  }, [portfolio, positionRows]);

  const featuredSymbols = useMemo(() => {
    const positionSymbols = portfolio?.positions.map((position) => position.ticker) ?? [];
    return Array.from(
      new Set([...positionSymbols, ...DEFAULT_FEATURED_TICKERS]),
    ).slice(0, 3);
  }, [portfolio?.positions]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeaturedQuotes() {
      try {
        setFeaturedLoading(true);
        const batch = await fetchStockQuotes(featuredSymbols, {
          includeChart: false,
        });
        if (!cancelled) {
          setFeaturedQuotes(batch.results);
        }
      } catch {
        if (!cancelled) {
          setFeaturedQuotes([]);
        }
      } finally {
        if (!cancelled) {
          setFeaturedLoading(false);
        }
      }
    }

    void loadFeaturedQuotes();

    return () => {
      cancelled = true;
    };
  }, [featuredSymbols]);

  const totalEquity = portfolio?.totalEquity ?? portfolio?.cash ?? 0;
  const baselineEquity = portfolio?.baselineEquity ?? portfolio?.startingCash ?? 10000;
  const totalReturn = totalEquity - baselineEquity;
  const totalReturnPercent =
    baselineEquity > 0 ? (totalReturn / baselineEquity) * 100 : 0;
  const isPositive = totalReturn >= 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="mb-2 flex items-center gap-3">
        <Briefcase className="h-8 w-8 text-indigo-400" />
        <h1 className="text-3xl font-bold tracking-tight text-white">Portfolio</h1>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-8 shadow-lg">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-indigo-500/5 blur-3xl" />
        <div className="relative z-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="space-y-2 border-b border-slate-800 pb-6 md:border-b-0 md:border-r md:pb-0 md:pr-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Total Equity
            </h3>
            <div className="font-mono text-4xl font-bold text-white">
              ${formatMoney(totalEquity)}
            </div>
            <div
              className={`flex items-center text-sm font-medium ${
                isPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="mr-1 h-4 w-4" />
              ) : (
                <ArrowDownRight className="mr-1 h-4 w-4" />
              )}
              ${formatMoney(Math.abs(totalReturn))} (
              {Math.abs(totalReturnPercent).toFixed(2)}%) All Time
            </div>
          </div>

          <div className="space-y-2 border-b border-slate-800 pb-6 md:border-b-0 md:border-r md:px-6 md:pb-0">
            <h3 className="flex items-center text-sm font-semibold uppercase tracking-wider text-slate-400">
              <Wallet className="mr-2 h-4 w-4 text-indigo-400" /> Purchasing Power
            </h3>
            <div className="font-mono text-3xl font-bold text-slate-200">
              ${formatMoney(portfolio?.cash ?? 0)}
            </div>
          </div>

          <div className="space-y-2 md:pl-6">
            <h3 className="flex items-center text-sm font-semibold uppercase tracking-wider text-slate-400">
              <PieChart className="mr-2 h-4 w-4 text-indigo-400" /> Invested Capital
            </h3>
            <div className="font-mono text-3xl font-bold text-slate-200">
              ${formatMoney(portfolio?.positionsValue ?? 0)}
            </div>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Featured markets
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">Top watchlist movers</h2>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400">
            Portfolio snapshot
          </span>
        </div>

        {featuredLoading ? (
          <div className="p-6 text-sm text-slate-500">Loading featured markets...</div>
        ) : featuredQuotes.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No featured markets available right now.</div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {featuredQuotes.map((stock) => {
              const isPositive = stock.changePercent >= 0;
              const chartData =
                stock.history?.map((value, index) => ({
                  id: index,
                  price: value,
                })) ?? [];

              return (
                <Link
                  key={stock.ticker}
                  href="/trade"
                  className="group flex items-center gap-4 p-4 transition-colors hover:bg-slate-800/30"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 font-bold text-slate-200 transition-colors group-hover:bg-slate-700">
                    {stock.ticker.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-slate-100">{stock.ticker}</h3>
                        <p className="truncate text-sm text-slate-500">{stock.companyName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-medium text-white">
                          ${stock.lastPrice.toFixed(2)}
                        </p>
                        <p
                          className={`flex items-center justify-end text-sm font-medium ${
                            isPositive ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="mr-1 h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="mr-1 h-3 w-3" />
                          )}
                          {Math.abs(stock.changePercent).toFixed(2)}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 h-10 w-full min-w-0 opacity-70 transition-opacity group-hover:opacity-100">
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <RechartsLineChart data={chartData}>
                          <YAxis domain={["auto", "auto"]} hide />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke={isPositive ? "#10b981" : "#fb7185"}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PortfolioGrowthChart
            totalValue={portfolio?.totalEquity ?? portfolio?.cash ?? 0}
            title="Total paper account value"
            points={portfolio?.points}
            dayChange={portfolio?.dayChange}
            dayChangePercent={portfolio?.dayChangePercent}
            updatedAt={portfolio?.updatedAt}
          />

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-6 py-5">
              <h2 className="flex items-center text-lg font-semibold text-white">
                <BarChart3 className="mr-2 h-5 w-5 text-indigo-400" /> Current Positions
              </h2>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400">
                  {positionRows.length} Assets
                </span>
                <button
                  type="button"
                  onClick={() => void refreshPortfolio()}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                >
                  Refresh
                </button>
              </div>
            </div>

            {error ? (
              <p className="px-6 pt-4 text-sm text-rose-400">{error}</p>
            ) : null}
            {loading ? (
              <p className="px-6 py-6 text-sm text-slate-500">Loading portfolio...</p>
            ) : null}

            {!loading && positionRows.length === 0 ? (
              <div className="flex flex-col items-center p-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-slate-500">
                  <LineChart className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-300">
                  No active positions
                </h3>
                <p className="mb-6 max-w-sm text-slate-500">
                  You haven&apos;t made any paper trades yet. Head over to the trading desk
                  to start building your simulated portfolio.
                </p>
                <Link
                  href="/trade"
                  className="rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  Explore Markets
                </Link>
              </div>
            ) : null}

            {!loading && positionRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-6 py-4">Symbol</th>
                      <th className="px-6 py-4 text-right">Shares</th>
                      <th className="px-6 py-4 text-right">Avg Price</th>
                      <th className="px-6 py-4 text-right">Current</th>
                      <th className="px-6 py-4 text-right">Total Value</th>
                      <th className="px-6 py-4 text-right">Unrealized P/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {positionRows.map((position) => {
                      const currentValue = position.marketValue;
                      const costBasis = position.avgEntryPrice * position.shares;
                      const unrealized = currentValue - costBasis;
                      const pnlPercent =
                        costBasis > 0 ? (unrealized / costBasis) * 100 : 0;
                      const pnlPositive = unrealized >= 0;

                      return (
                        <tr key={position.ticker} className="transition-colors hover:bg-slate-800/30">
                          <td className="px-6 py-4">
                            <Link href="/trade" className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-800 text-xs font-bold text-slate-300 transition-colors hover:bg-indigo-500/20 hover:text-indigo-300">
                                {position.ticker.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">
                                  {position.ticker}
                                </p>
                                <p className="text-xs text-slate-500">
                                  Open position
                                </p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-slate-300">
                            {position.shares}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-slate-300">
                            ${position.avgEntryPrice.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-slate-300">
                            ${position.currentPrice.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-white">
                            ${currentValue.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div
                              className={`font-mono font-medium ${
                                pnlPositive ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {pnlPositive ? "+" : "-"}${Math.abs(unrealized).toFixed(2)}
                            </div>
                            <div
                              className={`mt-1 text-xs font-medium ${
                                pnlPositive ? "text-emerald-500/80" : "text-rose-500/80"
                              }`}
                            >
                              {pnlPositive ? "+" : "-"}{Math.abs(pnlPercent).toFixed(2)}%
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <PortfolioAllocationChart
            positions={allocationRows}
            title="Allocation"
            description="Cash and open positions across your current paper account"
          />

          <div className="flex max-h-[600px] flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
            <div className="flex items-center border-b border-slate-800 bg-slate-900/50 px-6 py-5">
              <History className="mr-2 h-5 w-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Order History</h2>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {paperTradeLog.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
                  <p className="text-sm">No transaction history</p>
                  <p className="mt-2 text-xs">Paper trades you make will appear here</p>
                </div>
              ) : (
                paperTradeLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-800/80 bg-slate-950/50 p-4 transition-colors hover:border-slate-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            entry.action === "buy"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : entry.action === "sell"
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {entry.action}
                        </span>
                        <span className="font-bold text-white">{entry.ticker}</span>
                      </div>
                      <span className="text-xs font-medium text-slate-500">
                        {new Date(entry.timestamp).toLocaleDateString()}{" "}
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="mt-2 flex items-end justify-between border-t border-slate-800/50 pt-2">
                      <div>
                        <p className="text-xs text-slate-400">Signal</p>
                        <p className="text-sm text-slate-200">{entry.signal}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Confidence</p>
                        <p className="font-mono text-sm text-slate-200">
                          {entry.confidence.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AiDisclaimer />
    </div>
  );
}
