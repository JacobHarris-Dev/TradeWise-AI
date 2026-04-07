"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import type { MockQuote, NewsReport } from "@/lib/mocks/stock-data";
import {
  fetchNewsReport,
  fetchPaperAccount,
  fetchStockQuote,
  fetchStockRecommendations,
} from "@/lib/stock-quote";
import {
  buildQuoteMap,
  MAX_TRACKED_TICKERS,
  readStoredJson,
  readStoredModelProfile,
  readStoredRefreshCadence,
  SECTOR_OPTIONS,
  TRADE_STORAGE_KEYS,
  writeStoredJson,
  writeTradeWorkspace,
} from "@/lib/trade-workspace";

export function TradeStarterSectors() {
  const router = useRouter();
  const { user } = useAuth();
  const accountUserId = user?.uid ?? "guest";
  const [preferredSectors, setPreferredSectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch("/trade");

    const stored = readStoredJson<string[]>(TRADE_STORAGE_KEYS.preferredSectors);
    if (!stored || !Array.isArray(stored)) {
      return;
    }

    const next = Array.from(
      new Set(
        stored
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) =>
            SECTOR_OPTIONS.includes(value as (typeof SECTOR_OPTIONS)[number]),
          ),
      ),
    ).slice(0, MAX_TRACKED_TICKERS);

    if (next.length) {
      setPreferredSectors(next);
    }
  }, [router]);

  useEffect(() => {
    writeStoredJson(TRADE_STORAGE_KEYS.preferredSectors, preferredSectors);
  }, [preferredSectors]);

  const toggleSector = (sector: string) => {
    setError(null);
    setPreferredSectors((current) => {
      if (current.includes(sector)) {
        return current.filter((value) => value !== sector);
      }
      if (current.length >= MAX_TRACKED_TICKERS) {
        return current;
      }
      return [...current, sector];
    });
  };

  const loadTradeWorkspace = async () => {
    if (!preferredSectors.length) {
      setError("Select at least one starter sector.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const recommendations = await fetchStockRecommendations(preferredSectors, {
        count: MAX_TRACKED_TICKERS,
      });
      const tickers = recommendations
        .map((item) => item.ticker.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, MAX_TRACKED_TICKERS);

      if (!tickers.length) {
        throw new Error("No starter stocks were available for those sectors.");
      }

      const modelProfile = readStoredModelProfile();
      const refreshCadence = readStoredRefreshCadence();
      const newsRefreshSeconds =
        refreshCadence === "15m" ? 900 : refreshCadence === "5m" ? 300 : 60;

      const quoteResults = await Promise.allSettled(
        tickers.map((ticker) => fetchStockQuote(ticker, { includeChart: false, modelProfile })),
      );
      const quotes: MockQuote[] = [];
      for (const result of quoteResults) {
        if (result.status === "fulfilled") {
          quotes.push(result.value);
        }
      }

      if (!quotes.length) {
        throw new Error("Could not preload the starter stock quotes.");
      }

      const selectedTicker = quotes[0]?.ticker ?? tickers[0] ?? "";
      const [paperAccountResult, newsResult] = await Promise.allSettled([
        fetchPaperAccount(accountUserId),
        selectedTicker
          ? fetchNewsReport(selectedTicker, {
              modelProfile,
              refreshSeconds: newsRefreshSeconds,
            })
          : Promise.resolve(null),
      ]);

      const newsReportsByTicker: Record<string, NewsReport> = {};
      if (newsResult.status === "fulfilled" && newsResult.value?.ticker) {
        newsReportsByTicker[newsResult.value.ticker] = newsResult.value;
      }

      writeStoredJson(TRADE_STORAGE_KEYS.preferredSectors, preferredSectors);
      writeStoredJson(
        TRADE_STORAGE_KEYS.trackedTickers,
        quotes.map((quote) => quote.ticker),
      );
      writeTradeWorkspace({
        savedAt: Date.now(),
        trackedTickers: quotes.map((quote) => quote.ticker),
        selectedTicker,
        quotesByTicker: buildQuoteMap(quotes),
        newsReportsByTicker,
        paperAccount:
          paperAccountResult.status === "fulfilled" ? paperAccountResult.value : null,
        autoTradeResult: null,
        lastAction: `Loaded ${quotes.map((quote) => quote.ticker).join(", ")} from your starter sectors.`,
      });

      startTransition(() => {
        router.push("/trade");
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the starter stocks.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Starter sectors</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Choose up to three sectors and preload the Trade workspace with three starter stocks before you open it.
          </p>
        </div>
        <div className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {preferredSectors.length}/{MAX_TRACKED_TICKERS} selected
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SECTOR_OPTIONS.map((sector) => {
          const isSelected = preferredSectors.includes(sector);
          return (
            <button
              key={sector}
              type="button"
              onClick={() => toggleSector(sector)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                isSelected
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {sector}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void loadTradeWorkspace()}
          disabled={loading || !preferredSectors.length}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Loading trade workspace..." : "Open Trade with 3 stocks"}
        </button>
        <p className="text-xs text-zinc-500">
          This preloads the trade basket before the route opens.
        </p>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      ) : null}
    </section>
  );
}
