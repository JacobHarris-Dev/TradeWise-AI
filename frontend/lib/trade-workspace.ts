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
  preferredSectors: "tradewise.preferredSectors",
  workspace: "tradewise.tradeWorkspace",
} as const;

export const MAX_TRACKED_TICKERS = 3;
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

function buildTimelineFromQuote(quote: MockQuote, now: Date): SimulationPricePoint[] {
  const history = quote.history?.length ? quote.history : [quote.lastPrice];
  const endMs = now.getTime();
  const points: SimulationPricePoint[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const offset = history.length - index - 1;
    const time = new Date(endMs - offset * 60_000).toISOString();
    points.push({
      time,
      price: Number(history[index]?.toFixed?.(4) ?? history[index]),
    });
  }
  return points;
}

function latestPoint(points: SimulationPricePoint[]): SimulationPricePoint | null {
  return points.length ? points[points.length - 1] : null;
}

export function createSimulationFromQuotes(
  quotesByTicker: Record<string, MockQuote>,
  now: Date,
  selectedTicker?: string,
): TradingSimulation {
  const priceTimelineBySymbol: Record<string, SimulationPricePoint[]> = {};
  for (const quote of Object.values(quotesByTicker)) {
    priceTimelineBySymbol[quote.ticker] = buildTimelineFromQuote(quote, now);
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

  let resolved = points[0];
  for (const point of points) {
    if (point.time <= simulationTime) {
      resolved = point;
      continue;
    }
    break;
  }
  return resolved.price;
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
