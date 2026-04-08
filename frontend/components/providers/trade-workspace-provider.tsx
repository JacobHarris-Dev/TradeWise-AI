"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { getMlBackendWebSocketUrl } from "@/lib/ml/backend-ws";
import type {
  AutoTradeResult,
  LiveTradeTick,
  MockQuote,
  MockTradingDay,
  ModelProfile,
  NewsReport,
  PaperAccount,
  PaperAccountPerformance,
  RefreshCadence,
} from "@/lib/mocks/stock-data";
import {
  executeAutoTradeBatch,
  fetchMockTradingDay,
  fetchNewsReport,
  fetchPaperAccount,
  fetchPaperAccountPerformance,
  fetchStockQuotes,
  fetchWatchSession,
} from "@/lib/stock-quote";
import {
  isTradeWorkspaceFresh,
  MAX_TRACKED_TICKERS,
  readStoredJson,
  readStoredModelProfile,
  readStoredRefreshCadence,
  readStoredTradeMode,
  readTradeWorkspace,
  TRADE_STORAGE_KEYS,
  type TradeMode,
  type TradeWorkspaceSnapshot,
  writeStoredJson,
  writeStoredString,
  writeTradeWorkspace,
} from "@/lib/trade-workspace";

const CADENCE_MS: Record<RefreshCadence, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
} as const;

const PORTFOLIO_REFRESH_MS = 30_000;
const WORKSPACE_PERSIST_DEBOUNCE_MS = 750;

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

function normalizeTrackedTickers(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean)),
  ).slice(0, MAX_TRACKED_TICKERS);
}

function refreshSecondsForCadence(refreshCadence: RefreshCadence) {
  return Math.max(30, Math.floor(CADENCE_MS[refreshCadence] / 1000));
}

function paperAccountFromPerformance(
  performance: PaperAccountPerformance,
): PaperAccount {
  return {
    userId: performance.userId,
    startingCash: performance.startingCash,
    cash: performance.cash,
    positions: performance.positions.map((position) => ({
      ticker: position.ticker,
      shares: position.shares,
      avgEntryPrice: position.avgEntryPrice,
    })),
    updatedAt: performance.updatedAt,
  };
}

