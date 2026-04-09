"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  persistedTradingSlicesEqual,
  saveTradingState,
  subscribeToTradingState,
  type PersistedTradingSlices,
} from "@/lib/firestore";
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
  executeAutoTrade,
  executeAutoTradeBatch,
  fetchMockTradingDay,
  fetchNewsReport,
  fetchPaperAccount,
  fetchPaperAccountPerformance,
  fetchStockQuotes,
  fetchWatchSession,
  startWatchSession,
} from "@/lib/stock-quote";
import {
  createSimulationFromQuotes,
  executeTrade,
  getSimulationSnapshot,
  HISTORIC_REPLAY_WINDOW_HOURS,
  isTradeWorkspaceFresh,
  MAX_TRACKED_TICKERS,
  normalizeHistoricReplayWindowHours,
  readStoredJson,
  readStoredHistoricReplayWindowHours,
  readStoredModelProfile,
  readStoredRefreshCadence,
  readStoredTradeMode,
  readTradeWorkspace,
  TRADE_STORAGE_KEYS,
  type HistoricReplayWindowHours,
  type TradeMode,
  type TradingTimeMode,
  type TradingSimulation,
  type SimulationSnapshot,
  type TradeWorkspaceSnapshot,
  writeStoredJson,
  writeStoredString,
  writeTradeWorkspace,
  shiftSimulationTime,
  getSimulationTimelineBounds,
  localDateInputToUsMarketOpenIso,
} from "@/lib/trade-workspace";

const CADENCE_MS: Record<RefreshCadence, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
} as const;

const PORTFOLIO_REFRESH_MS = 30_000;
const WORKSPACE_PERSIST_DEBOUNCE_MS = 750;
const HISTORIC_MARKET_DATA_PROVIDERS = ["alpaca", "yfinance"] as const;
const DEFAULT_HISTORIC_BAR_INTERVAL_MS = 15 * 60_000;

/** Historic clock: fire once per real second so the UI ticks like live wall time. */
const HISTORIC_CLOCK_TICK_MS = 1_000;
/**
 * Simulated ms per real ms when speedMultiplier === 1 (wall-clock parity).
 * Use a higher speed multiplier to fast-forward through 1m chart bars faster.
 */
const HISTORIC_SIM_MS_PER_REAL_MS = 1;
/** Small debounce so rapid historic minute changes coalesce into one fetch. */
const HISTORIC_QUOTE_FETCH_DEBOUNCE_MS = 120;
/** Wait after simulated time moves before fetching news (bursts mainly while scrubbing at high speed). */
const HISTORIC_NEWS_DEBOUNCE_MS = 450;

function historicApiDelayMs(baseMs: number, speedMultiplier: number): number {
  const speed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  if (speed <= 1) {
    return baseMs;
  }
  return Math.round(baseMs * speed);
}

function parseMarketDataIntervalMs(interval?: string | null): number | null {
  if (!interval) {
    return null;
  }
  const match = interval.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = match[2];
  if (unit === "m") {
    return value * 60_000;
  }
  if (unit === "h") {
    return value * 60 * 60_000;
  }
  return value * 24 * 60 * 60_000;
}

function nextHistoricBarBoundaryIso(
  playheadIso: string | null | undefined,
  intervalMs: number,
): string | null {
  if (!playheadIso) {
    return null;
  }
  const playheadMs = new Date(playheadIso).getTime();
  if (Number.isNaN(playheadMs) || intervalMs <= 0) {
    return playheadIso;
  }
  const nextBoundaryMs = Math.floor(playheadMs / intervalMs) * intervalMs + intervalMs;
  return new Date(nextBoundaryMs).toISOString();
}

function clampHistoricStartToTimeline(
  sim: TradingSimulation,
  symbol: string,
  isoStart: string,
): string {
  const bounds = getSimulationTimelineBounds(sim, symbol);
  if (!bounds) {
    return isoStart;
  }
  const ms = new Date(isoStart).getTime();
  return new Date(
    Math.max(bounds.minMs, Math.min(bounds.maxMs, ms)),
  ).toISOString();
}

function clampIsoToTimelinePoints(
  points: Array<{ time: string }>,
  iso: string,
): string {
  if (!points.length) {
    return iso;
  }
  const targetMs = new Date(iso).getTime();
  if (Number.isNaN(targetMs)) {
    return points[points.length - 1]?.time ?? iso;
  }
  const firstMs = new Date(points[0].time).getTime();
  const lastMs = new Date(points[points.length - 1]?.time ?? points[0].time).getTime();
  if (Number.isNaN(firstMs) || Number.isNaN(lastMs)) {
    return iso;
  }
  return new Date(Math.max(firstMs, Math.min(lastMs, targetMs))).toISOString();
}

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

