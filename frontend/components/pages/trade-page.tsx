"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { AiDisclaimer } from "@/components/layout/ai-disclaimer";
import { getMlBackendWebSocketUrl } from "@/lib/ml/backend-ws";
import { LiveLineChart } from "@/components/stock/live-line-chart";
import { StockCard } from "@/components/stock/stock-card";
import type {
  AutoTradeResult,
  ChartType,
  LiveTradeTick,
  MockQuote,
  MockTradingDay,
  ModelProfile,
  RefreshCadence,
} from "@/lib/mocks/stock-data";
import { executeAutoTrade, fetchMockTradingDay, fetchStockQuote } from "@/lib/stock-quote";

const SIGNAL_BADGES = {
  bullish: "bg-emerald-100 text-emerald-800",
  bearish: "bg-red-100 text-red-800",
  neutral: "bg-zinc-100 text-zinc-700",
} as const;

const ACTION_BADGES = {
  buy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  sell: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  hold: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
} as const;

const TRADE_MODE_LABELS = {
  manual: "Manual",
  model: "Model Run",
} as const;

const MODEL_PROFILE_LABELS: Record<ModelProfile, string> = {
  safe: "Safe",
  neutral: "Neutral",
  risky: "Risky",
} as const;

const STORAGE_KEYS = {
  tradeMode: "tradewise.tradeMode",
  modelProfile: "tradewise.modelProfile",
  chartType: "tradewise.chartType",
  refreshCadence: "tradewise.refreshCadence",
  autoTradeEnabled: "tradewise.autoTradeEnabled",
} as const;
const CADENCE_LABELS: Record<RefreshCadence, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
} as const;
const CADENCE_MS: Record<RefreshCadence, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
} as const;

function getEasternMarketSnapshot(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const totalMinutes = hour * 60 + minute;
  const isOpen = isWeekday && totalMinutes >= 570 && totalMinutes < 960;

  return {
    isOpen,
    statusLabel: isOpen ? "Market open" : "Market closed",
  };
}

type TradeMode = "manual" | "model";

/**
 * Trade route: compact single-surface trading workspace with manual and future
 * model-run modes.
 */
