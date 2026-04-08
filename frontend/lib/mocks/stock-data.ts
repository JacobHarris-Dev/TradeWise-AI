/**
 * Static mock data for UI development.
 * Replace with Firestore or a market API when you wire real data.
 */

export type TradeSignal = "bullish" | "bearish" | "neutral";
export type ModelProfile = "safe" | "neutral" | "risky";
export type ChartType = "line";
export type RefreshCadence = "1m" | "5m" | "15m";
export type LiveStreamFeed = "iex" | "delayed_sip" | "sip";

export type QuoteTechnicals = {
  shortMovingAverage: number;
  longMovingAverage: number;
  volatility: number;
  momentum: number;
  discountFactor: number;
};

export type MockQuote = {
  ticker: string;
  companyName: string;
  lastPrice: number;
  changePercent: number;
  signal?: TradeSignal;
  confidence?: number;
  explanation?: string;
  modelVersion?: string;
  selectedModelProfile?: ModelProfile | null;
  selectedChartType?: ChartType;
  history?: number[];
  technicals?: QuoteTechnicals;
  chartDataUri?: string | null;
  newsSummary?: string | null;
  newsSentiment?: "positive" | "negative" | "neutral" | null;
  newsTopics?: string[];
  newsHeadlines?: string[];
};

export type StockRecommendation = {
  ticker: string;
  companyName: string;
  sector: string;
};

export type StockRecommendationsResponse = {
  sectors: string[];
  count: number;
  results: StockRecommendation[];
};

export type MockTradingAction = "buy" | "sell" | "hold";

export type MockTradingStep = {
  slot: string;
  sourceDate: string;
  price: number;
  changePercent: number;
  signal: TradeSignal;
  confidence: number;
  action: MockTradingAction;
  cash: number;
  shares: number;
  equity: number;
};

export type MockTradingSummary = {
  startingCash: number;
  startingPrice: number;
  endingCash: number;
  endingPrice: number;
  endingShares: number;
  endingEquity: number;
  returnPercent: number;
  buys: number;
  sells: number;
  holds: number;
};

export type MockTradingDay = {
  ticker: string;
  companyName: string;
  modelProfile: ModelProfile;
  modelVersion: string;
  sessionLabel: string;
  datasetSource: string;
  steps: MockTradingStep[];
  summary: MockTradingSummary;
};

export type AutoTradeResult = {
  ticker: string;
  modelProfile: ModelProfile;
  cadence: RefreshCadence;
  mode: "paper";
  userId?: string | null;
  signal: TradeSignal;
  confidence: number;
  action: "buy" | "sell" | "hold";
  submitted: boolean;
  quantity: number;
  positionBeforeShares: number;
  positionAfterShares: number;
  cashBefore?: number | null;
  cashAfter?: number | null;
  orderId?: string | null;
  statusMessage: string;
  quote: MockQuote;
};

export type AutoTradeBatchResult = {
  results: AutoTradeResult[];
};

export type WatchTradeLogEntry = {
  id: string;
  timestamp: string;
  ticker: string;
  modelProfile: ModelProfile;
  action: "buy" | "sell" | "hold";
  signal: TradeSignal;
  confidence: number;
  submitted: boolean;
  statusMessage: string;
};

export type WatchSession = {
  userId: string;
  trackedTickers: string[];
  modelProfile: ModelProfile;
  cadence: RefreshCadence;
  autoTradeEnabled: boolean;
  running: boolean;
  quotes: MockQuote[];
  lastAutoTrade: AutoTradeResult | null;
  paperTradeLog: WatchTradeLogEntry[];
  lastError: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewsReport = {
  ticker: string;
  report: string;
  studentReasoning?: string | null;
  reasoningSource?: "qwen" | "template";
  signal: TradeSignal;
  confidence: number;
  modelVersion: string;
  refreshedAt: string;
  fromCache: boolean;
  refreshSeconds: number;
  articleCount: number;
  newsSummary?: string | null;
  newsSentiment?: "positive" | "negative" | "neutral" | null;
  newsTopics: string[];
  newsHeadlines: string[];
};

export type MarketNewsArticle = {
  title: string;
  publisher?: string | null;
  link?: string | null;
  publishedAt?: string | null;
};

export type MarketNews = {
  summary?: string | null;
  sentiment: "positive" | "negative" | "neutral";
  topics: string[];
  refreshedAt: string;
  fromCache: boolean;
  refreshSeconds: number;
  articleCount: number;
  articles: MarketNewsArticle[];
};

export type InvestmentChatResponse = {
  reply: string;
  source: "qwen" | "template";
};

export type PaperAccountPosition = {
  ticker: string;
  shares: number;
  avgEntryPrice: number;
};

export type PaperAccount = {
  userId: string;
  startingCash: number;
  cash: number;
  positions: PaperAccountPosition[];
  updatedAt: string;
};

export type PaperAccountPerformancePosition = {
  ticker: string;
  companyName: string;
  shares: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  changePercent?: number | null;
};

export type PaperAccountPerformancePoint = {
  timestamp: string;
  totalEquity: number;
  cash: number;
  positionsValue: number;
};

export type PaperAccountPerformance = {
  userId: string;
  startingCash: number;
  cash: number;
  positionsValue: number;
  totalEquity: number;
  dayChange: number;
  dayChangePercent: number;
  baselineEquity: number;
  positions: PaperAccountPerformancePosition[];
  points: PaperAccountPerformancePoint[];
  updatedAt: string;
};

export type LiveTradeTick = {
  type: "trade";
  symbol: string;
  price: number;
  size?: number | null;
  timestamp: string;
  feed: LiveStreamFeed;
};

export type LiveStreamStatus = {
  type: "status";
  symbol: string;
  feed: LiveStreamFeed;
  status: string;
};

export type LiveStreamError = {
  type: "error";
  message: string;
};

/** Demo portfolio rows — swap for Firestore `holdings` (or similar) later. */
export type MockHolding = {
  ticker: string;
  shares: number;
};

export const MOCK_HOLDINGS: MockHolding[] = [
  { ticker: "AAPL", shares: 10 },
  { ticker: "MSFT", shares: 4 },
  { ticker: "VOO", shares: 25 },
];

const KNOWN_QUOTES: Record<string, MockQuote> = {
  AAPL: {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    lastPrice: 189.42,
    changePercent: 0.52,
  },
  MSFT: {
    ticker: "MSFT",
    companyName: "Microsoft Corp.",
    lastPrice: 378.91,
    changePercent: -0.21,
  },
  GOOGL: {
    ticker: "GOOGL",
    companyName: "Alphabet Inc.",
    lastPrice: 141.2,
    changePercent: 0.15,
  },
  NVDA: {
    ticker: "NVDA",
    companyName: "NVIDIA Corp.",
    lastPrice: 892.1,
    changePercent: 1.2,
  },
  VOO: {
    ticker: "VOO",
    companyName: "Vanguard S&P 500 ETF",
    lastPrice: 468.33,
    changePercent: 0.28,
  },
};

/** Lookup a quote from the in-memory table, or synthesize a generic row for any ticker. */
export function getMockStockQuote(rawTicker: string): MockQuote {
  const ticker = rawTicker.trim().toUpperCase();
  if (KNOWN_QUOTES[ticker]) return { ...KNOWN_QUOTES[ticker] };
  const seed = ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const lastPrice = Math.round((50 + (seed % 200) + seed / 100) * 100) / 100;
  return {
    ticker,
    companyName: `${ticker} (placeholder)`,
    lastPrice,
    changePercent: Math.round((seed % 17 - 8) * 10) / 100,
  };
}