function collectPassiveHoldingSymbols(
  activeTickers: string[],
  simulation: TradingSimulation | null,
  paperAccount: PaperAccount | null,
) {
  const active = new Set(activeTickers);
  const passive = new Set<string>();

  for (const symbol of Object.keys(simulation?.positions ?? {})) {
    if (!active.has(symbol)) {
      passive.add(symbol);
    }
  }

  for (const position of paperAccount?.positions ?? []) {
    if (!active.has(position.ticker)) {
      passive.add(position.ticker);
    }
  }

  return passive;
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

type LoadTrackedQuotesResult = {
  quotes: MockQuote[];
  failures: string[];
};

type AddTrackedTickerResult = {
  status: "added" | "exists" | "limit" | "error";
  message: string;
  ticker?: string;
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
  /** Historic vs live time behavior (separate from `tradeMode` manual/model). */
  tradingTimeMode: TradingTimeMode;
  /** Start of the historic window (ISO string), used when `tradingTimeMode === "historic"`. */
  startDate: string | null;
  /** Current point in simulated time for historic mode (ISO string). */
  simulatedDate: string | null;
  historicReplayWindowHours: HistoricReplayWindowHours;
  /** Playback speed when fast-forwarding historic simulation (1 = normal). */
  speedMultiplier: number;
  /** When true, historic simulated time does not advance (play/pause). */
  historicPlaybackPaused: boolean;
  setTradingTimeMode: (next: TradingTimeMode) => void;
  setStartDate: (next: string | null) => void;
  setSimulatedDate: (next: string | null) => void;
  setHistoricReplayWindowHours: (next: HistoricReplayWindowHours) => void;
  setSpeedMultiplier: (next: number) => void;
  setHistoricPlaybackPaused: (
    next: boolean | ((current: boolean) => boolean),
  ) => void;
  /** Anchor historic session to local start-of-day for `YYYY-MM-DD` (calendar input). */
  beginHistoricSessionAt: (localDateInput: string) => void;
  marketSnapshot: { isOpen: boolean; statusLabel: string };
  simulation: TradingSimulation | null;
  simulationSnapshot: SimulationSnapshot | null;
  advanceSimulationTime: (deltaSteps: number) => void;
  resetSimulationTime: () => void;
  setTradeMode: (next: TradeMode) => void;
  setModelProfile: (next: ModelProfile) => void;
  setRefreshCadence: (next: RefreshCadence) => void;
  setAutoTradeEnabled: (updater: boolean | ((current: boolean) => boolean)) => void;
  refreshPaperAccount: (showLoading?: boolean) => Promise<void>;
  loadTrackedQuotes: (
    targetTickers: string[],
    options?: { showLoading?: boolean; asOf?: string },
  ) => Promise<LoadTrackedQuotesResult>;
  addTrackedTicker: (ticker: string) => Promise<AddTrackedTickerResult>;
  checkSelectedStocks: () => Promise<void>;
  selectTrackedTicker: (ticker: string) => void;
  removeTrackedTicker: (ticker: string) => void;
  loadNewsReport: (options?: {
    forceRefresh?: boolean;
    showLoading?: boolean;
    asOf?: string;
  }) => Promise<void>;
  runAutoTrade: () => Promise<void>;
  loadMockTradingDay: () => Promise<void>;
  simulateOrder: (side: "buy" | "sell", shares: number) => void;
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
  const pathname = usePathname();
  const { user } = useAuth();
  const accountUserId = user?.uid ?? "guest";
  const isTradeRoute = pathname?.startsWith("/trade") ?? false;
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
  const [tradingTimeMode, setTradingTimeModeState] =
    useState<TradingTimeMode>("live");
  const [startDate, setStartDateState] = useState<string | null>(null);
  const [simulatedDate, setSimulatedDateState] = useState<string | null>(null);
  /** Bumped when the user applies a historic calendar anchor so flush logic runs even if dates are unchanged. */
  const [historicSessionAnchorNonce, setHistoricSessionAnchorNonce] =
    useState(0);
  /** Bumped when historic quotes return with `asOf` so timelines rebuild to a stable window (not every simulated clock tick). */
  const [historicChartEpoch, setHistoricChartEpoch] = useState(0);
  const [historicReplayWindowHours, setHistoricReplayWindowHoursState] =
    useState<HistoricReplayWindowHours>(HISTORIC_REPLAY_WINDOW_HOURS[1]);
  const [speedMultiplier, setSpeedMultiplierState] = useState(1);
  const [historicPlaybackPaused, setHistoricPlaybackPausedState] = useState(false);
  const [liveSimulation, setLiveSimulation] = useState<TradingSimulation | null>(
    null,
  );
  const [historicSimulation, setHistoricSimulation] =
    useState<TradingSimulation | null>(null);
  const [persistedSlices, setPersistedSlices] = useState<PersistedTradingSlices>({
    live: null,
    historic: null,
  });
  const persistedHistoricSliceRef = useRef(persistedSlices.historic);
  persistedHistoricSliceRef.current = persistedSlices.historic;
  const [hasHydratedLivePersisted, setHasHydratedLivePersisted] =
    useState(false);
  const [hasHydratedHistoricPersisted, setHasHydratedHistoricPersisted] =
    useState(false);
  const [watchSyncTick, setWatchSyncTick] = useState(0);
  const [watchSessionReady, setWatchSessionReady] = useState(false);
  const simulationRef = useRef<TradingSimulation | null>(null);
  const paperAccountRef = useRef<PaperAccount | null>(null);
  const skipInitialQuotesRefreshRef = useRef(false);
  const skipInitialPaperAccountRefreshRef = useRef(false);
  const skipInitialNewsRefreshRef = useRef(false);

  const historicSimulationRef = useRef(historicSimulation);
  historicSimulationRef.current = historicSimulation;
  const historicSimTimeRef = useRef<string | null>(null);
  const historicClockLastRealMsRef = useRef<number | null>(null);
  const selectedTickerRef = useRef(selectedTicker);
  selectedTickerRef.current = selectedTicker;
  const trackedTickersRef = useRef(trackedTickers);
  trackedTickersRef.current = trackedTickers;
  const speedMultiplierRef = useRef(speedMultiplier);
  speedMultiplierRef.current = speedMultiplier;
  const historicPlaybackPausedRef = useRef(historicPlaybackPaused);
  historicPlaybackPausedRef.current = historicPlaybackPaused;
  const startDateRef = useRef(startDate);
  startDateRef.current = startDate;
  const simulatedDateRefForQuotes = useRef(simulatedDate);
  simulatedDateRefForQuotes.current = simulatedDate;
  const historicNewsFetchedKeyRef = useRef("");
  const pendingHistoricStartIsoRef = useRef<string | null>(null);
  /** ISO end of the loaded historic chart window (last `asOf` used for quote fetch); playhead moves inside without rebuilding bars each tick. */
  const historicChartEndIsoRef = useRef<string | null>(null);
  /** Suppress duplicate `showLoading` historic fetches while playing (same anchor + tickers); poller handles playhead updates. */
  const lastHistoricQuoteBootstrapKeyRef = useRef<string>("");
  /** Suppress duplicate historic quote fetches within the same simulated minute. */
  const lastHistoricMinuteQuoteFetchKeyRef = useRef<string>("");
  /** Suppress duplicate live bootstrap quote loads when dependencies are effectively unchanged. */
  const lastLiveQuoteBootstrapKeyRef = useRef<string>("");
  /** Prevent bootstrap quote effect from recursively re-triggering while a loading fetch is active. */
  const bootstrapQuotesInFlightRef = useRef(false);
  /** Skip one bootstrap quotes effect run after `setTradingTimeMode` already refreshed quotes in a microtask. */
  const suppressBootstrapQuotesEffectRef = useRef(false);
  const preferencesLoadedRef = useRef(preferencesLoaded);
  preferencesLoadedRef.current = preferencesLoaded;
  const historicSessionAnchorNonceRef = useRef(historicSessionAnchorNonce);
  historicSessionAnchorNonceRef.current = historicSessionAnchorNonce;
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const historicBarIntervalMsRef = useRef(DEFAULT_HISTORIC_BAR_INTERVAL_MS);

  const marketSnapshot = useMemo(() => getEasternMarketSnapshot(clock), [clock]);
  const newsRefreshSeconds = refreshSecondsForCadence(refreshCadence);
  const simulation = useMemo(() => {
    if (tradingTimeMode === "live") {
      return liveSimulation;
    }
    if (!historicSimulation) {
      return null;
    }
    const playhead = simulatedDate ?? historicSimulation.simulationTime;
    if (playhead === historicSimulation.simulationTime) {
      return historicSimulation;
    }
    return {
      ...historicSimulation,
      simulationTime: playhead,
    };
  }, [historicSimulation, liveSimulation, simulatedDate, tradingTimeMode]);
  const simulationSnapshot = useMemo(
    () => (simulation ? getSimulationSnapshot(simulation) : null),
    [simulation],
  );

  useEffect(() => {
    if (tradingTimeMode === "historic" && simulatedDate) {
      historicSimTimeRef.current = simulatedDate;
    }
  }, [simulatedDate, tradingTimeMode]);

  useEffect(() => {
    if (tradingTimeMode !== "historic" || !historicSimulation) {
      return;
    }
    setSimulatedDateState((prev) => {
      if (prev) {
        return prev;
      }
      const t = historicSimulation.simulationTime;
      historicSimTimeRef.current = t;
      return t;
    });
  }, [tradingTimeMode, historicSimulation]);

  useEffect(() => {
    if (tradingTimeMode !== "historic") {
      lastHistoricQuoteBootstrapKeyRef.current = "";
      lastHistoricMinuteQuoteFetchKeyRef.current = "";
    }
  }, [tradingTimeMode]);

  useEffect(() => {
    if (tradingTimeMode !== "live") {
      lastLiveQuoteBootstrapKeyRef.current = "";
    }
  }, [tradingTimeMode]);

  useEffect(() => {
    if (tradingTimeMode !== "historic") {
      historicClockLastRealMsRef.current = null;
      return;
    }

    const id = window.setInterval(() => {
      const sim = historicSimulationRef.current;
      if (!sim) {
        return;
      }

      if (historicPlaybackPausedRef.current) {
        historicClockLastRealMsRef.current = performance.now();
        return;
      }

      const speed = speedMultiplierRef.current;
      if (speed <= 0) {
        historicClockLastRealMsRef.current = performance.now();
        return;
      }

      const symbol =
        selectedTickerRef.current ||
        trackedTickersRef.current[0] ||
        Object.keys(sim.priceTimelineBySymbol)[0] ||
        "";
      if (!symbol) {
        return;
      }

      const bounds = getSimulationTimelineBounds(sim, symbol);
      if (!bounds) {
        return;
      }

      const now = performance.now();
      const last = historicClockLastRealMsRef.current;
      historicClockLastRealMsRef.current = now;
      const dtRealMs =
        last === null
          ? HISTORIC_CLOCK_TICK_MS
          : Math.min(Math.max(0, now - last), 3_000);

      let floorMs = bounds.minMs;
      const sessionStart = startDateRef.current;
      if (sessionStart) {
        const sessionOpenMs = new Date(sessionStart).getTime();
        if (!Number.isNaN(sessionOpenMs)) {
          floorMs = Math.max(floorMs, sessionOpenMs);
        }
      }

      const currentIso = historicSimTimeRef.current ?? sim.simulationTime;
      const currentMs = new Date(currentIso).getTime();
      const baseMs = Number.isNaN(currentMs) ? floorMs : currentMs;
      let nextMs =
        baseMs + dtRealMs * speed * HISTORIC_SIM_MS_PER_REAL_MS;
      // Historic: no upper cap on simulated time (quotes use last bar; live mode caps via its own clock).
      nextMs = Math.max(floorMs, nextMs);
      const iso = new Date(nextMs).toISOString();

      historicSimTimeRef.current = iso;
      // Non-urgent updates so route transitions are not starved (mirrors live clock priority).
      startTransition(() => {
        setSimulatedDateState(iso);
      });
    }, HISTORIC_CLOCK_TICK_MS);

    return () => {
      window.clearInterval(id);
      historicClockLastRealMsRef.current = null;
    };
  }, [tradingTimeMode]);

  useEffect(() => {
    simulationRef.current = simulation;
  }, [simulation]);

  useEffect(() => {
    paperAccountRef.current = paperAccount;
  }, [paperAccount]);

  const applyWorkspaceSnapshot = useCallback(
    (
      snapshot: TradeWorkspaceSnapshot,
      options: { respectFreshness?: boolean } = {},
    ) => {
      const nextTickers = normalizeTrackedTickers(snapshot.trackedTickers);
      const passiveHoldingSymbols = collectPassiveHoldingSymbols(
        nextTickers,
        simulationRef.current,
        snapshot.paperAccount ?? paperAccountRef.current,
      );
      const nextSelectedTicker = nextTickers.includes(snapshot.selectedTicker)
        ? snapshot.selectedTicker
        : nextTickers[0] ?? "";
      const workspaceFresh = options.respectFreshness
        ? isTradeWorkspaceFresh(snapshot)
        : true;

      setTrackedTickers(nextTickers);
      setSelectedTicker(nextSelectedTicker);
      setQuotesByTicker((current) => {
        const nextQuotes = { ...(snapshot.quotesByTicker ?? {}) };
        for (const symbol of passiveHoldingSymbols) {
          const existing = current[symbol];
          if (existing) {
            nextQuotes[symbol] = existing;
          }
        }
        return nextQuotes;
      });
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
    const storedHistoricReplayWindowHours =
      readStoredHistoricReplayWindowHours();
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
    setHistoricReplayWindowHoursState(storedHistoricReplayWindowHours);

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
      TRADE_STORAGE_KEYS.historicReplayWindowHours,
      String(historicReplayWindowHours),
    );
    writeStoredString(
      TRADE_STORAGE_KEYS.autoTradeEnabled,
      String(autoTradeEnabled),
    );
  }, [
    autoTradeEnabled,
    historicReplayWindowHours,
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

  useEffect(() => {
    if (!user?.uid) {
      pendingHistoricStartIsoRef.current = null;
      historicChartEndIsoRef.current = null;
      setPersistedSlices({ live: null, historic: null });
      setHasHydratedLivePersisted(false);
      setHasHydratedHistoricPersisted(false);
      setLiveSimulation(null);
      setHistoricSimulation(null);
      return;
    }
    setPersistedSlices({ live: null, historic: null });
    setHasHydratedLivePersisted(false);
    setHasHydratedHistoricPersisted(false);
    setLiveSimulation(null);
    setHistoricSimulation(null);

    return subscribeToTradingState(
      user.uid,
      (next) => {
        setPersistedSlices((prev) =>
          persistedTradingSlicesEqual(prev, next) ? prev : next,
        );
      },
      (error) => {
        console.error("Trading-state sync disabled:", error);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    const livePositions = persistedSlices.live?.positions;
    if (!livePositions) {
      return;
    }
    const persistedSymbols = Object.keys(livePositions);
    if (!persistedSymbols.length) {
      return;
    }
    setTrackedTickers((current) => {
      if (current.length) {
        return current;
      }
      const next = normalizeTrackedTickers(persistedSymbols);
      if (!selectedTicker && next.length) {
        setSelectedTicker(next[0]);
      }
      return next;
    });
  }, [persistedSlices.live, selectedTicker]);

  useEffect(() => {
    if (!preferencesLoaded) {
      return;
    }
    if (!Object.keys(quotesByTicker).length) {
      setLiveSimulation(null);
      setHistoricSimulation(null);
      return;
    }
  }, [preferencesLoaded, quotesByTicker]);

  useEffect(() => {
    if (
      !preferencesLoaded ||
      tradingTimeMode !== "live" ||
      !Object.keys(quotesByTicker).length
    ) {
      return;
    }

    const createdForLive = createSimulationFromQuotes(
      quotesByTicker,
      clock,
      selectedTicker,
      { timelineWindowHours: HISTORIC_REPLAY_WINDOW_HOURS[1] },
    );

    setLiveSimulation((current) => {
      if (tradingTimeMode !== "live") {
        return current;
      }
      if (!hasHydratedLivePersisted && persistedSlices.live) {
        const persisted = persistedSlices.live;
        const next = {
          ...createdForLive,
          cash: persisted.cash,
          positions: persisted.positions,
          trades: persisted.trades,
          simulationTime: persisted.simulationTime ?? createdForLive.simulationTime,
        };
        setHasHydratedLivePersisted(true);
        return next;
      }
      if (!current) {
        return createdForLive;
      }
      const sym =
        selectedTicker && createdForLive.priceTimelineBySymbol[selectedTicker] !== undefined
          ? selectedTicker
          : Object.keys(createdForLive.priceTimelineBySymbol)[0] ?? "";
      const len = sym ? createdForLive.priceTimelineBySymbol[sym]?.length ?? 0 : 0;
      return {
        ...current,
        priceTimelineBySymbol: createdForLive.priceTimelineBySymbol,
        simulationTime: len > 0 ? current.simulationTime : createdForLive.simulationTime,
      };
    });
  }, [
    clock,
    hasHydratedLivePersisted,
    persistedSlices.live,
    preferencesLoaded,
    quotesByTicker,
    selectedTicker,
    tradingTimeMode,
  ]);

  useEffect(() => {
    if (
      !preferencesLoaded ||
      tradingTimeMode !== "historic" ||
      !Object.keys(quotesByTicker).length
    ) {
      return;
    }

    const endIso = historicChartEndIsoRef.current;
    const fallbackIso = simulatedDateRefForQuotes.current;
    const nowForHistoric =
      endIso != null && endIso !== ""
        ? new Date(endIso)
        : fallbackIso != null
          ? new Date(fallbackIso)
          : clockRef.current;

    const createdForHistoric = createSimulationFromQuotes(
      quotesByTicker,
      nowForHistoric,
      selectedTicker,
      { timelineWindowHours: historicReplayWindowHours },
    );

    setHistoricSimulation((current) => {
      if (tradingTimeMode !== "historic") {
        return current;
      }
      const persistedFromCloud = persistedHistoricSliceRef.current;
      if (!hasHydratedHistoricPersisted && persistedFromCloud) {
        const persisted = persistedFromCloud;
        const next = {
          ...createdForHistoric,
          cash: persisted.cash,
          positions: persisted.positions,
          trades: persisted.trades,
          simulationTime: persisted.simulationTime ?? createdForHistoric.simulationTime,
        };
        setHasHydratedHistoricPersisted(true);
        return next;
      }
      if (!current) {
        return {
          ...createdForHistoric,
          simulationTime:
            historicSimTimeRef.current ?? createdForHistoric.simulationTime,
        };
      }
      const sym =
        selectedTicker &&
        createdForHistoric.priceTimelineBySymbol[selectedTicker] !== undefined
          ? selectedTicker
          : Object.keys(createdForHistoric.priceTimelineBySymbol)[0] ?? "";
      const len = sym
        ? createdForHistoric.priceTimelineBySymbol[sym]?.length ?? 0
        : 0;
      const desiredPlayhead = historicSimTimeRef.current ?? current.simulationTime;
      const playhead = clampIsoToTimelinePoints(
        createdForHistoric.priceTimelineBySymbol[sym] ?? [],
        desiredPlayhead,
      );
      return {
        ...current,
        priceTimelineBySymbol: createdForHistoric.priceTimelineBySymbol,
        simulationTime: len > 0 ? playhead : createdForHistoric.simulationTime,
      };
    });
  }, [
    hasHydratedHistoricPersisted,
    historicReplayWindowHours,
    historicChartEpoch,
    historicSessionAnchorNonce,
    preferencesLoaded,
    quotesByTicker,
    selectedTicker,
    tradingTimeMode,
  ]);

  useEffect(() => {
    void historicSessionAnchorNonce;
    const pending = pendingHistoricStartIsoRef.current;
    if (tradingTimeMode !== "historic" || !pending || !historicSimulation) {
      return;
    }
    const symbol =
      selectedTickerRef.current ||
      trackedTickersRef.current[0] ||
      Object.keys(historicSimulation.priceTimelineBySymbol)[0] ||
      "";
    if (!symbol) {
      return;
    }
    const points =
      historicSimulation.priceTimelineBySymbol[symbol] ??
      Object.values(historicSimulation.priceTimelineBySymbol)[0] ??
      [];
    if (!points.length) {
      return;
    }
    const simTime = clampHistoricStartToTimeline(
      historicSimulation,
      symbol,
      pending,
    );
    pendingHistoricStartIsoRef.current = null;
    historicSimTimeRef.current = simTime;
    setSimulatedDateState(simTime);
    setHistoricSimulation((s) =>
      s ? { ...s, simulationTime: simTime } : s,
    );
  }, [historicSessionAnchorNonce, historicSimulation, tradingTimeMode]);

  useEffect(() => {
    if (!user?.uid || !liveSimulation) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveTradingState(user.uid, "live", {
        cash: liveSimulation.cash,
        positions: liveSimulation.positions,
        trades: liveSimulation.trades,
        simulationTime: liveSimulation.simulationTime,
      });
    }, WORKSPACE_PERSIST_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [liveSimulation, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !historicSimulation) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveTradingState(user.uid, "historic", {
        cash: historicSimulation.cash,
        positions: historicSimulation.positions,
        trades: historicSimulation.trades,
        simulationTime: historicSimulation.simulationTime,
      });
    }, WORKSPACE_PERSIST_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [historicSimulation, user?.uid]);

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
      options: { showLoading?: boolean; asOf?: string } = {},
    ): Promise<LoadTrackedQuotesResult> => {
      const symbols = normalizeTrackedTickers(targetTickers);
      if (!symbols.length) {
        return { quotes: [], failures: [] };
      }

      if (options.showLoading) {
        setLoading(true);
      }

      try {
        let nextQuotes: MockQuote[] = [];
        let failures: string[] = [];

        if (options.asOf) {
          const resultsByTicker = new Map<string, MockQuote>();
          const errorsByTicker = new Map<string, string>();
          let remaining = [...symbols];

          for (const provider of HISTORIC_MARKET_DATA_PROVIDERS) {
            if (!remaining.length) {
              break;
            }

            try {
              const batch = await fetchStockQuotes(remaining, {
                modelProfile,
                provider,
                asOf: options.asOf,
              });
              const successfulTickers = new Set(
                batch.results.map((quote) => quote.ticker),
              );

              for (const quote of batch.results) {
                resultsByTicker.set(quote.ticker, quote);
                errorsByTicker.delete(quote.ticker);
              }
              for (const error of batch.errors) {
                if (!successfulTickers.has(error.ticker)) {
                  errorsByTicker.set(error.ticker, error.message);
                }
              }

              remaining = remaining.filter(
                (ticker) => !successfulTickers.has(ticker),
              );
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : `Could not load historical quotes from ${provider}.`;
              for (const ticker of remaining) {
                errorsByTicker.set(ticker, message);
              }
            }
          }

          nextQuotes = symbols
            .map((ticker) => resultsByTicker.get(ticker))
            .filter((quote): quote is MockQuote => Boolean(quote));
          failures = symbols
            .filter((ticker) => !resultsByTicker.has(ticker))
            .map(
              (ticker) =>
                `${ticker}: ${errorsByTicker.get(ticker) ?? "Could not load historical quote."}`,
            );
        } else {
          const batch = await fetchStockQuotes(symbols, {
            modelProfile,
          });
          nextQuotes = batch.results;
          failures = batch.errors.map(
            (error) => `${error.ticker}: ${error.message}`,
          );
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

        if (options.asOf && nextQuotes.length) {
          historicChartEndIsoRef.current = options.asOf;
          // Like live mode: background polls only merge quotes; full chart rebuild on bootstrap / loading fetches.
          if (options.showLoading) {
            setHistoricChartEpoch((e) => e + 1);
          }
        }
        return { quotes: nextQuotes, failures };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not load quotes.";
        setError(message);
        return { quotes: [], failures: [message] };
      } finally {
        if (options.showLoading) {
          setLoading(false);
        }
      }
    },
    [modelProfile],
  );

  const loadTrackedQuotesRef = useRef(loadTrackedQuotes);
  loadTrackedQuotesRef.current = loadTrackedQuotes;

  const trackedTickersKey = useMemo(
    () => normalizeTrackedTickers(trackedTickers).join(","),
    [trackedTickers],
  );
  const historicBarIntervalMs = useMemo(() => {
    const intervals = Object.values(quotesByTicker)
      .map((quote) => parseMarketDataIntervalMs(quote.marketDataInterval))
      .filter((value): value is number => value != null && value > 0);
    return intervals[0] ?? DEFAULT_HISTORIC_BAR_INTERVAL_MS;
  }, [quotesByTicker]);
  historicBarIntervalMsRef.current = historicBarIntervalMs;
  const historicQuoteRequestEndIso = useMemo(() => {
    if (tradingTimeMode !== "historic") {
      return null;
    }
    const playhead = simulatedDate ?? historicSimulation?.simulationTime ?? null;
    return nextHistoricBarBoundaryIso(playhead, historicBarIntervalMs);
  }, [
    historicBarIntervalMs,
    historicSimulation?.simulationTime,
    simulatedDate,
    tradingTimeMode,
  ]);

  useEffect(() => {
    if (!preferencesLoaded || !trackedTickersKey) {
      return;
    }
    if (bootstrapQuotesInFlightRef.current) {
      return;
    }

    if (suppressBootstrapQuotesEffectRef.current) {
      suppressBootstrapQuotesEffectRef.current = false;
      return;
    }

    if (skipInitialQuotesRefreshRef.current) {
      skipInitialQuotesRefreshRef.current = false;
      return;
    }

    const stableTickers = trackedTickersKey.split(",").filter(Boolean);
    const load = loadTrackedQuotesRef.current;

    if (tradingTimeMode === "historic") {
      const asOf = historicQuoteRequestEndIso ?? undefined;
      if (!asOf) {
        return;
      }
      const bootstrapKey = `${historicSessionAnchorNonce}|${startDate ?? ""}|${trackedTickersKey}|${modelProfile}`;
      if (bootstrapKey === lastHistoricQuoteBootstrapKeyRef.current) {
        return;
      }
      lastHistoricQuoteBootstrapKeyRef.current = bootstrapKey;
      lastHistoricMinuteQuoteFetchKeyRef.current = `${historicSessionAnchorNonce}|${trackedTickersKey}|${asOf}`;
      bootstrapQuotesInFlightRef.current = true;
      void load(stableTickers, { showLoading: true, asOf }).finally(() => {
        bootstrapQuotesInFlightRef.current = false;
      });
      return;
    }

    const liveBootstrapKey = `${trackedTickersKey}|${modelProfile}`;
    if (liveBootstrapKey === lastLiveQuoteBootstrapKeyRef.current) {
      return;
    }
    lastLiveQuoteBootstrapKeyRef.current = liveBootstrapKey;
    bootstrapQuotesInFlightRef.current = true;
    void load(stableTickers, { showLoading: true }).finally(() => {
      bootstrapQuotesInFlightRef.current = false;
    });
  }, [
    historicQuoteRequestEndIso,
    historicSessionAnchorNonce,
    modelProfile,
    preferencesLoaded,
    startDate,
    trackedTickersKey,
    tradingTimeMode,
  ]);

  /**
   * Historic quotes are minute-bar snapshots, so fetching more often than the
   * simulated minute changes only creates render churn. Fetch once per minute
   * bucket transition, whether playback is running or the user is stepping manually.
   */
  useEffect(() => {
    if (!preferencesLoaded || !trackedTickersKey || tradingTimeMode !== "historic") {
      return;
    }
    if (!historicQuoteRequestEndIso) {
      return;
    }

    const fetchKey = `${historicSessionAnchorNonce}|${trackedTickersKey}|${historicQuoteRequestEndIso}`;
    if (fetchKey === lastHistoricMinuteQuoteFetchKeyRef.current) {
      return;
    }

    const handle = window.setTimeout(() => {
      const asOf = historicQuoteRequestEndIso;
      if (!asOf) {
        return;
      }
      lastHistoricMinuteQuoteFetchKeyRef.current = fetchKey;
      void loadTrackedQuotes(trackedTickersKey.split(",").filter(Boolean), {
        showLoading: false,
        asOf,
      });
    }, HISTORIC_QUOTE_FETCH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [
    historicQuoteRequestEndIso,
    historicSessionAnchorNonce,
    loadTrackedQuotes,
    preferencesLoaded,
    trackedTickersKey,
    tradingTimeMode,
  ]);

  const syncWatchSession = useCallback(
    async (tickers: string[]): Promise<boolean> => {
      if (tradingTimeMode !== "live" || !tickers.length) {
        setWatchSessionReady(false);
        return false;
      }

      try {
        await startWatchSession(tickers, {
          userId: accountUserId,
          modelProfile,
          cadence: refreshCadence,
          autoTradeEnabled: tradeMode === "model" ? autoTradeEnabled : false,
        });
        setWatchSessionReady(true);
        return true;
      } catch (err) {
        console.error("Could not start watch session.", err);
        setWatchSessionReady(false);
        return false;
      }
    },
    [
      accountUserId,
      autoTradeEnabled,
      modelProfile,
      refreshCadence,
      tradeMode,
      tradingTimeMode,
    ],
  );

  const addTrackedTicker = useCallback(
    async (ticker: string): Promise<AddTrackedTickerResult> => {
      const normalized = ticker.trim().toUpperCase();
      if (!normalized) {
        const message = "Enter a ticker symbol before submitting.";
        setError(message);
        return { status: "error", message };
      }

      if (trackedTickersRef.current.includes(normalized)) {
        setSelectedTicker(normalized);
        setMockTradingDay(null);
        setMockTradingError(null);
        setError(null);
        const message = `${normalized} is already in your tracked symbols.`;
        setLastAction(message);
        return { status: "exists", message, ticker: normalized };
      }

      if (trackedTickersRef.current.length >= MAX_TRACKED_TICKERS) {
        const message = `You already have ${MAX_TRACKED_TICKERS} tracked symbols. Remove one before adding another.`;
        setError(message);
        return { status: "limit", message };
      }

      setMockTradingDay(null);
      setMockTradingError(null);
      setAutoTradeError(null);
      setLastAction(null);

      const playhead =
        simulatedDateRefForQuotes.current ??
        historicSimulationRef.current?.simulationTime ??
        startDateRef.current;
      const asOf =
        tradingTimeMode === "historic" && playhead
          ? nextHistoricBarBoundaryIso(playhead, historicBarIntervalMsRef.current) ??
            playhead
          : undefined;

      const { quotes, failures } = await loadTrackedQuotes([normalized], {
        showLoading: true,
        ...(asOf ? { asOf } : {}),
      });
      const nextQuote = quotes.find((quote) => quote.ticker === normalized);

      if (!nextQuote) {
        const message =
          failures[0] ?? `Could not load market data for ${normalized}.`;
        setError(message);
        return { status: "error", message };
      }

      const nextTrackedTickers = normalizeTrackedTickers([
        ...trackedTickersRef.current,
        normalized,
      ]);
      setTrackedTickers(nextTrackedTickers);
      setSelectedTicker(normalized);
      setError(null);
      let message = `Added ${normalized} to your tracked symbols.`;
      if (tradingTimeMode === "live") {
        const watchStarted = await syncWatchSession(nextTrackedTickers);
        if (watchStarted) {
          setWatchSyncTick((current) => current + 1);
        } else {
          message =
            `${message} Live background syncing is unavailable right now.`;
        }
      }
      setLastAction(message);
      return { status: "added", message, ticker: normalized };
    },
    [loadTrackedQuotes, syncWatchSession, tradingTimeMode],
  );

  const checkSelectedStocks = useCallback(async () => {
    if (!trackedTickers.length) {
      setError("Add up to three tracked tickers first.");
      return;
    }

    setError(null);
    setLastAction(null);
    setMockTradingDay(null);
    setMockTradingError(null);
    const asOf =
      tradingTimeMode === "historic"
        ? (simulatedDate ?? historicSimulation?.simulationTime ?? undefined)
        : undefined;
    await loadTrackedQuotes(trackedTickers, {
      showLoading: true,
      ...(asOf ? { asOf } : {}),
    });
  }, [
    loadTrackedQuotes,
    trackedTickers,
    tradingTimeMode,
    simulatedDate,
    historicSimulation?.simulationTime,
  ]);

  const selectTrackedTicker = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    setLastAction(null);
    setMockTradingDay(null);
    setMockTradingError(null);
  }, []);

  const removeTrackedTicker = useCallback((ticker: string) => {
    const keepAsPassiveHolding =
      Boolean(simulation?.positions[ticker]) ||
      Boolean(paperAccount?.positions.some((position) => position.ticker === ticker));

    setTrackedTickers((current) => {
      const next = current.filter((entry) => entry !== ticker);
      setSelectedTicker((selected) =>
        selected === ticker ? next[0] ?? "" : selected,
      );
      return next;
    });
    setQuotesByTicker((current) => {
      const next = { ...current };
      if (!keepAsPassiveHolding) {
        delete next[ticker];
      }
      return next;
    });
    setNewsReportsByTicker((current) => {
      const next = { ...current };
      delete next[ticker];
      return next;
    });
    setAutoTradeResult((current) =>
      current?.ticker === ticker ? null : current,
    );
    setMockTradingDay((current) =>
      current?.ticker === ticker ? null : current,
    );
  }, [paperAccount, simulation]);

  const loadNewsReport = useCallback(
    async (options: {
      forceRefresh?: boolean;
      showLoading?: boolean;
      asOf?: string;
    } = {}) => {
      const raw = selectedTicker || trackedTickers[0] || "";
      if (!raw) {
        return;
      }

      const resolvedAsOf =
        options.asOf ??
        (tradingTimeMode === "historic"
          ? simulatedDateRefForQuotes.current ?? undefined
          : undefined);

      if (options.forceRefresh && resolvedAsOf) {
        historicNewsFetchedKeyRef.current = "";
      }

      if (options.showLoading) {
        setNewsReportLoading(true);
      }

      try {
        const report = await fetchNewsReport(raw, {
          modelProfile,
          refreshSeconds: newsRefreshSeconds,
          forceRefresh: options.forceRefresh,
          ...(resolvedAsOf ? { asOf: resolvedAsOf } : {}),
        });
        setNewsReportsByTicker((current) => ({
          ...current,
          [report.ticker]: report,
        }));
        setNewsReportError(null);
        if (resolvedAsOf) {
          const day = resolvedAsOf.slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            historicNewsFetchedKeyRef.current = `${report.ticker}|${day}`;
          }
        } else {
          historicNewsFetchedKeyRef.current = "";
        }
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
    [modelProfile, newsRefreshSeconds, selectedTicker, trackedTickers, tradingTimeMode],
  );

  const runAutoTrade = useCallback(async () => {
    if (tradingTimeMode !== "live") {
      setAutoTradeError("Paper auto-trading only runs in live mode.");
      return;
    }
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
    tradingTimeMode,
  ]);

  useEffect(() => {
    if (
      tradingTimeMode !== "live" ||
      !marketSnapshot.isOpen ||
      !trackedTickers.length
    ) {
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
    tradingTimeMode,
  ]);

  useEffect(() => {
    if (tradingTimeMode !== "live" || !trackedTickers.length) {
      setWatchSessionReady(false);
      return;
    }

    const timer = window.setInterval(() => {
      setWatchSyncTick((current) => current + 1);
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [trackedTickers.length, tradingTimeMode]);

  useEffect(() => {
    if (tradingTimeMode !== "live" || !trackedTickersKey) {
      return;
    }

    const symbols = trackedTickersKey.split(",").filter(Boolean);
    if (!symbols.length) {
      return;
    }

    const hasMissingQuote = symbols.some((ticker) => !quotesByTicker[ticker]);
    const intervalMs = hasMissingQuote ? 10_000 : CADENCE_MS[refreshCadence];

    const pollQuotes = () => {
      void loadTrackedQuotes(symbols, { showLoading: false });
    };

    // Fast recovery path: if one or more tracked symbols are missing, immediately retry.
    if (hasMissingQuote) {
      pollQuotes();
    }

    const timer = window.setInterval(pollQuotes, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    loadTrackedQuotes,
    quotesByTicker,
    refreshCadence,
    trackedTickersKey,
    tradingTimeMode,
  ]);

  useEffect(() => {
    if (tradingTimeMode !== "live" || !trackedTickers.length) {
      setWatchSessionReady(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const watchStarted = await syncWatchSession(trackedTickers);
      if (!cancelled && watchStarted) {
          setWatchSyncTick((current) => current + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [syncWatchSession, trackedTickers, tradingTimeMode]);

  useEffect(() => {
    if (
      tradingTimeMode !== "live" ||
      !trackedTickers.length ||
      !watchSessionReady
    ) {
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
        if (cancelled) {
          return;
        }
        const watchStarted = await syncWatchSession(trackedTickers);
        if (watchStarted && !cancelled) {
          setWatchSyncTick((current) => current + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accountUserId,
    syncWatchSession,
    trackedTickers,
    trackedTickers.length,
    tradingTimeMode,
    watchSessionReady,
    watchSyncTick,
  ]);

  useEffect(() => {
    if (
      tradingTimeMode !== "live" ||
      !autoTradeEnabled ||
      tradeMode !== "model" ||
      !marketSnapshot.isOpen
    ) {
      return;
    }

    void runAutoTrade();
  }, [
    autoTradeEnabled,
    marketSnapshot.isOpen,
    runAutoTrade,
    tradeMode,
    tradingTimeMode,
  ]);

  useEffect(() => {
    if (tradingTimeMode === "live") {
      historicNewsFetchedKeyRef.current = "";
    }
  }, [tradingTimeMode]);

  useEffect(() => {
    if (tradingTimeMode !== "historic" || !selectedTicker) {
      return;
    }
    const asOf = simulatedDateRefForQuotes.current;
    if (!asOf) {
      return;
    }
    const dayUtc = asOf.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayUtc)) {
      return;
    }
    const fetchKey = `${selectedTicker}|${dayUtc}`;
    if (historicNewsFetchedKeyRef.current === fetchKey) {
      return;
    }

    const debounceMs = historicApiDelayMs(HISTORIC_NEWS_DEBOUNCE_MS, speedMultiplier);
    const timer = window.setTimeout(() => {
      if (historicNewsFetchedKeyRef.current === fetchKey) {
        return;
      }
      void loadNewsReport({ showLoading: true, asOf });
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [
    historicSessionAnchorNonce,
    loadNewsReport,
    selectedTicker,
    simulatedDate,
    speedMultiplier,
    startDate,
    tradingTimeMode,
  ]);

  useEffect(() => {
    if (!isTradeRoute || !selectedTicker || tradingTimeMode === "historic") {
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
  }, [isTradeRoute, loadNewsReport, refreshCadence, selectedTicker, tradingTimeMode]);

  useEffect(() => {
    if (
      !isTradeRoute ||
      tradingTimeMode !== "live" ||
      !trackedTickers.length ||
      !marketSnapshot.isOpen
    ) {
      setStreamConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    
    // Brief delay to avoid the Alpaca "1 connection" limit during fast hot-reloads / reconnect storms
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
    }, 100);

    return () => {
      window.clearTimeout(timer);
      if (ws) {
        ws.close();
      }
    };
  }, [isTradeRoute, marketSnapshot.isOpen, trackedTickers, tradingTimeMode]);

  const loadMockTradingDay = useCallback(async () => {
    const raw = selectedTicker || trackedTickers[0] || "";
    if (!raw) {
      setMockTradingError("Add and select a tracked ticker first.");
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
    (side: "buy" | "sell", shares: number) => {
      const orderTicker =
        quotesByTicker[selectedTicker]?.ticker ?? (selectedTicker || "");
      if (!orderTicker) {
        setLastAction("Select a ticker before placing a trade.");
        return;
      }

      if (tradingTimeMode === "live") {
        void (async () => {
          try {
            const result = await executeAutoTrade(orderTicker, {
              modelProfile,
              cadence: refreshCadence,
              userId: accountUserId,
              requestedSide: side,
              quantity: shares,
            });
            setLastAction(result.statusMessage);
            await Promise.all([
              refreshPaperAccount(),
              refreshPortfolio({ background: true }),
            ]);
          } catch (err) {
            setLastAction(
              err instanceof Error ? err.message : "Trade failed.",
            );
          }
        })();
        return;
      }

      const applyTo = (sim: TradingSimulation | null) => {
        if (!sim) {
          setLastAction("Simulation is still loading price history.");
          return sim;
        }
        try {
          const next = executeTrade(sim, orderTicker, shares, side);
          const trade = next.trades[next.trades.length - 1];
          setLastAction(
            `${side === "buy" ? "Bought" : "Sold"} ${trade.shares} ${trade.symbol} @ $${trade.price.toFixed(2)} (sim ${new Date(trade.timestamp).toLocaleString()})`,
          );
          return next;
        } catch (err) {
          setLastAction(err instanceof Error ? err.message : "Trade failed.");
          return sim;
        }
      };

      setHistoricSimulation((sim) => applyTo(sim));
    },
    [
      accountUserId,
      modelProfile,
      quotesByTicker,
      refreshCadence,
      refreshPaperAccount,
      refreshPortfolio,
      selectedTicker,
      tradingTimeMode,
    ],
  );

  const advanceSimulationTime = useCallback(
    (deltaSteps: number) => {
      const symbol = selectedTicker || trackedTickers[0];
      if (!symbol) {
        return;
      }
      const bump = (current: TradingSimulation | null) =>
        current ? shiftSimulationTime(current, symbol, deltaSteps) : current;
      if (tradingTimeMode === "live") {
        setLiveSimulation(bump);
      } else {
        setHistoricSimulation((current) => {
          const next = bump(current);
          if (next?.simulationTime) {
            historicSimTimeRef.current = next.simulationTime;
            setSimulatedDateState(next.simulationTime);
          }
          return next;
        });
      }
    },
    [selectedTicker, trackedTickers, tradingTimeMode],
  );

  const resetSimulationTime = useCallback(() => {
    const symbol = selectedTicker || trackedTickers[0];
    if (!symbol) return;

    const reset = (current: TradingSimulation | null) => {
      if (!current) return current;
      const points = current.priceTimelineBySymbol[symbol] ?? [];
      if (!points.length) return current;
      return {
        ...current,
        simulationTime: points[points.length - 1].time,
      };
    };

    if (tradingTimeMode === "live") {
      setLiveSimulation(reset);
    } else {
      setHistoricSimulation((current) => {
        const next = reset(current);
        if (next?.simulationTime) {
          historicSimTimeRef.current = next.simulationTime;
          setSimulatedDateState(next.simulationTime);
        }
        return next;
      });
    }
  }, [selectedTicker, trackedTickers, tradingTimeMode]);

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

  const setTradingTimeMode = useCallback((next: TradingTimeMode) => {
    setTradingTimeModeState(next);
    if (next === "live") {
      setHistoricPlaybackPausedState(false);
      pendingHistoricStartIsoRef.current = null;
      historicChartEndIsoRef.current = null;
    } else {
      historicNewsFetchedKeyRef.current = "";
    }

    queueMicrotask(() => {
      if (!preferencesLoadedRef.current) {
        return;
      }
      const tickers = normalizeTrackedTickers(trackedTickersRef.current);
      if (!tickers.length) {
        return;
      }
      const load = loadTrackedQuotesRef.current;
      let didQuotes = false;
      if (next === "historic") {
        const playhead =
          simulatedDateRefForQuotes.current ??
          historicSimulationRef.current?.simulationTime;
        const asOf = nextHistoricBarBoundaryIso(
          playhead,
          historicBarIntervalMsRef.current,
        );
        if (asOf) {
          const key = `${historicSessionAnchorNonceRef.current}|${startDateRef.current ?? ""}|${tickers.join(",")}`;
          lastHistoricQuoteBootstrapKeyRef.current = key;
          lastHistoricMinuteQuoteFetchKeyRef.current = `${historicSessionAnchorNonceRef.current}|${tickers.join(",")}|${asOf}`;
          void load(tickers, { showLoading: true, asOf });
          didQuotes = true;
        }
      } else {
        void load(tickers, { showLoading: true });
        didQuotes = true;
      }
      if (didQuotes) {
        suppressBootstrapQuotesEffectRef.current = true;
      }
    });
  }, []);

  const beginHistoricSessionAt = useCallback((localDateInput: string) => {
    let isoStart: string;
    try {
      isoStart = localDateInputToUsMarketOpenIso(localDateInput);
    } catch {
      return;
    }
    historicNewsFetchedKeyRef.current = "";
    historicChartEndIsoRef.current = null;
    setStartDateState(isoStart);
    pendingHistoricStartIsoRef.current = isoStart;
    historicSimTimeRef.current = isoStart;
    setSimulatedDateState(isoStart);
    setHistoricSessionAnchorNonce((n) => n + 1);
  }, []);

  const setStartDate = useCallback((next: string | null) => {
    setStartDateState(next);
  }, []);

  const setSimulatedDate = useCallback((next: string | null) => {
    setSimulatedDateState(next);
  }, []);

  const setHistoricReplayWindowHours = useCallback(
    (next: HistoricReplayWindowHours) => {
      const normalized = normalizeHistoricReplayWindowHours(next);
      setHistoricReplayWindowHoursState(normalized);
      if (tradingTimeMode === "historic") {
        historicChartEndIsoRef.current = null;
        lastHistoricQuoteBootstrapKeyRef.current = "";
        lastHistoricMinuteQuoteFetchKeyRef.current = "";
      }
    },
    [tradingTimeMode],
  );

  const setSpeedMultiplier = useCallback((next: number) => {
    setSpeedMultiplierState(next);
  }, []);

  const setHistoricPlaybackPaused = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setHistoricPlaybackPausedState((current) =>
        typeof next === "function"
          ? (next as (c: boolean) => boolean)(current)
          : next,
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
      tradingTimeMode,
      startDate,
      simulatedDate,
      historicReplayWindowHours,
      speedMultiplier,
      historicPlaybackPaused,
      setTradingTimeMode,
      setStartDate,
      setSimulatedDate,
      setHistoricReplayWindowHours,
      setSpeedMultiplier,
      setHistoricPlaybackPaused,
      beginHistoricSessionAt,
      marketSnapshot,
      simulation,
      simulationSnapshot,
      advanceSimulationTime,
      resetSimulationTime,
      setTradeMode,
      setModelProfile,
      setRefreshCadence,
      setAutoTradeEnabled,
      refreshPaperAccount,
      loadTrackedQuotes,
      addTrackedTicker,
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
      tradingTimeMode,
      startDate,
      simulatedDate,
      historicReplayWindowHours,
      speedMultiplier,
      historicPlaybackPaused,
      setTradingTimeMode,
      setStartDate,
      setSimulatedDate,
      setHistoricReplayWindowHours,
      setSpeedMultiplier,
      setHistoricPlaybackPaused,
      beginHistoricSessionAt,
      marketSnapshot,
      simulation,
      simulationSnapshot,
      advanceSimulationTime,
      resetSimulationTime,
      setTradeMode,
      setModelProfile,
      setRefreshCadence,
      setAutoTradeEnabled,
      refreshPaperAccount,
      loadTrackedQuotes,
      addTrackedTicker,
      checkSelectedStocks,
      selectTrackedTicker,
      removeTrackedTicker,
      loadNewsReport,
      runAutoTrade,
      loadMockTradingDay,
      simulateOrder,
      clearPaperTradeLog,
      setLastAction,
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
