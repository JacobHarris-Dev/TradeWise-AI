"use client";

import Link from "next/link";
import { ChevronRight, TrendingUp, Wallet } from "lucide-react";
import { InvestmentChatBubble } from "@/components/dashboard/investment-chat-bubble";
import { useAuth } from "@/components/providers/auth-provider";
import { usePortfolioWorkspace, useTradeWorkspace } from "@/components/providers/trade-workspace-provider";
import { TradeMarketNews } from "@/components/trade/trade-market-news";

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { portfolio } = usePortfolioWorkspace();
  const { trackedTickers, simulationSnapshot, tradingTimeMode, paperAccount } =
    useTradeWorkspace();

  const useHistoricSim =
    tradingTimeMode === "historic" && simulationSnapshot != null;

  const welcomeLine = (() => {
    if (authLoading) return "Welcome back";
    if (!user) return "Welcome to TradeWise";
    return `Welcome, ${user.displayName?.trim() || user.email?.split("@")[0] || "Trader"}`;
  })();

  const holdingsValue = useHistoricSim
    ? simulationSnapshot.portfolioValue - simulationSnapshot.cash
    : portfolio?.positionsValue ?? 0;
  const totalEquity = useHistoricSim
    ? simulationSnapshot.portfolioValue
    : portfolio?.totalEquity ?? portfolio?.cash ?? paperAccount?.cash ?? 0;
  const buyingPower = useHistoricSim
    ? simulationSnapshot.cash
    : portfolio?.cash ?? paperAccount?.cash ?? 0;
  const activePositions = useHistoricSim
    ? simulationSnapshot.positions.length
    : portfolio?.positions.length ?? paperAccount?.positions.length ?? 0;
  const baselineEquity = useHistoricSim
    ? 10_000
    : portfolio?.baselineEquity ?? portfolio?.startingCash ?? 10000;
  const totalReturn = totalEquity - baselineEquity;

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-100">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88),rgba(30,41,59,0.92))] p-6 shadow-2xl shadow-slate-950/30 md:p-8">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Dashboard
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">{welcomeLine}</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Your AI trading workspace
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Review account health, practice with the TradeWise AI prompt, and scan featured markets from one calm workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/trade"
                className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
              >
                Open Trade Desk <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
              <Link
                href="/portfolio"
                className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-800"
              >
                View Portfolio <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-md lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Wallet className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Total Equity</span>
              </div>
              <div className="text-2xl font-semibold text-white md:text-3xl">
                ${formatMoney(totalEquity)}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {totalReturn >= 0 ? "+" : "-"}${formatMoney(Math.abs(totalReturn))}{" "}
                {useHistoricSim ? "vs session start" : "all time"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Buying Power</span>
              </div>
              <div className="text-2xl font-semibold text-white md:text-3xl">
                ${formatMoney(buyingPower)}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                ${formatMoney(holdingsValue)} deployed in open paper positions.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Active Positions</span>
              </div>
              <div className="text-2xl font-semibold text-white md:text-3xl">
                {activePositions}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Tracked symbols: {trackedTickers.length || 0}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <ChevronRight className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Quick Start</span>
              </div>
              <div className="text-sm font-medium text-slate-100">
                Use the prompt below to shape a basket, then open Trade to manage it.
              </div>
              <p className="mt-1 text-xs text-slate-400">
                The dashboard keeps the AI prompt and market news in one wide stack.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="grid gap-6">
          <InvestmentChatBubble expanded showOpenTradeButton={false} />
          <TradeMarketNews />
        </div>
      </section>
    </div>
  );
}
