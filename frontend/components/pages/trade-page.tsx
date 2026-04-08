"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { AiDisclaimer } from "@/components/layout/ai-disclaimer";
import { useTradeWorkspace } from "@/components/providers/trade-workspace-provider";
import { LiveLineChart } from "@/components/stock/live-line-chart";
import { StockCard } from "@/components/stock/stock-card";
import type { ModelProfile, RefreshCadence } from "@/lib/mocks/stock-data";
import { MAX_TRACKED_TICKERS, type TradeMode } from "@/lib/trade-workspace";

const SIGNAL_BADGES = {
  bullish:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  bearish:
    "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  neutral:
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
} as const;

const SIGNAL_LABELS = {
  bullish: "Leaning buy",
  bearish: "Leaning sell",
  neutral: "Wait for now",
} as const;

const ACTION_BADGES = {
  buy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  sell: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  hold: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
} as const;

const ACTION_LABELS = {
  buy: "Paper buy",
  sell: "Paper sell",
  hold: "Wait",
} as const;

const TRADE_MODE_LABELS = {
  manual: "I decide",
  model: "TradeWise decides",
} as const;

const MODEL_PROFILE_LABELS: Record<ModelProfile, string> = {
  safe: "Safe",
  neutral: "Neutral",
  risky: "Risky",
} as const;
const CADENCE_LABELS: Record<RefreshCadence, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
} as const;
const TRADE_UI_MODE_STORAGE_KEY = "tradewise.tradeUiMode";

type TradeUiMode = "simple" | "advanced";

function InfoHint({ label: _label }: { label: string }) {
  void _label;
  return null;
}

/**
 * Trade route: compact single-surface trading workspace with manual and future
 * model-run modes.
 */