export function TradePage() {
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [quote, setQuote] = useState<MockQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [tradeMode, setTradeMode] = useState<TradeMode>("manual");
  const [modelProfile, setModelProfile] = useState<ModelProfile>("neutral");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [refreshCadence, setRefreshCadence] = useState<RefreshCadence>("1m");
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [mockTradingDay, setMockTradingDay] = useState<MockTradingDay | null>(null);
  const [mockTradingLoading, setMockTradingLoading] = useState(false);
  const [mockTradingError, setMockTradingError] = useState<string | null>(null);
  const [autoTradeResult, setAutoTradeResult] = useState<AutoTradeResult | null>(null);
  const [autoTradeLoading, setAutoTradeLoading] = useState(false);
  const [autoTradeError, setAutoTradeError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const currentTime = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(clock);
  const marketSnapshot = getEasternMarketSnapshot(clock);

  useEffect(() => {
    const storedTradeMode = window.localStorage.getItem(STORAGE_KEYS.tradeMode);
    const storedModelProfile = window.localStorage.getItem(
      STORAGE_KEYS.modelProfile,
    );
    const storedChartType = window.localStorage.getItem(STORAGE_KEYS.chartType);
    const storedRefreshCadence = window.localStorage.getItem(
      STORAGE_KEYS.refreshCadence,
    );
    const storedAutoTradeEnabled = window.localStorage.getItem(
      STORAGE_KEYS.autoTradeEnabled,
    );

    if (storedTradeMode === "manual" || storedTradeMode === "model") {
      setTradeMode(storedTradeMode);
    }

    if (
      storedModelProfile === "safe" ||
      storedModelProfile === "neutral" ||
      storedModelProfile === "risky"
    ) {
      setModelProfile(storedModelProfile);
    }

    if (storedChartType === "line" || storedChartType === "candlestick") {
      setChartType(storedChartType);
    }

    if (
      storedRefreshCadence === "1m" ||
      storedRefreshCadence === "5m" ||
      storedRefreshCadence === "15m"
    ) {
      setRefreshCadence(storedRefreshCadence);
    }

    if (storedAutoTradeEnabled === "true" || storedAutoTradeEnabled === "false") {
      setAutoTradeEnabled(storedAutoTradeEnabled === "true");
    }

    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.tradeMode, tradeMode);
    window.localStorage.setItem(STORAGE_KEYS.modelProfile, modelProfile);
    window.localStorage.setItem(STORAGE_KEYS.chartType, chartType);
    window.localStorage.setItem(STORAGE_KEYS.refreshCadence, refreshCadence);
    window.localStorage.setItem(
      STORAGE_KEYS.autoTradeEnabled,
      String(autoTradeEnabled),
    );
  }, [
    autoTradeEnabled,
    chartType,
    modelProfile,
    preferencesLoaded,
    refreshCadence,
    tradeMode,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const loadQuote = useCallback(async () => {
    const raw = tickerInput.trim();
    if (!raw) {
      setError("Enter a ticker symbol.");
      return;
    }

    setError(null);
    setLastAction(null);
    setLoading(true);

    try {
      const nextQuote = await fetchStockQuote(raw, { modelProfile, chartType });
      setQuote(nextQuote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quote.");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [chartType, modelProfile, tickerInput]);

  const runAutoTrade = useCallback(async () => {
    const raw = tickerInput.trim();
    if (!raw) {
      setAutoTradeError("Enter a ticker symbol.");
      return;
    }

    setAutoTradeError(null);
    setAutoTradeLoading(true);

    try {
      const result = await executeAutoTrade(raw, {
        modelProfile,
        cadence: refreshCadence,
      });
      setAutoTradeResult(result);
      setQuote(result.quote);
      setLastAction(result.statusMessage);
    } catch (err) {
      setAutoTradeError(
        err instanceof Error ? err.message : "Could not execute paper auto-trade.",
      );
    } finally {
      setAutoTradeLoading(false);
    }
  }, [modelProfile, refreshCadence, tickerInput]);

  useEffect(() => {
    const ticker = tickerInput.trim();
    if (tradeMode !== "model" || !marketSnapshot.isOpen || !ticker) {
      return;
    }

    const timer = window.setInterval(() => {
      if (autoTradeEnabled) {
        void runAutoTrade();
        return;
      }
      void loadQuote();
    }, CADENCE_MS[refreshCadence]);

    return () => window.clearInterval(timer);
  }, [
    autoTradeEnabled,
    loadQuote,
    marketSnapshot.isOpen,
    refreshCadence,
    runAutoTrade,
    tickerInput,
    tradeMode,
  ]);

  useEffect(() => {
    if (!autoTradeEnabled || tradeMode !== "model" || !marketSnapshot.isOpen) {
      return;
    }

    void runAutoTrade();
  }, [autoTradeEnabled, marketSnapshot.isOpen, runAutoTrade, tradeMode]);

  useEffect(() => {
    const symbol = quote?.ticker ?? tickerInput.trim().toUpperCase();
    if (!symbol || !marketSnapshot.isOpen || tradeMode !== "model") {
      setStreamConnected(false);
      return;
    }

    const ws = new WebSocket(
      `${getMlBackendWebSocketUrl()}/v1/ws/trades?ticker=${encodeURIComponent(symbol)}&feed=iex`,
    );

    ws.onopen = () => {
      setStreamConnected(true);
      setStreamError(null);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as
          | LiveTradeTick
          | { type: "status"; status: string }
          | { type: "error"; message: string };

        if (message.type === "error") {
          setStreamError(message.message);
          return;
        }

        if (message.type !== "trade") {
          return;
        }

        setLastTickAt(message.timestamp);
        setQuote((current) => {
          if (!current || current.ticker !== symbol) {
            return current;
          }
          const nextHistory = [...(current.history ?? []), message.price].slice(-120);
          const previousPrice =
            current.history?.[current.history.length - 1] ?? current.lastPrice;
          const nextChange =
            previousPrice > 0
              ? Number((((message.price / previousPrice) - 1) * 100).toFixed(2))
              : current.changePercent;

          return {
            ...current,
            lastPrice: message.price,
            changePercent: nextChange,
            history: nextHistory,
          };
        });
      } catch {
        setStreamError("Could not parse the live trade stream.");
      }
    };

    ws.onerror = () => {
      setStreamError("Live trade stream connection failed.");
    };

    ws.onclose = () => {
      setStreamConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [marketSnapshot.isOpen, quote?.ticker, tickerInput, tradeMode]);

  const loadMockTradingDay = useCallback(async () => {
    const raw = tickerInput.trim();
    if (!raw) {
      setMockTradingError("Enter a ticker symbol.");
      return;
    }

    setMockTradingError(null);
    setLastAction(null);
    setMockTradingLoading(true);

    try {
      const nextMockDay = await fetchMockTradingDay(raw, {
        modelProfile,
        steps: 20,
      });
      setMockTradingDay(nextMockDay);
    } catch (err) {
      setMockTradingError(
        err instanceof Error ? err.message : "Could not load mock trading day.",
      );
      setMockTradingDay(null);
    } finally {
      setMockTradingLoading(false);
    }
  }, [modelProfile, tickerInput]);

  const simulateOrder = useCallback(
    (side: "buy" | "sell") => {
      const orderTicker = quote?.ticker ?? (tickerInput.trim().toUpperCase() || "-");
      setLastAction(
        `${side === "buy" ? "Buy" : "Sell"} simulated - no order sent. ` +
          `(Ticker: ${orderTicker})`,
      );
    },
    [quote?.ticker, tickerInput],
  );

  const activeProfile = quote?.selectedModelProfile ?? modelProfile;
  const activeChartType = quote?.selectedChartType ?? chartType;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Trade
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Pull a live readout, compare profiles, and keep the trading workspace
            on one clean surface.
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Current time: {currentTime}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            {marketSnapshot.statusLabel}
            {tradeMode === "model"
              ? ` • ${streamConnected ? "Live stream connected" : "Waiting on live stream"}`
              : null}
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:w-232 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Trading mode
            </span>
            <select
              value={tradeMode}
              onChange={(e) => {
                setTradeMode(e.target.value as TradeMode);
                setLastAction(null);
                setMockTradingError(null);
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="manual">Manual</option>
              <option value="model">Model Run</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Model profile
            </span>
            <select
              value={modelProfile}
              onChange={(e) => {
                setModelProfile(e.target.value as ModelProfile);
                setLastAction(null);
                setMockTradingDay(null);
                setMockTradingError(null);
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="safe">Safe</option>
              <option value="neutral">Neutral</option>
              <option value="risky">Risky</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Chart style
            </span>
            <select
              value={chartType}
              onChange={(e) => {
                setChartType(e.target.value as ChartType);
                setLastAction(null);
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="line">Line</option>
              <option value="candlestick">Candlestick</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Refresh cadence
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
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Ticker
            </span>
            <input
              value={tickerInput}
              onChange={(e) => {
                setTickerInput(e.target.value);
                setMockTradingDay(null);
                setMockTradingError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadQuote();
              }}
              placeholder="e.g. AAPL"
              className="min-w-0 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row xl:items-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {TRADE_MODE_LABELS[tradeMode]} with {MODEL_PROFILE_LABELS[modelProfile]} and{" "}
              {activeChartType === "candlestick" ? "candlestick" : "line"} chart at{" "}
              {CADENCE_LABELS[refreshCadence]}
            </p>
            <div className="flex gap-2">
              {tradeMode === "model" ? (
                <button
                  type="button"
                  onClick={() => void loadMockTradingDay()}
                  disabled={mockTradingLoading}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  {mockTradingLoading ? "Running..." : "Run mock day"}
                </button>
              ) : null}
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-8">
          <section>
            <h1 className="text-2xl font-semibold text-zinc-900">Trade</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Look up a symbol and pull the model output from the Python backend
              via the Next.js proxy route.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <label className="text-xs font-medium text-zinc-600">Ticker</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadQuote();
                }}
                placeholder="e.g. AAPL"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => void loadQuote()}
                disabled={loading}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading ? "Loading..." : "Load quote"}
              </button>
            </div>
          </div>
        </div>
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
        {streamError ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {streamError}
          </p>
        ) : null}
      </section>

      {quote ? (
        <section className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <StockCard quote={quote} />

            {tradeMode === "manual" ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => simulateOrder("buy")}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => simulateOrder("sell")}
                  className="flex-1 rounded-xl border border-red-300 bg-white py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Sell
                </button>
              </div>
            ) : (
              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Model Run
                  </h2>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    Paper trading
                  </span>
                </div>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Selected model
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {MODEL_PROFILE_LABELS[modelProfile]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Intended cadence
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {CADENCE_LABELS[refreshCadence]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Active window
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      Market hours
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Refresh
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {marketSnapshot.isOpen
                        ? `Model checks every ${CADENCE_LABELS[refreshCadence]}`
                        : "Paused until market open"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Live feed
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {streamConnected ? "Tick-by-tick IEX stream" : "Connecting to IEX stream"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Chart style
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {activeChartType === "candlestick" ? "Candlestick" : "Line"}
                    </dd>
                  </div>
                </dl>
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
                    {autoTradeEnabled ? "Disable paper auto-trading" : "Enable paper auto-trading"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAutoTrade()}
                    disabled={autoTradeLoading}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {autoTradeLoading ? "Submitting..." : "Run paper trade now"}
                  </button>
                </div>
                {autoTradeResult ? (
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    Last paper action: {autoTradeResult.action.toUpperCase()}.
                    {" "}
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
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Model readout
                  </h2>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      SIGNAL_BADGES[quote.signal]
                    }`}
                  >
                    {quote.signal}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Confidence
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {quote.confidence?.toFixed(1) ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Model
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {quote.modelVersion ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Profile
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {MODEL_PROFILE_LABELS[activeProfile]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Chart
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {activeChartType === "candlestick" ? "Candlestick" : "Line"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Change
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {quote.changePercent >= 0 ? "+" : ""}
                      {quote.changePercent.toFixed(2)}%
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Last price
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      ${quote.lastPrice.toFixed(2)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Last tick
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {lastTickAt ? new Date(lastTickAt).toLocaleTimeString() : "-"}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {quote.explanation}
                </p>
              </section>
            ) : null}

            {activeChartType === "line" && quote.history?.length ? (
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
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Load a quote to see backend-backed price data and compare manual
          trading against the selected model profile.
        </p>
      )}

      {lastAction ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {lastAction}
        </p>
      ) : null}

      {mockTradingDay ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Mock Trading Day
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {mockTradingDay.sessionLabel}
              </p>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Source: {mockTradingDay.datasetSource}
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Model
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {mockTradingDay.modelVersion}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Profile
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {MODEL_PROFILE_LABELS[mockTradingDay.modelProfile]}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Starting
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                ${mockTradingDay.summary.startingCash.toFixed(2)}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Ending
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
                Calls
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {mockTradingDay.summary.buys} buy / {mockTradingDay.summary.sells} sell
              </dd>
            </div>
          </dl>

          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead className="bg-zinc-50 dark:bg-zinc-900/80">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <th className="px-3 py-2">Slot</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Signal</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Equity</th>
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
                          {step.signal}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            ACTION_BADGES[step.action]
                          }`}
                        >
                          {step.action}
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
          </div>
        </section>
      ) : null}

      <AiDisclaimer />
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {loading ? "Loading…" : "Load quote"}
              </button>
            </div>
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : null}
          </section>

          {quote ? (
            <section className="flex flex-col gap-4">
              <StockCard quote={quote} />
              {quote.chartDataUri ? (
                <section className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-3">
                  <Image
                    src={quote.chartDataUri}
                    alt={`${quote.ticker} synthetic price chart`}
                    width={960}
                    height={360}
                    unoptimized
                    className="h-auto w-full rounded-xl"
                  />
                </section>
              ) : null}
              {quote.signal ? (
                <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Model readout
                    </h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        SIGNAL_BADGES[quote.signal]
                      }`}
                    >
                      {quote.signal}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Confidence
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900">
                        {quote.confidence?.toFixed(1) ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Model
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900">
                        {quote.modelVersion ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Change
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900">
                        {quote.changePercent >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Last price
                      </dt>
                      <dd className="mt-1 font-semibold text-zinc-900">
                        ${quote.lastPrice.toFixed(2)}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-sm leading-6 text-zinc-600">
                    {quote.explanation}
                  </p>
                </section>
              ) : null}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => simulateOrder("buy")}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => simulateOrder("sell")}
                  className="flex-1 rounded-lg border border-red-300 bg-white py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  Sell
                </button>
              </div>
            </section>
          ) : (
            <p className="text-sm text-zinc-500">
              Load a quote to see backend-backed price data and enable the order
              buttons (still non-functional).
            </p>
          )}

          {lastAction ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {lastAction}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
