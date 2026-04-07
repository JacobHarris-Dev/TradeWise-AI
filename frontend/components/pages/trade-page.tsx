"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiDisclaimer } from "@/components/layout/ai-disclaimer";
import { useAuth } from "@/components/providers/auth-provider";
import { getMlBackendWebSocketUrl } from "@/lib/ml/backend-ws";
import { LiveLineChart } from "@/components/stock/live-line-chart";
import { StockCard } from "@/components/stock/stock-card";
import type {
  AutoTradeResult,
  LiveTradeTick,
  MockQuote,
  MockTradingDay,
  ModelProfile,
  NewsReport,
  PaperAccount,
  RefreshCadence,
} from "@/lib/mocks/stock-data";
import {
  executeAutoTradeBatch,
  fetchNewsReport,
  fetchMockTradingDay,
  fetchPaperAccount,
  fetchStockQuote,
} from "@/lib/stock-quote";
import {
  isTradeWorkspaceFresh,
  MAX_TRACKED_TICKERS,
  readStoredJson,
  readTradeWorkspace,
  TRADE_STORAGE_KEYS,
  writeTradeWorkspace,
} from "@/lib/trade-workspace";

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
type PaperTradeLogEntry = {
  id: string;
  timestamp: string;
  ticker: string;
  modelProfile: ModelProfile;
  action: "buy" | "sell" | "hold";
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  submitted: boolean;
  statusMessage: string;
};

function InfoHint({ label: _label }: { label: string }) {
  void _label;
  return null;
}

/**
 * Trade route: compact single-surface trading workspace with manual and future
 * model-run modes.
 */