export type PaperTradeLogEntry = {
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

type TradeWorkspaceContextValue = {
  accountUserId: string;
  trackedTickers: string[];
  selectedTicker: string;
  quotesByTicker: Record<string, MockQuote>;
  loading: boolean;
  error: string | null;
  lastAction: string | null;
  tradeMode: TradeMode;
  modelProfile: ModelProfile;
  refreshCadence: RefreshCadence;
  autoTradeEnabled: boolean;
  preferencesLoaded: boolean;
  mockTradingDay: MockTradingDay | null;
  mockTradingLoading: boolean;
  mockTradingError: string | null;
  autoTradeResult: AutoTradeResult | null;
  paperTradeLog: PaperTradeLogEntry[];
  autoTradeLoading: boolean;
  autoTradeError: string | null;
  newsReportsByTicker: Record<string, NewsReport>;
  newsReportLoading: boolean;
  newsReportError: string | null;
  paperAccount: PaperAccount | null;
  paperAccountLoading: boolean;
  paperAccountError: string | null;
  streamConnected: boolean;
  streamError: string | null;
  lastTickAt: string | null;
  clock: Date;
  marketSnapshot: { isOpen: boolean; statusLabel: string };
  setTradeMode: (next: TradeMode) => void;
  setModelProfile: (next: ModelProfile) => void;
  setRefreshCadence: (next: RefreshCadence) => void;
  setAutoTradeEnabled: (updater: boolean | ((current: boolean) => boolean)) => void;
  refreshPaperAccount: (showLoading?: boolean) => Promise<void>;
  loadTrackedQuotes: (
    targetTickers: string[],
    options?: { showLoading?: boolean },
  ) => Promise<void>;
  checkSelectedStocks: () => Promise<void>;
  selectTrackedTicker: (ticker: string) => void;
  removeTrackedTicker: (ticker: string) => void;
  loadNewsReport: (options?: {
    forceRefresh?: boolean;
    showLoading?: boolean;
  }) => Promise<void>;
  runAutoTrade: () => Promise<void>;
  loadMockTradingDay: () => Promise<void>;
  simulateOrder: (side: "buy" | "sell") => void;
  clearPaperTradeLog: () => void;
  setLastAction: (message: string | null) => void;
};

type TradeWorkspaceActionsContextValue = {
  hydrateWorkspace: (snapshot: TradeWorkspaceSnapshot) => void;
};

type PortfolioWorkspaceContextValue = {
  accountUserId: string;
  paperAccount: PaperAccount | null;
  paperAccountLoading: boolean;
  paperAccountError: string | null;
  refreshPaperAccount: (showLoading?: boolean) => Promise<void>;
  portfolio: PaperAccountPerformance | null;
  portfolioLoading: boolean;
  portfolioError: string | null;
  refreshPortfolio: (options?: { background?: boolean }) => Promise<void>;
};

const TradeWorkspaceContext = createContext<TradeWorkspaceContextValue | null>(null);
const TradeWorkspaceActionsContext =
  createContext<TradeWorkspaceActionsContextValue | null>(null);
const PortfolioWorkspaceContext =
  createContext<PortfolioWorkspaceContextValue | null>(null);

export function TradeWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const accountUserId = user?.uid ?? "guest";
  const [trackedTickers, setTrackedTickers] = useState<string[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [quotesByTicker, setQuotesByTicker] = useState<Record<string, MockQuote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [tradeMode, setTradeModeState] = useState<TradeMode>("manual");
  const [modelProfile, setModelProfileState] = useState<ModelProfile>("neutral");
  const [refreshCadence, setRefreshCadenceState] =
    useState<RefreshCadence>("1m");
  const [autoTradeEnabled, setAutoTradeEnabledState] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [mockTradingDay, setMockTradingDay] = useState<MockTradingDay | null>(null);
  const [mockTradingLoading, setMockTradingLoading] = useState(false);
  const [mockTradingError, setMockTradingError] = useState<string | null>(null);
  const [autoTradeResult, setAutoTradeResult] = useState<AutoTradeResult | null>(
    null,
  );
  const [paperTradeLog, setPaperTradeLog] = useState<PaperTradeLogEntry[]>([]);
  const [autoTradeLoading, setAutoTradeLoading] = useState(false);
  const [autoTradeError, setAutoTradeError] = useState<string | null>(null);
  const [newsReportsByTicker, setNewsReportsByTicker] = useState<
    Record<string, NewsReport>
  >({});
  const [newsReportLoading, setNewsReportLoading] = useState(false);
  const [newsReportError, setNewsReportError] = useState<string | null>(null);
  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);
  const [paperAccountLoading, setPaperAccountLoading] = useState(false);
  const [paperAccountError, setPaperAccountError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PaperAccountPerformance | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [watchSyncTick, setWatchSyncTick] = useState(0);
  const skipInitialQuotesRefreshRef = useRef(false);
  const skipInitialPaperAccountRefreshRef = useRef(false);
  const skipInitialNewsRefreshRef = useRef(false);

  const marketSnapshot = useMemo(() => getEasternMarketSnapshot(clock), [clock]);
  const newsRefreshSeconds = refreshSecondsForCadence(refreshCadence);

  const applyWorkspaceSnapshot = useCallback(
    (
      snapshot: TradeWorkspaceSnapshot,
      options: { respectFreshness?: boolean } = {},
    ) => {
      const nextTickers = normalizeTrackedTickers(snapshot.trackedTickers);
      const nextSelectedTicker = nextTickers.includes(snapshot.selectedTicker)
        ? snapshot.selectedTicker
        : nextTickers[0] ?? "";
      const workspaceFresh = options.respectFreshness
        ? isTradeWorkspaceFresh(snapshot)
        : true;

      setTrackedTickers(nextTickers);
      setSelectedTicker(nextSelectedTicker);
      setQuotesByTicker(snapshot.quotesByTicker ?? {});
      setNewsReportsByTicker(snapshot.newsReportsByTicker ?? {});
      setPaperAccount(snapshot.paperAccount ?? null);
      setAutoTradeResult(snapshot.autoTradeResult ?? null);
      setLastAction(snapshot.lastAction ?? null);
      skipInitialQuotesRefreshRef.current =
        workspaceFresh &&
        nextTickers.length > 0 &&
        nextTickers.every((ticker) => Boolean(snapshot.quotesByTicker?.[ticker]));
      skipInitialPaperAccountRefreshRef.current =
        workspaceFresh && Boolean(snapshot.paperAccount);
      skipInitialNewsRefreshRef.current =
        workspaceFresh &&
        Boolean(nextSelectedTicker) &&
        Boolean(snapshot.newsReportsByTicker?.[nextSelectedTicker]);
    },
    [],
  );

  useEffect(() => {
    const storedTradeMode = readStoredTradeMode();
    const storedTrackedTickers = readStoredJson<string[]>(
      TRADE_STORAGE_KEYS.trackedTickers,
    );
    const storedModelProfile = readStoredModelProfile();
    const storedRefreshCadence = readStoredRefreshCadence();
    const storedAutoTradeEnabled =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(TRADE_STORAGE_KEYS.autoTradeEnabled);
    const workspace = readTradeWorkspace();

    setTradeModeState(storedTradeMode);
    setModelProfileState(storedModelProfile);
    setRefreshCadenceState(storedRefreshCadence);

    if (storedAutoTradeEnabled === "true" || storedAutoTradeEnabled === "false") {
      setAutoTradeEnabledState(storedAutoTradeEnabled === "true");
    }

    if (workspace) {
      applyWorkspaceSnapshot(workspace, { respectFreshness: true });
    } else if (storedTrackedTickers && Array.isArray(storedTrackedTickers)) {
      const nextTickers = normalizeTrackedTickers(storedTrackedTickers);
      setTrackedTickers(nextTickers);
      setSelectedTicker(nextTickers[0] ?? "");
    }

    setPreferencesLoaded(true);
  }, [applyWorkspaceSnapshot]);

  useEffect(() => {
    if (!preferencesLoaded) {
      return;
    }

    writeStoredString(TRADE_STORAGE_KEYS.tradeMode, tradeMode);
    writeStoredJson(TRADE_STORAGE_KEYS.trackedTickers, trackedTickers);
    writeStoredString(TRADE_STORAGE_KEYS.modelProfile, modelProfile);
    writeStoredString(TRADE_STORAGE_KEYS.refreshCadence, refreshCadence);
    writeStoredString(
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
    if (!preferencesLoaded) {
      return;
    }

    const timer = window.setTimeout(() => {
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
    }, WORKSPACE_PERSIST_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const refreshPortfolio = useCallback(
    async (options: { background?: boolean } = {}) => {
      if (!options.background) {
        setPortfolioLoading(true);
      }

      try {
        const next = await fetchPaperAccountPerformance(accountUserId);
        setPortfolio(next);
        setPaperAccount((current) => {
          if (current?.userId === next.userId && current.updatedAt === next.updatedAt) {
            return current;
          }
          return paperAccountFromPerformance(next);
        });
        setPortfolioError(null);
      } catch (err) {
        setPortfolioError(
          err instanceof Error ? err.message : "Could not load portfolio.",
        );
      } finally {
        if (!options.background) {
          setPortfolioLoading(false);
        }
      }
    },
    [accountUserId],
  );

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
    void refreshPortfolio();
  }, [refreshPortfolio]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPortfolio({ background: true });
    }, PORTFOLIO_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [refreshPortfolio]);

  const loadTrackedQuotes = useCallback(
    async (
      targetTickers: string[],
      options: { showLoading?: boolean } = {},
    ) => {
      const symbols = normalizeTrackedTickers(targetTickers);
      if (!symbols.length) {
        return;
      }

      if (options.showLoading) {
        setLoading(true);
      }

      try {
        const batch = await fetchStockQuotes(symbols, { modelProfile });
        const nextQuotes: MockQuote[] = batch.results;
        const failures = batch.errors.map(
          (error) => `${error.ticker}: ${error.message}`,
        );

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

  const removeTrackedTicker = useCallback((ticker: string) => {
    setTrackedTickers((current) => {
      const next = current.filter((entry) => entry !== ticker);
      setSelectedTicker((selected) =>
        selected === ticker ? next[0] ?? "" : selected,
      );
      return next;
    });
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
    setAutoTradeResult((current) =>
      current?.ticker === ticker ? null : current,
    );
    setMockTradingDay((current) =>
      current?.ticker === ticker ? null : current,
    );
  }, []);

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
        setPaperTradeLog((current) =>
          [
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
          ].slice(0, 24),
        );

        if (successfulResults.length === 1) {
          setLastAction(successfulResults[0].statusMessage);
        } else {
          const buyCount = successfulResults.filter(
            (result) => result.action === "buy",
          ).length;
          const sellCount = successfulResults.filter(
            (result) => result.action === "sell",
          ).length;
          const holdCount = successfulResults.filter(
            (result) => result.action === "hold",
          ).length;
          setLastAction(
            `Checked ${successfulResults.length} symbols. ${buyCount} buy, ${sellCount} sell, ${holdCount} hold.`,
          );
        }

        await Promise.all([
          refreshPaperAccount(),
          refreshPortfolio({ background: true }),
        ]);
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
    refreshPortfolio,
    selectedTicker,
    trackedTickers,
  ]);

  useEffect(() => {
    if (!marketSnapshot.isOpen || !trackedTickers.length) {
      return;
    }

    const timer = window.setInterval(() => {
      if (autoTradeEnabled) {
        void runAutoTrade();
      }
    }, CADENCE_MS[refreshCadence]);

    return () => window.clearInterval(timer);
  }, [
    autoTradeEnabled,
    loadTrackedQuotes,
    marketSnapshot.isOpen,
    refreshCadence,
    runAutoTrade,
    trackedTickers,
  ]);

  useEffect(() => {
    if (!trackedTickers.length) {
      return;
    }

    const timer = window.setInterval(() => {
      setWatchSyncTick((current) => current + 1);
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [trackedTickers.length]);

  useEffect(() => {
    if (!trackedTickers.length) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const session = await fetchWatchSession(accountUserId);
        if (cancelled) {
          return;
        }
        if (session.quotes.length) {
          setQuotesByTicker((current) => {
            const merged = { ...current };
            for (const quote of session.quotes) {
              merged[quote.ticker] = quote;
            }
            return merged;
          });
        }
        if (session.lastAutoTrade) {
          setAutoTradeResult(session.lastAutoTrade);
        }
        if (session.paperTradeLog.length) {
          setPaperTradeLog(session.paperTradeLog);
        }
      } catch {
        // If the background session has not started yet, the local view still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountUserId, trackedTickers.length, watchSyncTick]);

  useEffect(() => {
    if (!autoTradeEnabled || tradeMode !== "model" || !marketSnapshot.isOpen) {
      return;
    }

    void runAutoTrade();
  }, [autoTradeEnabled, marketSnapshot.isOpen, runAutoTrade, tradeMode]);

  useEffect(() => {
    if (!selectedTicker) {
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
  }, [loadNewsReport, refreshCadence, selectedTicker]);

  useEffect(() => {
    if (!trackedTickers.length || !marketSnapshot.isOpen) {
      setStreamConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    
    // Add a debounce to entirely avoid the Alpaca "1 connection" API limit during fast hot-reloads
    const timer = window.setTimeout(() => {
      const symbolsParam = trackedTickers.join(",");
      ws = new WebSocket(
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
            const nextHistory = [...(currentQuote.history ?? []), message.price].slice(
              -120,
            );
            const previousPrice =
              currentQuote.history?.[currentQuote.history.length - 1] ??
              currentQuote.lastPrice;
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
    }, 500);

    return () => {
      window.clearTimeout(timer);
      if (ws) {
        ws.close();
      }
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
      const orderTicker =
        quotesByTicker[selectedTicker]?.ticker ?? (selectedTicker || "-");
      setLastAction(
        `${side === "buy" ? "Buy" : "Sell"} simulated - no order sent. (Ticker: ${orderTicker})`,
      );
    },
    [quotesByTicker, selectedTicker],
  );

  const clearPaperTradeLog = useCallback(() => {
    setPaperTradeLog([]);
  }, []);

  const hydrateWorkspace = useCallback(
    (snapshot: TradeWorkspaceSnapshot) => {
      const nextSnapshot = {
        ...snapshot,
        savedAt: Date.now(),
      };
      applyWorkspaceSnapshot(nextSnapshot);
      setLoading(false);
      setError(null);
      setAutoTradeError(null);
      setNewsReportError(null);
      setPaperAccountError(null);
      writeTradeWorkspace(nextSnapshot);
    },
    [applyWorkspaceSnapshot],
  );

  const setTradeMode = useCallback((next: TradeMode) => {
    setTradeModeState(next);
    setLastAction(null);
    setMockTradingError(null);
  }, []);

  const setModelProfile = useCallback((next: ModelProfile) => {
    setModelProfileState(next);
    setLastAction(null);
    setMockTradingDay(null);
    setMockTradingError(null);
  }, []);

  const setRefreshCadence = useCallback((next: RefreshCadence) => {
    setRefreshCadenceState(next);
  }, []);

  const setAutoTradeEnabled = useCallback(
    (updater: boolean | ((current: boolean) => boolean)) => {
      setAutoTradeEnabledState((current) =>
        typeof updater === "function"
          ? (updater as (current: boolean) => boolean)(current)
          : updater,
      );
    },
    [],
  );

  const tradeValue = useMemo<TradeWorkspaceContextValue>(
    () => ({
      accountUserId,
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
      preferencesLoaded,
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
      refreshPaperAccount,
      loadTrackedQuotes,
      checkSelectedStocks,
      selectTrackedTicker,
      removeTrackedTicker,
      loadNewsReport,
      runAutoTrade,
      loadMockTradingDay,
      simulateOrder,
      clearPaperTradeLog,
      setLastAction,
    }),
    [
      accountUserId,
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
      preferencesLoaded,
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
      refreshPaperAccount,
      loadTrackedQuotes,
      checkSelectedStocks,
      selectTrackedTicker,
      removeTrackedTicker,
      loadNewsReport,
      runAutoTrade,
      loadMockTradingDay,
      simulateOrder,
      clearPaperTradeLog,
    ],
  );

  const actionsValue = useMemo<TradeWorkspaceActionsContextValue>(
    () => ({
      hydrateWorkspace,
    }),
    [hydrateWorkspace],
  );

  const portfolioValue = useMemo<PortfolioWorkspaceContextValue>(
    () => ({
      accountUserId,
      paperAccount,
      paperAccountLoading,
      paperAccountError,
      refreshPaperAccount,
      portfolio,
      portfolioLoading,
      portfolioError,
      refreshPortfolio,
    }),
    [
      accountUserId,
      paperAccount,
      paperAccountLoading,
      paperAccountError,
      refreshPaperAccount,
      portfolio,
      portfolioLoading,
      portfolioError,
      refreshPortfolio,
    ],
  );

  return (
    <TradeWorkspaceActionsContext.Provider value={actionsValue}>
      <PortfolioWorkspaceContext.Provider value={portfolioValue}>
        <TradeWorkspaceContext.Provider value={tradeValue}>
          {children}
        </TradeWorkspaceContext.Provider>
      </PortfolioWorkspaceContext.Provider>
    </TradeWorkspaceActionsContext.Provider>
  );
}

export function useTradeWorkspace() {
  const context = useContext(TradeWorkspaceContext);
  if (!context) {
    throw new Error("useTradeWorkspace must be used within TradeWorkspaceProvider");
  }
  return context;
}

export function useTradeWorkspaceActions() {
  const context = useContext(TradeWorkspaceActionsContext);
  if (!context) {
    throw new Error(
      "useTradeWorkspaceActions must be used within TradeWorkspaceProvider",
    );
  }
  return context;
}

export function usePortfolioWorkspace() {
  const context = useContext(PortfolioWorkspaceContext);
  if (!context) {
    throw new Error(
      "usePortfolioWorkspace must be used within TradeWorkspaceProvider",
    );
  }
  return context;
}
