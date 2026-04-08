"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { TradeStarterSectors } from "@/components/dashboard/trade-starter-sectors";
import { AiDisclaimer } from "@/components/layout/ai-disclaimer";
import { useTradeWorkspace } from "@/components/providers/trade-workspace-provider";
import { LiveLineChart } from "@/components/stock/live-line-chart";
import { StockCard } from "@/components/stock/stock-card";
import type { ModelProfile, RefreshCadence } from "@/lib/mocks/stock-data";
import { MAX_TRACKED_TICKERS, type TradeMode } from "@/lib/trade-workspace";

const SIGNAL_BADGES = {
  bullish:
    "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  bearish:
    "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  neutral:
    "bg-slate-800/90 text-slate-300 ring-1 ring-inset ring-slate-700",
} as const;

const SIGNAL_LABELS = {
  bullish: "Leaning buy",
  bearish: "Leaning sell",
  neutral: "Wait for now",
} as const;

const ACTION_BADGES = {
  buy: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  sell: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  hold: "bg-slate-800/90 text-slate-300 ring-1 ring-inset ring-slate-700",
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

  return (
    <div className="flex max-w-6xl flex-col gap-4 text-slate-100">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-white">
            Trade
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Track up to three stocks on one live stream with paper trading controls.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-slate-300">
            {currentTime}
          </span>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            {marketStatusLine}
            {tradeMode === "model" ? ` | IEX: ${liveFeedLabel}` : null}
          </p>
        </div>

        <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Experience view
              <InfoHint label="Simple keeps this page beginner-friendly. Advanced shows all detailed metrics and logs." />
            </span>
            <select
              value={uiMode}
              onChange={(e) => setUiMode(e.target.value as TradeUiMode)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="simple">Simple</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              How you want to practice
              <InfoHint label="Choose whether you want to make the paper decisions yourself or let TradeWise handle the paper trades for you." />
            </span>
            <select
              value={tradeMode}
              onChange={(e) => setTradeMode(e.target.value as TradeMode)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="manual">{TRADE_MODE_LABELS.manual}</option>
              <option value="model">{TRADE_MODE_LABELS.model}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Risk style
              <InfoHint label="Safe reacts more carefully, Neutral stays balanced, and Risky responds more aggressively to market moves." />
            </span>
            <select
              value={modelProfile}
              onChange={(e) => setModelProfile(e.target.value as ModelProfile)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="safe">Safe</option>
              <option value="neutral">Neutral</option>
              <option value="risky">Risky</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Check-ins
              <InfoHint label="This is how often TradeWise checks the model and, if enabled, decides whether to place a paper trade." />
            </span>
            <select
              value={refreshCadence}
              onChange={(e) => setRefreshCadence(e.target.value as RefreshCadence)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="1m">1 minute</option>
              <option value="5m">5 minutes</option>
              <option value="15m">15 minutes</option>
            </select>
          </label>
        </section>
      </section>

      <section id="trade-setup" className="w-full">
        <TradeStarterSectors />
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Trade basket
            </p>
            <p className="mt-1 text-sm text-slate-400">
              This page works from the tracked symbols below. Load a starter basket from the sectors panel above.
            </p>
            {!trackedTickers.length ? (
              <p className="mt-2 text-sm text-slate-400">
                No tracked symbols loaded. <Link href="#trade-setup" className="font-semibold text-indigo-300 underline underline-offset-4">Use the sectors panel above</Link> to preload a basket.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {tradeMode === "model" ? (
              <button
                type="button"
                onClick={() => void loadMockTradingDay()}
                disabled={mockTradingLoading || !selectedTicker}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-60"
              >
                {mockTradingLoading ? "Loading..." : "Replay a practice day"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void checkSelectedStocks()}
              disabled={loading || !trackedTickers.length}
              className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-indigo-400 disabled:opacity-60"
            >
              {loading ? "Checking..." : "Check selected stocks"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          {isAdvancedView
            ? `Mode: ${TRADE_MODE_LABELS[tradeMode]}. Risk style: ${MODEL_PROFILE_LABELS[modelProfile]}. Check-ins: ${CADENCE_LABELS[refreshCadence]}. Tracking ${trackedTickers.length}/${MAX_TRACKED_TICKERS} symbols.`
            : "Simple view is on: showing beginner-friendly guidance with less data clutter."}
        </p>
        {error ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
        ) : null}
        {mockTradingError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {mockTradingError}
          </p>
        ) : null}
        {autoTradeError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {autoTradeError}
          </p>
        ) : null}
        {paperAccountError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {paperAccountError}
          </p>
        ) : null}
        {streamError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {streamError}
          </p>
        ) : null}
        {newsReportError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {newsReportError}
          </p>
        ) : null}
      </section>

      {trackedTickers.length ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Tracked symbols
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                One shared stream updates every symbol below. Select a card to focus the detail view.
              </p>
            </div>
            {isAdvancedView ? (
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
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
                      ? "border-indigo-500/60 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.12)]"
                      : "border-slate-800 bg-slate-950/70"
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
                        <span className="text-xs text-slate-500">
                          Loading quote...
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-300">
                          Selected
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeTrackedTicker(ticker)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
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
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-slate-950/20">
                <h2 className="text-sm font-semibold text-white">
                  Self-directed practice
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Use this mode if you want to compare your own call with the model before
                  risking real money.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => simulateOrder("buy")}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Practice buy
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateOrder("sell")}
                    className="flex-1 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/15"
                  >
                    Practice sell
                  </button>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-slate-950/20">
                <div className="flex items-start gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      TradeWise-guided practice
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      TradeWise can watch {trackedTickerSummary} for you and make
                      paper-only decisions while this page stays open.
                    </p>
                  </div>
                </div>
                {isAdvancedView ? (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Risk style
                        <InfoHint label="This is the personality of the model you picked: cautious, balanced, or aggressive." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {MODEL_PROFILE_LABELS[modelProfile]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Check-ins
                        <InfoHint label="How often TradeWise pauses to reevaluate the stock and decide whether to paper buy, paper sell, or wait." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {CADENCE_LABELS[refreshCadence]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        When it runs
                        <InfoHint label="The automatic checks happen while the market is open and this page is open in your browser." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        Market hours
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Live price feed
                        <InfoHint label="This feed keeps the price moving so the chart and price card stay current between model check-ins." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {!marketSnapshot.isOpen
                          ? "Paused until market open"
                          : streamConnected
                            ? "Live IEX stream is on"
                            : "Connecting to the IEX stream"}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        What it is doing
                        <InfoHint label="This tells you whether TradeWise is actively checking the model right now or waiting for the next market session." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {marketSnapshot.isOpen
                          ? `Checking every ${CADENCE_LABELS[refreshCadence]}`
                          : "Waiting for the next session"}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  {marketSnapshot.isOpen
                    ? autoTradeEnabled
                      ? `Paper trading is on. TradeWise will keep checking ${trackedTickerSummary} every ${CADENCE_LABELS[refreshCadence]}.`
                      : "The live price feed is ready. Turn on paper trading when you want TradeWise to handle the practice calls."
                    : "The market is closed right now, so live prices and paper trades stay paused until the next trading session."}
                </p>
                {isAdvancedView ? (
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Paper account snapshot
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
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
                        ? "bg-rose-500 text-white hover:bg-rose-400"
                        : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    }`}
                  >
                    {autoTradeEnabled ? "Pause paper trading" : "Start paper trading"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAutoTrade()}
                    disabled={autoTradeLoading}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-60"
                  >
                    {autoTradeLoading ? "Checking..." : "Check once now"}
                  </button>
                </div>
                {autoTradeResult ? (
                  <p className="mt-3 text-sm text-slate-400">
                    Most recent paper move: {ACTION_LABELS[autoTradeResult.action]}.{" "}
                    {autoTradeResult.statusMessage}
                  </p>
                ) : null}
              </section>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {quote.signal ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-slate-950/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      What TradeWise suggests right now
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
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
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        How sure it is
                        <InfoHint label="This is the model's confidence level. Higher means it sees a clearer pattern, not that the outcome is guaranteed." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {quote.confidence?.toFixed(1) ?? "-"}%
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Risk style
                        <InfoHint label="This is the version of TradeWise you picked at the top of the page." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {MODEL_PROFILE_LABELS[activeProfile]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Latest price
                        <InfoHint label="The most recent price the page has for this stock." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        ${quote.lastPrice.toFixed(2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Today&apos;s move
                        <InfoHint label="This shows how much the price has moved in percentage terms over the latest visible window." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {quote.changePercent >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Live update
                        <InfoHint label="This is the time of the last live price update from the streaming feed." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {lastTickAt ? new Date(lastTickAt).toLocaleTimeString() : "-"}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Quick take: TradeWise currently leans {SIGNAL_LABELS[quote.signal].toLowerCase()} on {quote.ticker}. Switch to Advanced view for confidence and timing metrics.
                  </p>
                )}

                {tradeMode === "model" ? (
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Live news report
                      </p>
                      <button
                        type="button"
                        onClick={() => void loadNewsReport({ forceRefresh: true, showLoading: true })}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
                        disabled={newsReportLoading}
                      >
                        {newsReportLoading ? "Refreshing..." : "Refresh now"}
                      </button>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2">
                      <p className="text-sm font-semibold text-white">
                        {SIGNAL_LABELS[newsReport?.signal ?? quote.signal]} •{" "}
                        {(newsReport?.confidence ?? quote.confidence ?? 0).toFixed(1)}%
                        {" "}confidence
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {newsReport?.studentReasoning ?? newsReport?.report ?? "No news report yet."}
                    </p>
                    {visibleNewsHeadlines.length ? (
                      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                        {visibleNewsHeadlines.map((headline) => (
                          <p key={headline}>{headline}</p>
                        ))}
                      </div>
                    ) : null}
                    {isAdvancedView ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Updates every {CADENCE_LABELS[refreshCadence]} | Last refresh:{" "}
                        {newsReport ? new Date(newsReport.refreshedAt).toLocaleTimeString() : "-"} | Source:{" "}
                        {newsReport?.fromCache ? "cache" : "fresh"}
                        {newsReport?.reasoningSource ? ` | Reasoning: ${newsReport.reasoningSource}` : ""}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
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
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-slate-950/20">
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
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-6 shadow-lg shadow-slate-950/20">
          <h2 className="text-sm font-semibold text-white">
            Load a trade basket first
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Use the starter sectors to load up to three stocks, then review the basket, replay a practice day, or let TradeWise paper trade it for you.
          </p>
          <Link
            href="#trade-setup"
            className="mt-3 inline-flex rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-indigo-400"
          >
            Open setup tools
          </Link>
        </section>
      )}

      {lastAction ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {lastAction}
        </p>
      ) : null}

      {mockTradingDay && isAdvancedView ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Practice replay
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                A dress rehearsal using recent market history so you can see how the model
                would have behaved before trying a live paper-trading day.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {mockTradingDay.sessionLabel}
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Model build
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                {mockTradingDay.modelVersion}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Risk style
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                {MODEL_PROFILE_LABELS[mockTradingDay.modelProfile]}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Starting cash
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                ${mockTradingDay.summary.startingCash.toFixed(2)}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Ending value
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                ${mockTradingDay.summary.endingEquity.toFixed(2)}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Return
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                {mockTradingDay.summary.returnPercent >= 0 ? "+" : ""}
                {mockTradingDay.summary.returnPercent.toFixed(2)}%
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Paper moves
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                {mockTradingDay.summary.buys} buy / {mockTradingDay.summary.sells} sell
              </dd>
            </div>
          </dl>

          <details className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white">
              Show the step-by-step replay
            </summary>
            <div className="max-h-80 overflow-auto border-t border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-900">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Step</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Signal</th>
                    <th className="px-3 py-2">Paper move</th>
                    <th className="px-3 py-2">Practice balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {mockTradingDay.steps.map((step) => (
                    <tr key={`${step.slot}-${step.sourceDate}`}>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {step.slot}
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {step.sourceDate}
                      </td>
                      <td className="px-3 py-2 text-white">
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
                      <td className="px-3 py-2 text-white">
                        ${step.equity.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="mt-3 text-xs text-slate-500">
            Source: {mockTradingDay.datasetSource}
          </p>
        </section>
      ) : null}

      {paperTradeLog.length > 0 && isAdvancedView ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Recent paper activity
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                The newest practice moves from this browser session.
              </p>
            </div>
            <button
              type="button"
              onClick={clearPaperTradeLog}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
            >
              Clear log
            </button>
          </div>

          <div className="mt-4 max-h-72 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/70">
            <ul className="divide-y divide-slate-800/70">
              {paperTradeLog.map((entry) => (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-mono text-sm font-semibold text-white">
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
                  <p className="mt-2 text-sm text-slate-300">
                    {entry.submitted
                      ? entry.statusMessage
                      : `No paper trade placed. ${entry.statusMessage}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
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