export function TradePage() {
  const { user } = useAuth();
  const accountUserId = user?.uid ?? "guest";
  const [trackedTickers, setTrackedTickers] = useState<string[]>(["AAPL"]);
  const [selectedTicker, setSelectedTicker] = useState("AAPL");
  const [quotesByTicker, setQuotesByTicker] = useState<Record<string, MockQuote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [tradeMode, setTradeMode] = useState<TradeMode>("manual");
  const [modelProfile, setModelProfile] = useState<ModelProfile>("neutral");
  const [refreshCadence, setRefreshCadence] = useState<RefreshCadence>("1m");
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [mockTradingDay, setMockTradingDay] = useState<MockTradingDay | null>(null);
  const [mockTradingLoading, setMockTradingLoading] = useState(false);
  const [mockTradingError, setMockTradingError] = useState<string | null>(null);
  const [autoTradeResult, setAutoTradeResult] = useState<AutoTradeResult | null>(null);
  const [paperTradeLog, setPaperTradeLog] = useState<PaperTradeLogEntry[]>([]);
  const [autoTradeLoading, setAutoTradeLoading] = useState(false);
  const [autoTradeError, setAutoTradeError] = useState<string | null>(null);
  const [newsReportsByTicker, setNewsReportsByTicker] = useState<Record<string, NewsReport>>({});
  const [newsReportLoading, setNewsReportLoading] = useState(false);
  const [newsReportError, setNewsReportError] = useState<string | null>(null);
  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);
  const [paperAccountLoading, setPaperAccountLoading] = useState(false);
  const [paperAccountError, setPaperAccountError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const skipInitialQuotesRefreshRef = useRef(false);
  const skipInitialPaperAccountRefreshRef = useRef(false);
  const skipInitialNewsRefreshRef = useRef(false);
  const currentTime = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(clock);
  const marketSnapshot = getEasternMarketSnapshot(clock);
  const newsRefreshSeconds = Math.max(30, Math.floor(CADENCE_MS[refreshCadence] / 1000));
  const quote = selectedTicker ? quotesByTicker[selectedTicker] ?? null : null;
  const newsReport = selectedTicker ? newsReportsByTicker[selectedTicker] ?? null : null;

  useEffect(() => {
    const storedTradeMode = window.localStorage.getItem(TRADE_STORAGE_KEYS.tradeMode);
    const storedTrackedTickers = readStoredJson<string[]>(
      TRADE_STORAGE_KEYS.trackedTickers,
    );
    const storedModelProfile = window.localStorage.getItem(
      TRADE_STORAGE_KEYS.modelProfile,
    );
    const storedRefreshCadence = window.localStorage.getItem(
      TRADE_STORAGE_KEYS.refreshCadence,
    );
    const storedAutoTradeEnabled = window.localStorage.getItem(
      TRADE_STORAGE_KEYS.autoTradeEnabled,
    );
    const workspace = readTradeWorkspace();
    const workspaceFresh = isTradeWorkspaceFresh(workspace);

    if (storedTradeMode === "manual" || storedTradeMode === "model") {
      setTradeMode(storedTradeMode);
    }

    if (workspace) {
      const nextTickers = Array.from(
        new Set(
          workspace.trackedTickers
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean),
        ),
      ).slice(0, MAX_TRACKED_TICKERS);

      if (nextTickers.length) {
        const nextSelectedTicker =
          nextTickers.includes(workspace.selectedTicker)
            ? workspace.selectedTicker
            : nextTickers[0];
        setTrackedTickers(nextTickers);
        setSelectedTicker(nextSelectedTicker);
        setQuotesByTicker(workspace.quotesByTicker ?? {});
        setNewsReportsByTicker(workspace.newsReportsByTicker ?? {});
        setPaperAccount(workspace.paperAccount ?? null);
        setAutoTradeResult(workspace.autoTradeResult ?? null);
        setLastAction(workspace.lastAction ?? null);
        skipInitialQuotesRefreshRef.current =
          workspaceFresh &&
          nextTickers.every((ticker) => Boolean(workspace.quotesByTicker?.[ticker]));
        skipInitialPaperAccountRefreshRef.current =
          workspaceFresh && Boolean(workspace.paperAccount);
        skipInitialNewsRefreshRef.current =
          workspaceFresh &&
          Boolean(nextSelectedTicker) &&
          Boolean(workspace.newsReportsByTicker?.[nextSelectedTicker]);
      }
    } else if (storedTrackedTickers && Array.isArray(storedTrackedTickers)) {
      const nextTickers = Array.from(
        new Set(
          storedTrackedTickers
            .map((value) =>
              typeof value === "string" ? value.trim().toUpperCase() : "",
            )
            .filter(Boolean),
        ),
      ).slice(0, MAX_TRACKED_TICKERS);

      if (nextTickers.length) {
        setTrackedTickers(nextTickers);
        setSelectedTicker(nextTickers[0]);
      }
    }

    if (
      storedModelProfile === "safe" ||
      storedModelProfile === "neutral" ||
      storedModelProfile === "risky"
    ) {
      setModelProfile(storedModelProfile);
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

    window.localStorage.setItem(TRADE_STORAGE_KEYS.tradeMode, tradeMode);
    window.localStorage.setItem(
      TRADE_STORAGE_KEYS.trackedTickers,
      JSON.stringify(trackedTickers),
    );
    window.localStorage.setItem(TRADE_STORAGE_KEYS.modelProfile, modelProfile);
    window.localStorage.setItem(TRADE_STORAGE_KEYS.refreshCadence, refreshCadence);
    window.localStorage.setItem(
      TRADE_STORAGE_KEYS.autoTradeEnabled,
      String(autoTradeEnabled),
    );
  }, [
    autoTradeEnabled,
    modelProfile,
    preferencesLoaded,
    refreshCadence,
    trackedTickers,
    tradeMode,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const refreshPaperAccount = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setPaperAccountLoading(true);
      }
      try {
        const account = await fetchPaperAccount(accountUserId);
        setPaperAccount(account);
        setPaperAccountError(null);
      } catch (err) {
        setPaperAccountError(
          err instanceof Error ? err.message : "Could not load paper account.",
        );
      } finally {
        if (showLoading) {
          setPaperAccountLoading(false);
        }
      }
    },
    [accountUserId],
  );

  useEffect(() => {
    if (!preferencesLoaded) {
      return;
    }
    if (skipInitialPaperAccountRefreshRef.current) {
      skipInitialPaperAccountRefreshRef.current = false;
      return;
    }
    void refreshPaperAccount(true);
  }, [preferencesLoaded, refreshPaperAccount]);

  useEffect(() => {
    if (!preferencesLoaded) {
      return;
    }

    writeTradeWorkspace({
      savedAt: Date.now(),
      trackedTickers,
      selectedTicker,
      quotesByTicker,
      newsReportsByTicker,
      paperAccount,
      autoTradeResult,
      lastAction,
    });
  }, [
    autoTradeResult,
    lastAction,
    newsReportsByTicker,
    paperAccount,
    preferencesLoaded,
    quotesByTicker,
    selectedTicker,
    trackedTickers,
  ]);

  const loadTrackedQuotes = useCallback(
    async (
      targetTickers: string[],
      options: { showLoading?: boolean } = {},
    ) => {
      const symbols = Array.from(
        new Set(targetTickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)),
      );
      if (!symbols.length) {
        return;
      }

      if (options.showLoading) {
        setLoading(true);
      }

      try {
        const results = await Promise.allSettled(
          symbols.map((ticker) =>
            fetchStockQuote(ticker, { modelProfile }),
          ),
        );
        const nextQuotes: MockQuote[] = [];
        const failures: string[] = [];

        for (const [index, result] of results.entries()) {
          if (result.status === "fulfilled") {
            nextQuotes.push(result.value);
          } else {
            const reason =
              result.reason instanceof Error
                ? result.reason.message
                : "Could not load quote.";
            failures.push(`${symbols[index]}: ${reason}`);
          }
        }

        if (nextQuotes.length) {
          setQuotesByTicker((current) => {
            const merged = { ...current };
            for (const nextQuote of nextQuotes) {
              merged[nextQuote.ticker] = nextQuote;
            }
            return merged;
          });
        }

        setError(failures.length ? failures.join(" ") : null);
      } finally {
        if (options.showLoading) {
          setLoading(false);
        }
      }
    },
    [modelProfile],
  );

  useEffect(() => {
    if (!preferencesLoaded || !trackedTickers.length) {
      return;
    }

    if (skipInitialQuotesRefreshRef.current) {
      skipInitialQuotesRefreshRef.current = false;
      return;
    }

    void loadTrackedQuotes(trackedTickers, { showLoading: true });
  }, [loadTrackedQuotes, preferencesLoaded, trackedTickers]);

  const checkSelectedStocks = useCallback(async () => {
    if (!trackedTickers.length) {
      setError("Load starter stocks from the dashboard first.");
      return;
    }

    setError(null);
    setLastAction(null);
    setMockTradingDay(null);
    setMockTradingError(null);
    await loadTrackedQuotes(trackedTickers, { showLoading: true });
  }, [loadTrackedQuotes, trackedTickers]);

  const selectTrackedTicker = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    setLastAction(null);
    setMockTradingDay(null);
    setMockTradingError(null);
  }, []);

  const removeTrackedTicker = useCallback(
    (ticker: string) => {
      setTrackedTickers((current) => current.filter((entry) => entry !== ticker));
      setQuotesByTicker((current) => {
        const next = { ...current };
        delete next[ticker];
        return next;
      });
      setNewsReportsByTicker((current) => {
        const next = { ...current };
        delete next[ticker];
        return next;
      });
      setPaperTradeLog((current) =>
        current.filter((entry) => entry.ticker !== ticker),
      );

      if (selectedTicker === ticker) {
        const remainingTickers = trackedTickers.filter((entry) => entry !== ticker);
        const nextSelected = remainingTickers[0] ?? "";
        setSelectedTicker(nextSelected);
        setAutoTradeResult((current) =>
          current?.ticker === ticker ? null : current,
        );
        setMockTradingDay(null);
      }
    },
    [selectedTicker, trackedTickers],
  );

  const loadNewsReport = useCallback(
    async (options: { forceRefresh?: boolean; showLoading?: boolean } = {}) => {
      const raw = selectedTicker || trackedTickers[0] || "";
      if (!raw) {
        return;
      }

      if (options.showLoading) {
        setNewsReportLoading(true);
      }

      try {
        const report = await fetchNewsReport(raw, {
          modelProfile,
          refreshSeconds: newsRefreshSeconds,
          forceRefresh: options.forceRefresh,
        });
        setNewsReportsByTicker((current) => ({
          ...current,
          [report.ticker]: report,
        }));
        setNewsReportError(null);
      } catch (err) {
        setNewsReportError(
          err instanceof Error ? err.message : "Could not load news report.",
        );
      } finally {
        if (options.showLoading) {
          setNewsReportLoading(false);
        }
      }
    },
    [modelProfile, newsRefreshSeconds, selectedTicker, trackedTickers],
  );

  const runAutoTrade = useCallback(async () => {
    if (!trackedTickers.length) {
      setAutoTradeError("Add at least one ticker to start paper trading.");
      return;
    }

    setAutoTradeError(null);
    setAutoTradeLoading(true);

    try {
      const successfulResults = await executeAutoTradeBatch(trackedTickers, {
        modelProfile,
        cadence: refreshCadence,
        userId: accountUserId,
      });

      if (successfulResults.length) {
        setQuotesByTicker((current) => {
          const merged = { ...current };
          for (const result of successfulResults) {
            merged[result.quote.ticker] = result.quote;
          }
          return merged;
        });
        setAutoTradeResult(
          successfulResults.find((result) => result.ticker === selectedTicker) ??
            successfulResults[0],
        );
        setPaperTradeLog((current) => [
          ...successfulResults.map((result, index) => ({
            id: `${Date.now()}-${index}-${result.ticker}-${result.action}`,
            timestamp: new Date().toISOString(),
            ticker: result.ticker,
            modelProfile: result.modelProfile,
            action: result.action,
            signal: result.signal,
            confidence: result.confidence,
            submitted: result.submitted,
            statusMessage: result.statusMessage,
          })),
          ...current,
        ].slice(0, 24));

        if (successfulResults.length === 1) {
          setLastAction(successfulResults[0].statusMessage);
        } else {
          const buyCount = successfulResults.filter((result) => result.action === "buy").length;
          const sellCount = successfulResults.filter((result) => result.action === "sell").length;
          const holdCount = successfulResults.filter((result) => result.action === "hold").length;
          setLastAction(
            `Checked ${successfulResults.length} symbols. ${buyCount} buy, ${sellCount} sell, ${holdCount} hold.`,
          );
        }
        void refreshPaperAccount();
      }
    } catch (err) {
      setAutoTradeError(
        err instanceof Error ? err.message : "Could not execute paper auto-trade.",
      );
    } finally {
      setAutoTradeLoading(false);
    }
  }, [
    accountUserId,
    modelProfile,
    refreshCadence,
    refreshPaperAccount,
    selectedTicker,
    trackedTickers,
  ]);

  useEffect(() => {
    if (tradeMode !== "model" || !marketSnapshot.isOpen || !trackedTickers.length) {
      return;
    }

    const timer = window.setInterval(() => {
      if (autoTradeEnabled) {
        void runAutoTrade();
        return;
      }
      void loadTrackedQuotes(trackedTickers);
    }, CADENCE_MS[refreshCadence]);

    return () => window.clearInterval(timer);
  }, [
    autoTradeEnabled,
    loadTrackedQuotes,
    marketSnapshot.isOpen,
    refreshCadence,
    runAutoTrade,
    trackedTickers,
    tradeMode,
  ]);

  useEffect(() => {
    if (!autoTradeEnabled || tradeMode !== "model" || !marketSnapshot.isOpen) {
      return;
    }

    void runAutoTrade();
  }, [autoTradeEnabled, marketSnapshot.isOpen, runAutoTrade, tradeMode]);

  useEffect(() => {
    if (tradeMode !== "model" || !selectedTicker) {
      return;
    }

    if (skipInitialNewsRefreshRef.current) {
      skipInitialNewsRefreshRef.current = false;
    } else {
      void loadNewsReport({ showLoading: true });
    }

    const timer = window.setInterval(() => {
      void loadNewsReport();
    }, CADENCE_MS[refreshCadence]);

    return () => window.clearInterval(timer);
  }, [loadNewsReport, refreshCadence, selectedTicker, tradeMode]);

  useEffect(() => {
    if (!trackedTickers.length || !marketSnapshot.isOpen || tradeMode !== "model") {
      setStreamConnected(false);
      return;
    }

    const symbolsParam = trackedTickers.join(",");

    const ws = new WebSocket(
      `${getMlBackendWebSocketUrl()}/v1/ws/trades?symbols=${encodeURIComponent(symbolsParam)}&feed=iex`,
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
        setQuotesByTicker((current) => {
          const currentQuote = current[message.symbol];
          if (!currentQuote) {
            return current;
          }
          const nextHistory = [...(currentQuote.history ?? []), message.price].slice(-120);
          const previousPrice =
            currentQuote.history?.[currentQuote.history.length - 1] ?? currentQuote.lastPrice;
          const nextChange =
            previousPrice > 0
              ? Number((((message.price / previousPrice) - 1) * 100).toFixed(2))
              : currentQuote.changePercent;

          return {
            ...current,
            [message.symbol]: {
              ...currentQuote,
              lastPrice: message.price,
              changePercent: nextChange,
              history: nextHistory,
            },
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
  }, [marketSnapshot.isOpen, trackedTickers, tradeMode]);

  const loadMockTradingDay = useCallback(async () => {
    const raw = selectedTicker || trackedTickers[0] || "";
    if (!raw) {
      setMockTradingError("Load a tracked stock from the dashboard first.");
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
  }, [modelProfile, selectedTicker, trackedTickers]);

  const simulateOrder = useCallback(
    (side: "buy" | "sell") => {
      const orderTicker = quote?.ticker ?? (selectedTicker || "-");
      setLastAction(
        `${side === "buy" ? "Buy" : "Sell"} simulated - no order sent. ` +
          `(Ticker: ${orderTicker})`,
      );
    },
    [quote?.ticker, selectedTicker],
  );

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
              How you want to practice
              <InfoHint label="Choose whether you want to make the paper decisions yourself or let TradeWise handle the paper trades for you." />
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
          Mode: {TRADE_MODE_LABELS[tradeMode]}. Risk style:{" "}
          {MODEL_PROFILE_LABELS[modelProfile]}. Check-ins:{" "}
          {CADENCE_LABELS[refreshCadence]}. Tracking {trackedTickers.length}/
          {MAX_TRACKED_TICKERS} symbols.
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
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              {trackedTickers.length}/{MAX_TRACKED_TICKERS} slots used
            </p>
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
                          {SIGNAL_LABELS[trackedQuote.signal]} •{" "}
                          {trackedQuote.confidence?.toFixed(1) ?? "-"}%
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
                <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {marketSnapshot.isOpen
                    ? autoTradeEnabled
                      ? `Paper trading is on. TradeWise will keep checking ${trackedTickerSummary} every ${CADENCE_LABELS[refreshCadence]}.`
                      : "The live price feed is ready. Turn on paper trading when you want TradeWise to handle the practice calls."
                    : "The market is closed right now, so live prices and paper trades stay paused until the next trading session."}
                </p>
                <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Paper account ({accountUserId === "guest" ? "guest" : "signed-in user"})
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
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Updates every {CADENCE_LABELS[refreshCadence]} | Last refresh:{" "}
                      {newsReport ? new Date(newsReport.refreshedAt).toLocaleTimeString() : "-"} | Source:{" "}
                      {newsReport?.fromCache ? "cache" : "fresh"}
                      {newsReport?.reasoningSource ? ` | Reasoning: ${newsReport.reasoningSource}` : ""}
                    </p>
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

      {mockTradingDay ? (
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

      {paperTradeLog.length ? (
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
              onClick={() => setPaperTradeLog([])}
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
