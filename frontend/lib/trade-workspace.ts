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
