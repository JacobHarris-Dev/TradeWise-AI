"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";

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
          Trade now carries the AI prompt, starter sectors, and live market news in one place. Portfolio stays focused on paper performance.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Link
          href="/trade"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Trade
          </p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900">
            Open the trading workspace
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Ask the TradeWise AI Prompt for a basket, load starter sectors, and read the latest market headlines from one screen.
          </p>
        </Link>

        <Link
          href="/portfolio"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Portfolio
          </p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900">
            Review paper performance
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Track equity, open positions, and recent paper-trading results without the old dashboard widgets in the way.
          </p>
        </Link>
      </section>
    </div>
  );
}
