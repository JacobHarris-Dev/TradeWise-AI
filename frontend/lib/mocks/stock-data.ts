/**
 * Static mock data for UI development.
 * Replace with Firestore or a market API when you wire real data.
 */

export type TradeSignal = "bullish" | "bearish" | "neutral";

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
  history?: number[];
  technicals?: QuoteTechnicals;
  chartDataUri?: string | null;
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