export function TradePage() {
  const [uiMode, setUiMode] = useState<TradeUiMode>("simple");
  const [manualShares, setManualShares] = useState(1);
  const {
    trackedTickers,
    selectedTicker,
    quotesByTicker,
    loading,
    error,
    lastAction,
    tradeMode,
    modelProfile,
    refreshCadence,
    autoTradeEnabled,
    mockTradingDay,
    mockTradingLoading,
    mockTradingError,
    autoTradeResult,
    paperTradeLog,
    autoTradeLoading,
    autoTradeError,
    newsReportsByTicker,
    newsReportLoading,
    newsReportError,
    paperAccount,
    paperAccountLoading,
    paperAccountError,
    streamConnected,
    streamError,
    lastTickAt,
    clock,
    marketSnapshot,
    simulationSnapshot,
    advanceSimulationTime,
    resetSimulationTime,
    setTradeMode,
    setModelProfile,
    setRefreshCadence,
    setAutoTradeEnabled,
    checkSelectedStocks,
    selectTrackedTicker,
    removeTrackedTicker,
    loadNewsReport,
    runAutoTrade,
    loadMockTradingDay,
    simulateOrder,
    clearPaperTradeLog,
  } = useTradeWorkspace();

  useEffect(() => {
    const stored = window.localStorage.getItem(TRADE_UI_MODE_STORAGE_KEY);
    if (stored === "simple" || stored === "advanced") {
      startTransition(() => {
        setUiMode(stored);
      });
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TRADE_UI_MODE_STORAGE_KEY, uiMode);
  }, [uiMode]);

  const isAdvancedView = uiMode === "advanced";
  const currentTime = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(clock);
  const quote = selectedTicker ? quotesByTicker[selectedTicker] ?? null : null;
  const newsReport = selectedTicker ? newsReportsByTicker[selectedTicker] ?? null : null;
  const activeProfile = quote?.selectedModelProfile ?? modelProfile;
  const currentSymbol = quote?.ticker || selectedTicker || trackedTickers[0] || "AAPL";
  const trackedTickerSummary = trackedTickers.length
    ? trackedTickers.join(", ")
    : currentSymbol;
  const visibleNewsHeadlines =
    newsReport?.newsHeadlines?.length
      ? newsReport.newsHeadlines
      : quote?.newsHeadlines ?? [];
  const streamStatusDescription =
    tradeMode !== "model"
      ? null
      : !marketSnapshot.isOpen
        ? "Live stream paused until market open"
        : streamConnected
          ? "Live stream connected"
          : "Connecting to IEX stream";
  const marketStatusLine = streamStatusDescription
    ? `${marketSnapshot.statusLabel} | ${streamStatusDescription}`
    : marketSnapshot.statusLabel;
  const liveFeedLabel = !marketSnapshot.isOpen
    ? "Paused"
    : streamConnected
      ? "Connected"
      : "Connecting";
  const selectedSimPrice =
    selectedTicker && simulationSnapshot?.currentPrices[selectedTicker] != null
      ? simulationSnapshot.currentPrices[selectedTicker]
      : null;

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Trade
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Track up to three stocks on one live stream with paper trading controls.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-800">
            {currentTime}
          </span>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            {marketStatusLine}
            {tradeMode === "model" ? ` | IEX: ${liveFeedLabel}` : null}
          </p>
        </div>

        <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Experience view
              <InfoHint label="Simple keeps this page beginner-friendly. Advanced shows all detailed metrics and logs." />
            </span>
            <select
              value={uiMode}
              onChange={(e) => setUiMode(e.target.value as TradeUiMode)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="simple">Simple</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              How you want to practice
              <InfoHint label="Choose whether you want to make the paper decisions yourself or let TradeWise handle the paper trades for you." />
            </span>
            <select
              value={tradeMode}
              onChange={(e) => setTradeMode(e.target.value as TradeMode)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="manual">{TRADE_MODE_LABELS.manual}</option>
              <option value="model">{TRADE_MODE_LABELS.model}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Risk style
              <InfoHint label="Safe reacts more carefully, Neutral stays balanced, and Risky responds more aggressively to market moves." />
            </span>
            <select
              value={modelProfile}
              onChange={(e) => setModelProfile(e.target.value as ModelProfile)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="safe">Safe</option>
              <option value="neutral">Neutral</option>
              <option value="risky">Risky</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Check-ins
              <InfoHint label="This is how often TradeWise checks the model and, if enabled, decides whether to place a paper trade." />
            </span>
            <select
              value={refreshCadence}
              onChange={(e) => setRefreshCadence(e.target.value as RefreshCadence)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="1m">1 minute</option>
              <option value="5m">5 minutes</option>
              <option value="15m">15 minutes</option>
            </select>
          </label>
        </section>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Trade basket
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              This page now works from the tracked symbols below. Change the basket from the dashboard starter sectors instead of typing a new ticker here.
            </p>
            {!trackedTickers.length ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                No tracked symbols loaded. <Link href="/dashboard" className="font-semibold text-zinc-900 underline underline-offset-4 dark:text-zinc-100">Go to Dashboard</Link> to preload a basket.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {tradeMode === "model" ? (
              <button
                type="button"
                onClick={() => void loadMockTradingDay()}
                disabled={mockTradingLoading || !selectedTicker}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {mockTradingLoading ? "Loading..." : "Replay a practice day"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void checkSelectedStocks()}
              disabled={loading || !trackedTickers.length}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading ? "Checking..." : "Check selected stocks"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {isAdvancedView
            ? `Mode: ${TRADE_MODE_LABELS[tradeMode]}. Risk style: ${MODEL_PROFILE_LABELS[modelProfile]}. Check-ins: ${CADENCE_LABELS[refreshCadence]}. Tracking ${trackedTickers.length}/${MAX_TRACKED_TICKERS} symbols.`
            : "Simple view is on: showing beginner-friendly guidance with less data clutter."}
        </p>
        {error ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        {mockTradingError ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {mockTradingError}
          </p>
        ) : null}
        {autoTradeError ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {autoTradeError}
          </p>
        ) : null}
        {paperAccountError ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {paperAccountError}
          </p>
        ) : null}
        {streamError ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {streamError}
          </p>
        ) : null}
        {newsReportError ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {newsReportError}
          </p>
        ) : null}
      </section>

      {trackedTickers.length ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Tracked symbols
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                One shared stream updates every symbol below. Select a card to focus the detail view.
              </p>
            </div>
            {isAdvancedView ? (
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                {trackedTickers.length}/{MAX_TRACKED_TICKERS} slots used
              </p>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {trackedTickers.map((ticker) => {
              const trackedQuote = quotesByTicker[ticker];
              const isSelected = ticker === selectedTicker;
              return (
                <div
                  key={ticker}
                  className={`rounded-2xl border p-3 transition ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900/70"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectTrackedTicker(ticker)}
                    className="w-full text-left"
                  >
                    <StockCard quote={trackedQuote} ticker={ticker} compact />
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {trackedQuote?.signal ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            SIGNAL_BADGES[trackedQuote.signal]
                          }`}
                        >
                          {SIGNAL_LABELS[trackedQuote.signal]}
                          {isAdvancedView
                            ? ` • ${trackedQuote.confidence?.toFixed(1) ?? "-"}%`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Loading quote...
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                          Selected
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeTrackedTicker(ticker)}
                        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {quote ? (
        <section className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <StockCard quote={quote} />

            {tradeMode === "manual" ? (
              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Self-directed practice
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Use this mode if you want to compare your own call with the model before
                  risking real money.
                </p>
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Shares
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={manualShares}
                    onChange={(e) =>
                      setManualShares(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => simulateOrder("buy", manualShares)}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Practice buy
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateOrder("sell", manualShares)}
                    className="flex-1 rounded-xl border border-red-300 bg-white py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Practice sell
                  </button>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-start gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      TradeWise-guided practice
                    </h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      TradeWise can watch {trackedTickerSummary} for you and make
                      paper-only decisions while this page stays open.
                    </p>
                  </div>
                </div>
                {isAdvancedView ? (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Risk style
                        <InfoHint label="This is the personality of the model you picked: cautious, balanced, or aggressive." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {MODEL_PROFILE_LABELS[modelProfile]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Check-ins
                        <InfoHint label="How often TradeWise pauses to reevaluate the stock and decide whether to paper buy, paper sell, or wait." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {CADENCE_LABELS[refreshCadence]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        When it runs
                        <InfoHint label="The automatic checks happen while the market is open and this page is open in your browser." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        Market hours
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Live price feed
                        <InfoHint label="This feed keeps the price moving so the chart and price card stay current between model check-ins." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {!marketSnapshot.isOpen
                          ? "Paused until market open"
                          : streamConnected
                            ? "Live IEX stream is on"
                            : "Connecting to the IEX stream"}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        What it is doing
                        <InfoHint label="This tells you whether TradeWise is actively checking the model right now or waiting for the next market session." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {marketSnapshot.isOpen
                          ? `Checking every ${CADENCE_LABELS[refreshCadence]}`
                          : "Waiting for the next session"}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {marketSnapshot.isOpen
                    ? autoTradeEnabled
                      ? `Paper trading is on. TradeWise will keep checking ${trackedTickerSummary} every ${CADENCE_LABELS[refreshCadence]}.`
                      : "The live price feed is ready. Turn on paper trading when you want TradeWise to handle the practice calls."
                    : "The market is closed right now, so live prices and paper trades stay paused until the next trading session."}
                </p>
                {isAdvancedView ? (
                  <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Paper account snapshot
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {paperAccountLoading && !paperAccount
                        ? "Loading account..."
                        : paperAccount
                        ? `$${paperAccount.cash.toFixed(2)} cash • ${paperAccount.positions.length} open position${
                            paperAccount.positions.length === 1 ? "" : "s"
                          }`
                        : "No account snapshot yet."}
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoTradeEnabled((current) => !current)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      autoTradeEnabled
                        ? "bg-red-600 text-white hover:bg-red-500"
                        : "bg-emerald-600 text-white hover:bg-emerald-500"
                    }`}
                  >
                    {autoTradeEnabled ? "Pause paper trading" : "Start paper trading"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAutoTrade()}
                    disabled={autoTradeLoading}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {autoTradeLoading ? "Checking..." : "Check once now"}
                  </button>
                </div>
                {autoTradeResult ? (
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    Most recent paper move: {ACTION_LABELS[autoTradeResult.action]}.{" "}
                    {autoTradeResult.statusMessage}
                  </p>
                ) : null}
              </section>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {quote.signal ? (
              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      What TradeWise suggests right now
                    </h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      A quick read for {quote.ticker} based on the latest data this page has
                      seen.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      SIGNAL_BADGES[quote.signal]
                    }`}
                  >
                    {SIGNAL_LABELS[quote.signal]}
                  </span>
                </div>

                {isAdvancedView ? (
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        How sure it is
                        <InfoHint label="This is the model's confidence level. Higher means it sees a clearer pattern, not that the outcome is guaranteed." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {quote.confidence?.toFixed(1) ?? "-"}%
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Risk style
                        <InfoHint label="This is the version of TradeWise you picked at the top of the page." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {MODEL_PROFILE_LABELS[activeProfile]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Latest price
                        <InfoHint label="The most recent price the page has for this stock." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        ${quote.lastPrice.toFixed(2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Today&apos;s move
                        <InfoHint label="This shows how much the price has moved in percentage terms over the latest visible window." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {quote.changePercent >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Live update
                        <InfoHint label="This is the time of the last live price update from the streaming feed." />
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {lastTickAt ? new Date(lastTickAt).toLocaleTimeString() : "-"}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                    Quick take: TradeWise currently leans {SIGNAL_LABELS[quote.signal].toLowerCase()} on {quote.ticker}. Switch to Advanced view for confidence and timing metrics.
                  </p>
                )}

                {tradeMode === "model" ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Live news report
                      </p>
                      <button
                        type="button"
                        onClick={() => void loadNewsReport({ forceRefresh: true, showLoading: true })}
                        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        disabled={newsReportLoading}
                      >
                        {newsReportLoading ? "Refreshing..." : "Refresh now"}
                      </button>
                    </div>
                    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {SIGNAL_LABELS[newsReport?.signal ?? quote.signal]} •{" "}
                        {(newsReport?.confidence ?? quote.confidence ?? 0).toFixed(1)}%
                        {" "}confidence
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                      {newsReport?.studentReasoning ?? newsReport?.report ?? "No news report yet."}
                    </p>
                    {visibleNewsHeadlines.length ? (
                      <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                        {visibleNewsHeadlines.map((headline) => (
                          <p key={headline}>{headline}</p>
                        ))}
                      </div>
                    ) : null}
                    {isAdvancedView ? (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Updates every {CADENCE_LABELS[refreshCadence]} | Last refresh:{" "}
                        {newsReport ? new Date(newsReport.refreshedAt).toLocaleTimeString() : "-"} | Source:{" "}
                        {newsReport?.fromCache ? "cache" : "fresh"}
                        {newsReport?.reasoningSource ? ` | Reasoning: ${newsReport.reasoningSource}` : ""}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        News summary refreshed in the background.
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            {quote.history?.length ? (
              <LiveLineChart history={quote.history} ticker={quote.ticker} />
            ) : quote.chartDataUri ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <Image
                  src={quote.chartDataUri}
                  alt={`${quote.ticker} synthetic price chart`}
                  width={960}
                  height={320}
                  unoptimized
                  className="h-auto w-full rounded-xl"
                />
              </section>
            ) : null}

            {simulationSnapshot ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Simulation snapshot
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => advanceSimulationTime(-1)}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      -1 step
                    </button>
                    <button
                      type="button"
                      onClick={() => advanceSimulationTime(1)}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      +1 step
                    </button>
                    <button
                      type="button"
                      onClick={resetSimulationTime}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      Latest
                    </button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Simulation time
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {new Date(simulationSnapshot.time).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Current price
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {selectedSimPrice == null ? "-" : `$${selectedSimPrice.toFixed(2)}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Portfolio value
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      ${simulationSnapshot.portfolioValue.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Cash
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      ${simulationSnapshot.cash.toFixed(2)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Positions
                  </p>
                  {simulationSnapshot.positions.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {simulationSnapshot.positions.map((position) => (
                        <li key={position.symbol}>
                          {position.symbol}: {position.shares} shares @ $
                          {position.price.toFixed(2)} = ${position.value.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      No open positions yet.
                    </p>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-4 py-6 dark:border-zinc-700 dark:bg-zinc-950/40">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Load a trade basket first
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Use the dashboard starter sectors to preload up to three stocks, then come back here to review the basket, replay a practice day, or let TradeWise paper trade it for you.
          </p>
          <Link
            href="/dashboard"
            className="mt-3 inline-flex rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to Dashboard
          </Link>
        </section>
      )}

      {lastAction ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {lastAction}
        </p>
      ) : null}

      {mockTradingDay && isAdvancedView ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Practice replay
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                A dress rehearsal using recent market history so you can see how the model
                would have behaved before trying a live paper-trading day.
              </p>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {mockTradingDay.sessionLabel}
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Model build
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {mockTradingDay.modelVersion}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Risk style
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {MODEL_PROFILE_LABELS[mockTradingDay.modelProfile]}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Starting cash
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                ${mockTradingDay.summary.startingCash.toFixed(2)}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Ending value
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                ${mockTradingDay.summary.endingEquity.toFixed(2)}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Return
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {mockTradingDay.summary.returnPercent >= 0 ? "+" : ""}
                {mockTradingDay.summary.returnPercent.toFixed(2)}%
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Paper moves
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {mockTradingDay.summary.buys} buy / {mockTradingDay.summary.sells} sell
              </dd>
            </div>
          </dl>

          <details className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Show the step-by-step replay
            </summary>
            <div className="max-h-80 overflow-auto border-t border-zinc-200 dark:border-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead className="bg-zinc-50 dark:bg-zinc-900/80">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <th className="px-3 py-2">Step</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Signal</th>
                    <th className="px-3 py-2">Paper move</th>
                    <th className="px-3 py-2">Practice balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {mockTradingDay.steps.map((step) => (
                    <tr key={`${step.slot}-${step.sourceDate}`}>
                      <td className="px-3 py-2 font-mono text-zinc-700 dark:text-zinc-300">
                        {step.slot}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {step.sourceDate}
                      </td>
                      <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                        ${step.price.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            SIGNAL_BADGES[step.signal]
                          }`}
                        >
                          {SIGNAL_LABELS[step.signal]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            ACTION_BADGES[step.action]
                          }`}
                        >
                          {ACTION_LABELS[step.action]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                        ${step.equity.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Source: {mockTradingDay.datasetSource}
          </p>
        </section>
      ) : null}

      {paperTradeLog.length && isAdvancedView ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Recent paper activity
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                The newest practice moves from this browser session.
              </p>
            </div>
            <button
              type="button"
              onClick={clearPaperTradeLog}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Clear log
            </button>
          </div>

          <div className="mt-4 max-h-72 overflow-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {paperTradeLog.map((entry) => (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {entry.ticker}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        ACTION_BADGES[entry.action]
                      }`}
                    >
                      {ACTION_LABELS[entry.action]}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        SIGNAL_BADGES[entry.signal]
                      }`}
                    >
                      {SIGNAL_LABELS[entry.signal]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {entry.submitted
                      ? entry.statusMessage
                      : `No paper trade placed. ${entry.statusMessage}`}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Risk style: {MODEL_PROFILE_LABELS[entry.modelProfile]} | Confidence:{" "}
                    {entry.confidence.toFixed(1)}%
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <AiDisclaimer />
    </div>
  );
}
