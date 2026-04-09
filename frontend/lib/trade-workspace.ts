import type {
  AutoTradeResult,
  MockQuote,
  NewsReport,
  PaperAccount,
  ModelProfile,
  RefreshCadence,
} from "@/lib/mocks/stock-data";

export const TRADE_STORAGE_KEYS = {
  tradeMode: "tradewise.tradeMode",
  trackedTickers: "tradewise.trackedTickers",
  modelProfile: "tradewise.modelProfile",
  refreshCadence: "tradewise.refreshCadence",
  autoTradeEnabled: "tradewise.autoTradeEnabled",
  historicReplayWindowHours: "tradewise.historicReplayWindowHours",
  preferredSectors: "tradewise.preferredSectors",
  workspace: "tradewise.tradeWorkspace",
} as const;

export const MAX_TRACKED_TICKERS = 3;
export const HISTORIC_REPLAY_WINDOW_HOURS = [3, 6, 12] as const;
export const SECTOR_OPTIONS = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Energy",
  "Consumer Defensive",
  "Consumer Cyclical",
  "ETF",
] as const;
export const TRADE_WORKSPACE_TTL_MS = 90_000;

export type TradeMode = "manual" | "model";
export type HistoricReplayWindowHours =
  (typeof HISTORIC_REPLAY_WINDOW_HOURS)[number];

/** Historic = trade against a fixed start window with simulated clock; live = real-time behavior. */
export type TradingTimeMode = "historic" | "live";

const DEFAULT_HISTORIC_REPLAY_WINDOW_HOURS: HistoricReplayWindowHours = 6;

/**
 * Parse `YYYY-MM-DD` from `<input type="date">` into ISO for local start-of-day (midnight).
 */
export function localDateInputToIsoStartOfDay(dateInput: string): string {
  const parts = dateInput.split("-");
  if (parts.length !== 3) {
    throw new Error("Invalid date format.");
  }
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    throw new Error("Invalid date.");
  }
  const local = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (
    local.getFullYear() !== y ||
    local.getMonth() !== m - 1 ||
    local.getDate() !== d
  ) {
    throw new Error("Invalid calendar date.");
  }
  return local.toISOString();
}

const NY_MARKET_TZ = "America/New_York";

/**
 * Regular-session open (9:30 AM) on `YYYY-MM-DD` interpreted as a **New York calendar date**
 * (NYSE session day), returned as ISO UTC.
 */
export function localDateInputToUsMarketOpenIso(dateInput: string): string {
  const parts = dateInput.split("-");
  if (parts.length !== 3) {
    throw new Error("Invalid date format.");
  }
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) {
    throw new Error("Invalid date.");
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_MARKET_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const lo = Date.UTC(y, mo - 1, d - 1, 0, 0, 0, 0);
  const hi = Date.UTC(y, mo - 1, d + 2, 0, 0, 0, 0);

  for (let ms = lo; ms <= hi; ms += 60_000) {
    const got = formatter.formatToParts(new Date(ms));
    const gv = (type: Intl.DateTimeFormatPartTypes) =>
      Number(got.find((p) => p.type === type)?.value ?? NaN);
    if (
      gv("year") === y &&
      gv("month") === mo &&
      gv("day") === d &&
      gv("hour") === 9 &&
      gv("minute") === 30
    ) {
      return new Date(ms).toISOString();
    }
  }

  throw new Error("Could not resolve US market open for date.");
}

