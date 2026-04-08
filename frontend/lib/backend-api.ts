export interface TradeSignal {
  ticker: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  technicalFactors: string[];
  newsContext: string;
}

export interface StockQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
  volume: number;
}

export interface NewsItem {
  title: string;
  sentiment: "BULLISH" | "NEUTRAL" | "BEARISH";
  source: string;
  date: string;
  summary: string;
}

type QuoteApiResponse = {
  ticker: string;
  lastPrice: number;
  changePercent: number;
  confidence: number;
  explanation: string;
  signal: "bullish" | "bearish" | "neutral";
  technicals?: Record<string, number>;
  newsSummary?: string | null;
};

type NewsReportApiResponse = {
  ticker: string;
  refreshedAt: string;
  newsSummary?: string | null;
  newsSentiment?: "positive" | "negative" | "neutral" | null;
  newsHeadlines?: string[];
};

function mapSignalLabel(signal: QuoteApiResponse["signal"]): TradeSignal["signal"] {
  if (signal === "bullish") {
    return "BUY";
  }
  if (signal === "bearish") {
    return "SELL";
  }
  return "HOLD";
}

function mapSentimentLabel(
  sentiment: NewsReportApiResponse["newsSentiment"],
): NewsItem["sentiment"] {
  if (sentiment === "positive") {
    return "BULLISH";
  }
  if (sentiment === "negative") {
    return "BEARISH";
  }
  return "NEUTRAL";
}

/**
 * Fetch a stock quote with AI analysis
 */
export async function fetchStockQuote(ticker: string): Promise<StockQuote> {
  const response = await fetch(`/api/ml/quote?ticker=${ticker}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Failed to fetch quote for ${ticker}`);
  const data = (await response.json()) as QuoteApiResponse;
  const change = data.lastPrice * (data.changePercent / 100);

  return {
    ticker: data.ticker,
    price: data.lastPrice,
    change,
    changePercent: data.changePercent,
    timestamp: new Date().toISOString(),
    volume: 0,
  };
}

/**
 * Get AI trade signal for a stock
 */
export async function fetchTradeSignal(ticker: string): Promise<TradeSignal> {
  const response = await fetch(`/api/ml/quote?ticker=${ticker}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Failed to fetch signal for ${ticker}`);
  const data = (await response.json()) as QuoteApiResponse;
  const technicalFactors = Object.entries(data.technicals ?? {}).map(
    ([label, value]) => `${label}: ${value.toFixed(2)}`,
  );

  return {
    ticker: data.ticker,
    signal: mapSignalLabel(data.signal),
    confidence: data.confidence / 100,
    reasoning: data.explanation,
    technicalFactors,
    newsContext: data.newsSummary ?? "",
  };
}

/**
 * Get news context for a stock
 */
export async function fetchNewsContext(ticker: string): Promise<NewsItem[]> {
  const response = await fetch(`/api/ml/news-report?ticker=${ticker}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Failed to fetch news for ${ticker}`);
  const data = (await response.json()) as NewsReportApiResponse;

  return (data.newsHeadlines ?? []).map((title) => ({
    title,
    sentiment: mapSentimentLabel(data.newsSentiment),
    source: "TradeWise News",
    date: data.refreshedAt,
    summary: data.newsSummary ?? "",
  }));
}

/**
 * Health check for backend availability
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch("/api/ml/health", {
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Execute a mock trade with backend simulation
 */
export async function executeMockTrade(
  ticker: string,
  side: "BUY" | "SELL",
  quantity: number
): Promise<{ success: boolean; orderId: string; message: string }> {
  const response = await fetch("/api/ml/auto-trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker,
      modelProfile: "neutral",
      cadence: "1m",
      userId: "guest",
      requestedSide: side,
      quantity,
    }),
  });
  if (!response.ok) throw new Error("Failed to execute mock trade");
  const data = (await response.json()) as {
    orderId?: string | null;
    statusMessage: string;
  };
  return {
    success: true,
    orderId: data.orderId ?? "mock-trade",
    message: data.statusMessage,
  };
}

/**
 * Get paper trading account status
 */
export async function getPaperAccount(): Promise<{
  accountValue: number;
  buyingPower: number;
  positions: Array<{ ticker: string; quantity: number; avgPrice: number }>;
}> {
  const response = await fetch("/api/ml/paper-account", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to fetch paper account");
  const data = (await response.json()) as {
    cash: number;
    positions: Array<{ ticker: string; shares: number; avgEntryPrice: number }>;
  };

  return {
    accountValue: data.cash,
    buyingPower: data.cash,
    positions: data.positions.map((position) => ({
      ticker: position.ticker,
      quantity: position.shares,
      avgPrice: position.avgEntryPrice,
    })),
  };
}

/**
 * Get recommended stocks based on sectors
 */
export async function getStockRecommendations(sectors: string[]): Promise<
  Array<{
    ticker: string;
    name: string;
    sector: string;
    reason: string;
  }>
> {
  const query = new URLSearchParams({ sectors: sectors.join(",") });
  const response = await fetch(
    `/api/ml/stock-universe/recommendations?${query.toString()}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Failed to fetch recommendations");
  const data = (await response.json()) as {
    results: Array<{
      ticker: string;
      companyName: string;
      sector: string;
    }>;
  };

  return data.results.map((result) => ({
    ticker: result.ticker,
    name: result.companyName,
    sector: result.sector,
    reason: `Selected from ${result.sector}.`,
  }));
}