/** `min` / `max` strings for `<input type="date">` (local calendar), spanning the last 10 years through today. */
export function historicDateInputBounds(): { min: string; max: string } {
  const max = new Date();
  max.setHours(12, 0, 0, 0);
  const min = new Date(max);
  min.setFullYear(min.getFullYear() - 10);
  const fmt = (dt: Date) => {
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  return { min: fmt(min), max: fmt(max) };
}

/** Local calendar `YYYY-MM-DD` for an ISO timestamp (for `<input type="date">`). */
export function isoTimestampToLocalDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export type SimulationTradeType = "buy" | "sell";

export type SimulationPricePoint = {
  time: string;
  price: number;
};

export type SimulationPosition = {
  symbol: string;
  shares: number;
};

export type TradingSimulationTrade = {
  symbol: string;
  shares: number;
  price: number;
  type: SimulationTradeType;
  timestamp: string;
};

export type TradingSimulation = {
  simulationTime: string;
  cash: number;
  positions: Record<string, number>;
  trades: TradingSimulationTrade[];
  priceTimelineBySymbol: Record<string, SimulationPricePoint[]>;
};

export type SimulationSnapshotPosition = {
  symbol: string;
  shares: number;
  price: number;
  value: number;
};

export type SimulationSnapshot = {
  time: string;
  portfolioValue: number;
  cash: number;
  positions: SimulationSnapshotPosition[];
  currentPrices: Record<string, number>;
};

export type TradeWorkspaceSnapshot = {
  savedAt: number;
  trackedTickers: string[];
  selectedTicker: string;
  quotesByTicker: Record<string, MockQuote>;
  newsReportsByTicker: Record<string, NewsReport>;
  paperAccount: PaperAccount | null;
  autoTradeResult: AutoTradeResult | null;
  lastAction: string | null;
};

let tradeWorkspaceMemoryCache: TradeWorkspaceSnapshot | null = null;

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

export function readStoredString(key: string): string | null {
  if (!canUseBrowserStorage()) {
    return null;
  }
  return window.localStorage.getItem(key);
}

export function writeStoredString(key: string, value: string) {
  if (!canUseBrowserStorage()) {
    return;
  }
  window.localStorage.setItem(key, value);
}

export function writeStoredJson(key: string, value: unknown) {
  writeStoredString(key, JSON.stringify(value));
}

export function readStoredJson<T>(key: string): T | null {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeTradeWorkspace(snapshot: TradeWorkspaceSnapshot | null) {
  tradeWorkspaceMemoryCache = snapshot;
  if (!canUseBrowserStorage()) {
    return;
  }

  if (snapshot) {
    window.sessionStorage.setItem(
      TRADE_STORAGE_KEYS.workspace,
      JSON.stringify(snapshot),
    );
    return;
  }

  window.sessionStorage.removeItem(TRADE_STORAGE_KEYS.workspace);
}

export function readTradeWorkspace(): TradeWorkspaceSnapshot | null {
  if (tradeWorkspaceMemoryCache) {
    return tradeWorkspaceMemoryCache;
  }

  if (!canUseBrowserStorage()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(TRADE_STORAGE_KEYS.workspace);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as TradeWorkspaceSnapshot;
    tradeWorkspaceMemoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function isTradeWorkspaceFresh(snapshot: TradeWorkspaceSnapshot | null) {
  if (!snapshot) {
    return false;
  }
  return Date.now() - snapshot.savedAt <= TRADE_WORKSPACE_TTL_MS;
}

export function buildQuoteMap(quotes: MockQuote[]) {
  const next: Record<string, MockQuote> = {};
  for (const quote of quotes) {
    next[quote.ticker] = quote;
  }
  return next;
}

export function readStoredModelProfile(): ModelProfile {
  const stored = readStoredString(TRADE_STORAGE_KEYS.modelProfile);
  if (stored === "safe" || stored === "neutral" || stored === "risky") {
    return stored;
  }
  return "neutral";
}

export function readStoredRefreshCadence(): RefreshCadence {
  const stored = readStoredString(TRADE_STORAGE_KEYS.refreshCadence);
  if (stored === "1m" || stored === "5m" || stored === "15m") {
    return stored;
  }
  return "1m";
}

export function readStoredTradeMode(): TradeMode {
  const stored = readStoredString(TRADE_STORAGE_KEYS.tradeMode);
  if (stored === "manual" || stored === "model") {
    return stored;
  }
  return "manual";
}

export function normalizeHistoricReplayWindowHours(
  value: number | string | null | undefined,
): HistoricReplayWindowHours {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return HISTORIC_REPLAY_WINDOW_HOURS.includes(
    parsed as HistoricReplayWindowHours,
  )
    ? (parsed as HistoricReplayWindowHours)
    : DEFAULT_HISTORIC_REPLAY_WINDOW_HOURS;
}

export function readStoredHistoricReplayWindowHours(): HistoricReplayWindowHours {
  const stored = readStoredString(TRADE_STORAGE_KEYS.historicReplayWindowHours);
  return normalizeHistoricReplayWindowHours(stored);
}

const MAX_SYNTHETIC_TIMELINE_POINTS = 480;

function parseQuoteIntervalMs(interval?: string | null): number | null {
  if (!interval) {
    return null;
  }
  const match = interval.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const unit = match[2];
  if (unit === "m") {
    return amount * 60_000;
  }
  if (unit === "h") {
    return amount * 60 * 60_000;
  }
  return amount * 24 * 60 * 60_000;
}

function trimTimelineToWindow(
  points: SimulationPricePoint[],
  endMs: number,
  targetWindowMs: number,
): SimulationPricePoint[] {
  if (points.length < 2) {
    return points;
  }

  const windowStartMs = endMs - targetWindowMs;
  const firstMs = new Date(points[0].time).getTime();
  if (Number.isNaN(firstMs) || firstMs >= windowStartMs) {
    return points;
  }

  let sliceStart = 0;
  while (sliceStart < points.length) {
    const pointMs = new Date(points[sliceStart].time).getTime();
    if (Number.isNaN(pointMs) || pointMs >= windowStartMs) {
      break;
    }
    sliceStart += 1;
  }

  if (sliceStart <= 0 || sliceStart >= points.length) {
    return points.slice(-2);
  }

  const previous = points[sliceStart - 1];
  const next = points[sliceStart];
  const previousMs = new Date(previous.time).getTime();
  const nextMs = new Date(next.time).getTime();
  if (
    Number.isNaN(previousMs) ||
    Number.isNaN(nextMs) ||
    nextMs <= previousMs ||
    windowStartMs <= previousMs
  ) {
    return points.slice(sliceStart);
  }

  const ratio = (windowStartMs - previousMs) / (nextMs - previousMs);
  const boundaryPrice = previous.price + (next.price - previous.price) * ratio;
  return [
    {
      time: new Date(windowStartMs).toISOString(),
      price: Number(boundaryPrice.toFixed(4)),
    },
    ...points.slice(sliceStart),
  ];
}

function buildTimelineFromQuote(
  quote: MockQuote,
  now: Date,
  timelineWindowHours: HistoricReplayWindowHours = DEFAULT_HISTORIC_REPLAY_WINDOW_HOURS,
): SimulationPricePoint[] {
  const history = quote.history?.length ? quote.history : [quote.lastPrice];
  const endMs = now.getTime();
  const intervalMs = parseQuoteIntervalMs(quote.marketDataInterval) ?? 60_000;
  const targetWindowMs = Math.max(
    intervalMs * 2,
    timelineWindowHours * 60 * 60 * 1000,
  );
  const points: SimulationPricePoint[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const offset = history.length - index - 1;
    const time = new Date(endMs - offset * intervalMs).toISOString();
    points.push({
      time,
      price: Number(history[index]?.toFixed?.(4) ?? history[index]),
    });
  }
  if (points.length === 1) {
    points.unshift({
      time: new Date(endMs - intervalMs).toISOString(),
      price: points[0].price,
    });
  }
  const boundedPoints = trimTimelineToWindow(points, endMs, targetWindowMs);
  let spanMs = endMs - new Date(boundedPoints[0].time).getTime();
  while (
    spanMs < targetWindowMs &&
    boundedPoints.length < MAX_SYNTHETIC_TIMELINE_POINTS
  ) {
    const first = boundedPoints[0];
    const nextTime = new Date(
      new Date(first.time).getTime() - intervalMs,
    ).toISOString();
    boundedPoints.unshift({ time: nextTime, price: first.price });
    spanMs = endMs - new Date(boundedPoints[0].time).getTime();
  }
  return boundedPoints;
}

function latestPoint(points: SimulationPricePoint[]): SimulationPricePoint | null {
  return points.length ? points[points.length - 1] : null;
}

export function createSimulationFromQuotes(
  quotesByTicker: Record<string, MockQuote>,
  now: Date,
  selectedTicker?: string,
  options: {
    timelineWindowHours?: HistoricReplayWindowHours;
  } = {},
): TradingSimulation {
  const priceTimelineBySymbol: Record<string, SimulationPricePoint[]> = {};
  const timelineWindowHours = normalizeHistoricReplayWindowHours(
    options.timelineWindowHours,
  );
  for (const quote of Object.values(quotesByTicker)) {
    priceTimelineBySymbol[quote.ticker] = buildTimelineFromQuote(
      quote,
      now,
      timelineWindowHours,
    );
  }

  const selectedPoints =
    (selectedTicker && priceTimelineBySymbol[selectedTicker]) ||
    Object.values(priceTimelineBySymbol)[0] ||
    [];
  const initialTime =
    latestPoint(selectedPoints)?.time ?? now.toISOString();

  return {
    simulationTime: initialTime,
    cash: 10_000,
    positions: {},
    trades: [],
    priceTimelineBySymbol,
  };
}

export function getPriceAtTime(
  symbol: string,
  simulationTime: string,
  simulation: TradingSimulation,
): number {
  const points = simulation.priceTimelineBySymbol[symbol];
  if (!points?.length) {
    throw new Error(`No price timeline for ${symbol}.`);
  }

  const targetMs = new Date(simulationTime).getTime();
  if (Number.isNaN(targetMs) || points.length === 1) {
    return points[points.length - 1].price;
  }

  const firstMs = new Date(points[0].time).getTime();
  if (!Number.isNaN(firstMs) && targetMs <= firstMs) {
    return points[0].price;
  }

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    const nextMs = new Date(next.time).getTime();
    if (Number.isNaN(nextMs)) {
      continue;
    }
    if (targetMs > nextMs) {
      continue;
    }

    const previous = points[index - 1] ?? next;
    const previousMs = new Date(previous.time).getTime();
    if (
      Number.isNaN(previousMs) ||
      targetMs <= previousMs ||
      nextMs <= previousMs
    ) {
      return previous.price;
    }

    const ratio = (targetMs - previousMs) / (nextMs - previousMs);
    return Number(
      (previous.price + (next.price - previous.price) * ratio).toFixed(4),
    );
  }

  return points[points.length - 1].price;
}

export function executeTrade(
  simulation: TradingSimulation,
  symbol: string,
  shares: number,
  type: SimulationTradeType,
): TradingSimulation {
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new Error("Shares must be greater than zero.");
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new Error("Symbol is required.");
  }

  // Always resolve price from simulation time, never wall-clock/live price.
  const price = getPriceAtTime(
    normalizedSymbol,
    simulation.simulationTime,
    simulation,
  );
  const cost = price * shares;
  const currentShares = simulation.positions[normalizedSymbol] ?? 0;

  let nextCash = simulation.cash;
  let nextShares = currentShares;

  if (type === "buy") {
    if (cost > simulation.cash) {
      throw new Error("Not enough cash to complete buy.");
    }
    nextCash -= cost;
    nextShares += shares;
  } else {
    if (shares > currentShares) {
      throw new Error("Not enough shares to complete sell.");
    }
    nextCash += cost;
    nextShares -= shares;
  }

  const nextPositions = { ...simulation.positions };
  if (nextShares <= 0) {
    delete nextPositions[normalizedSymbol];
  } else {
    nextPositions[normalizedSymbol] = nextShares;
  }

  return {
    ...simulation,
    cash: Number(nextCash.toFixed(2)),
    positions: nextPositions,
    trades: [
      ...simulation.trades,
      {
        symbol: normalizedSymbol,
        shares,
        price,
        type,
        timestamp: simulation.simulationTime,
      },
    ],
  };
}

export function getSimulationSnapshot(
  simulation: TradingSimulation,
): SimulationSnapshot {
  const currentPrices: Record<string, number> = {};
  for (const symbol of Object.keys(simulation.priceTimelineBySymbol)) {
    currentPrices[symbol] = getPriceAtTime(
      symbol,
      simulation.simulationTime,
      simulation,
    );
  }

  const positions = Object.entries(simulation.positions).map(
    ([symbol, shares]) => {
      const price = currentPrices[symbol] ?? 0;
      const value = Number((price * shares).toFixed(2));
      return { symbol, shares, price, value };
    },
  );
  const positionsValue = positions.reduce((sum, item) => sum + item.value, 0);
  const portfolioValue = Number((simulation.cash + positionsValue).toFixed(2));

  return {
    time: simulation.simulationTime,
    portfolioValue,
    cash: Number(simulation.cash.toFixed(2)),
    positions,
    currentPrices,
  };
}

export function shiftSimulationTime(
  simulation: TradingSimulation,
  selectedSymbol: string,
  deltaSteps: number,
): TradingSimulation {
  const points =
    simulation.priceTimelineBySymbol[selectedSymbol] ??
    Object.values(simulation.priceTimelineBySymbol)[0] ??
    [];
  if (!points.length) {
    return simulation;
  }

  const currentIndex = Math.max(
    0,
    points.findIndex((point) => point.time >= simulation.simulationTime),
  );
  const nextIndex = Math.min(
    points.length - 1,
    Math.max(0, currentIndex + deltaSteps),
  );
  return {
    ...simulation,
    simulationTime: points[nextIndex].time,
  };
}

/** Wall-clock bounds for advancing simulated time (first/last bar in the timeline). */
export function getSimulationTimelineBounds(
  simulation: TradingSimulation,
  selectedSymbol: string,
): { minMs: number; maxMs: number } | null {
  const points =
    simulation.priceTimelineBySymbol[selectedSymbol] ??
    Object.values(simulation.priceTimelineBySymbol)[0] ??
    [];
  if (!points.length) {
    return null;
  }
  return {
    minMs: new Date(points[0].time).getTime(),
    maxMs: new Date(points[points.length - 1].time).getTime(),
  };
}
