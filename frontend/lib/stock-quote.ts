import type {
  AutoTradeBatchResult,
  AutoTradeResult,
  InvestmentChatResponse,
  MarketNews,
  NewsReport,
  PaperAccount,
  PaperAccountPerformance,
  RefreshCadence,
  MockQuote,
  MockTradingDay,
  ModelProfile,
  StockRecommendation,
  StockRecommendationsResponse,
  StockUniverseResolveMatch,
  StockUniverseResolveResponse,
  WatchSession,
} from "@/lib/mocks/stock-data";

async function fetchWithNetworkGuard(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Network error: could not reach the API. Start the Next dev server and ensure the ML backend is running and reachable from the proxy.",
      );
    }
    throw e;
  }
}

/**
 * Browser-facing entry point for live quote data.
 * The request goes through the same-origin Next route handler, which proxies to Python.
 */
export async function fetchStockQuote(
  ticker: string,
  options: {
    includeChart?: boolean;
    modelProfile?: ModelProfile;
    /** ISO-8601 end time for historical bars (same `/v1/quote` API as live). */
    asOf?: string;
  } = {},
): Promise<MockQuote> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker symbol.");
  }

  const params = new URLSearchParams({
    ticker: normalized,
    includeChart: options.includeChart === true ? "true" : "false",
  });
  if (options.modelProfile) {
    params.set("modelProfile", options.modelProfile);
  }
  if (options.asOf) {
    params.set("asOf", options.asOf);
  }

  const response = await fetchWithNetworkGuard(
    `/api/ml/quote?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load quote.");
  }

  return (await response.json()) as MockQuote;
}

export async function fetchStockQuotes(
  tickers: string[],
  options: {
    includeChart?: boolean;
    modelProfile?: ModelProfile;
    provider?: "yfinance" | "alpaca";
    /** ISO-8601 end time for historical bars (same `/v1/quotes` API as live). */
    asOf?: string;
  } = {},
): Promise<{
  results: MockQuote[];
  errors: Array<{ ticker: string; message: string }>;
}> {
  const normalizedTickers = Array.from(
    new Set(
      tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
    ),
  );

  if (normalizedTickers.length === 0) {
    return { results: [], errors: [] };
  }

  const params = new URLSearchParams({
    tickers: normalizedTickers.join(","),
    includeChart: options.includeChart === true ? "true" : "false",
  });
  if (options.modelProfile) {
    params.set("modelProfile", options.modelProfile);
  }
  if (options.provider) {
    params.set("provider", options.provider);
  }
  if (options.asOf) {
    params.set("asOf", options.asOf);
  }

  const response = await fetchWithNetworkGuard(
    `/api/ml/quotes?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load quotes.");
  }

  return (await response.json()) as {
    results: MockQuote[];
    errors: Array<{ ticker: string; message: string }>;
  };
}

export async function fetchStockRecommendations(
  sectors: string[],
  options: { count?: number } = {},
): Promise<StockRecommendation[]> {
  const normalizedSectors = Array.from(
    new Set(
      sectors
        .map((sector) => sector.trim())
        .filter(Boolean),
    ),
  );

  if (!normalizedSectors.length) {
    throw new Error("Select at least one sector.");
  }

  const params = new URLSearchParams({
    sectors: normalizedSectors.join(","),
  });
  if (typeof options.count === "number" && Number.isFinite(options.count)) {
    params.set("count", String(Math.max(1, Math.floor(options.count))));
  }

  const response = await fetch(
    `/api/ml/stock-universe/recommendations?${params.toString()}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load stock recommendations.");
  }

  return ((await response.json()) as StockRecommendationsResponse).results;
}

export async function resolveStockUniverseQuery(
  query: string,
  options: { count?: number } = {},
): Promise<StockUniverseResolveMatch[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const params = new URLSearchParams({ query: normalizedQuery });
  if (typeof options.count === "number" && Number.isFinite(options.count)) {
    params.set("count", String(Math.max(1, Math.floor(options.count))));
  }

  const response = await fetch(
    `/api/ml/stock-universe/resolve?${params.toString()}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not resolve stock symbols from that prompt.");
  }

  return ((await response.json()) as StockUniverseResolveResponse).results;
}

export async function fetchMockTradingDay(
  ticker: string,
  options: {
    modelProfile?: ModelProfile;
    steps?: number;
  } = {},
): Promise<MockTradingDay> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker symbol.");
  }

  const params = new URLSearchParams({
    ticker: normalized,
  });
  if (options.modelProfile) {
    params.set("modelProfile", options.modelProfile);
  }
  if (typeof options.steps === "number") {
    params.set("steps", String(options.steps));
  }

  const response = await fetch(`/api/ml/mock-day?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load mock trading day.");
  }

  return (await response.json()) as MockTradingDay;
}

export async function executeAutoTrade(
  ticker: string,
  options: {
    modelProfile?: ModelProfile;
    cadence?: RefreshCadence;
    userId?: string;
    requestedSide?: "buy" | "sell";
    quantity?: number;
  } = {},
): Promise<AutoTradeResult> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker symbol.");
  }

  const response = await fetch("/api/ml/auto-trade", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      ticker: normalized,
      modelProfile: options.modelProfile ?? "risky",
      cadence: options.cadence ?? "1m",
      userId: options.userId ?? "guest",
      ...(options.requestedSide ? { requestedSide: options.requestedSide } : {}),
      ...(typeof options.quantity === "number" ? { quantity: options.quantity } : {}),
    }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not execute paper auto-trade.");
  }

  return (await response.json()) as AutoTradeResult;
}

export async function executeAutoTradeBatch(
  tickers: string[],
  options: {
    modelProfile?: ModelProfile;
    cadence?: RefreshCadence;
    userId?: string;
  } = {},
): Promise<AutoTradeResult[]> {
  const normalizedTickers = Array.from(
    new Set(
      tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
    ),
  );
  if (!normalizedTickers.length) {
    throw new Error("Enter at least one ticker symbol.");
  }

  const response = await fetch("/api/ml/auto-trade/batch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      tickers: normalizedTickers,
      modelProfile: options.modelProfile ?? "risky",
      cadence: options.cadence ?? "1m",
      userId: options.userId ?? "guest",
    }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not execute paper auto-trade.");
  }

  return ((await response.json()) as AutoTradeBatchResult).results;
}

export async function startWatchSession(
  tickers: string[],
  options: {
    modelProfile?: ModelProfile;
    cadence?: RefreshCadence;
    userId?: string;
    autoTradeEnabled?: boolean;
  } = {},
): Promise<WatchSession> {
  const normalizedTickers = Array.from(
    new Set(
      tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
    ),
  ).slice(0, 3);
  if (!normalizedTickers.length) {
    throw new Error("Load at least one ticker to start a watch session.");
  }

  const response = await fetch("/api/ml/watch/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      userId: options.userId ?? "guest",
      tickers: normalizedTickers,
      modelProfile: options.modelProfile ?? "risky",
      cadence: options.cadence ?? "1m",
      autoTradeEnabled: options.autoTradeEnabled ?? false,
    }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not start watch session.");
  }

  return (await response.json()) as WatchSession;
}

export async function fetchWatchSession(userId?: string): Promise<WatchSession> {
  const params = new URLSearchParams();
  if (userId?.trim()) {
    params.set("userId", userId.trim());
  }
  const query = params.toString();
  const url = query ? `/api/ml/watch?${query}` : "/api/ml/watch";
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load watch session.");
  }

  return (await response.json()) as WatchSession;
}

export async function fetchPaperAccount(userId?: string): Promise<PaperAccount> {
  const params = new URLSearchParams();
  if (userId?.trim()) {
    params.set("userId", userId.trim());
  }
  const query = params.toString();
  const url = query ? `/api/ml/paper-account?${query}` : "/api/ml/paper-account";

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load paper account.");
  }

  return (await response.json()) as PaperAccount;
}

export async function fetchPaperAccountPerformance(
  userId?: string,
  options: {
    includeCoach?: boolean;
    forceCoachRefresh?: boolean;
  } = {},
): Promise<PaperAccountPerformance> {
  const params = new URLSearchParams();
  if (userId?.trim()) {
    params.set("userId", userId.trim());
  }
  if (options.includeCoach) {
    params.set("includeCoach", "true");
  }
  if (options.forceCoachRefresh) {
    params.set("forceCoachRefresh", "true");
  }
  const query = params.toString();
  const url = query
    ? `/api/ml/paper-account/performance?${query}`
    : "/api/ml/paper-account/performance";

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load paper account performance.");
  }

  return (await response.json()) as PaperAccountPerformance;
}

export async function fetchNewsReport(
  ticker: string,
  options: {
    modelProfile?: ModelProfile;
    refreshSeconds?: number;
    forceRefresh?: boolean;
    /** ISO-8601 simulated time; pins headline window to that UTC calendar day (same `/v1/news-report` route). */
    asOf?: string;
  } = {},
): Promise<NewsReport> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker symbol.");
  }

  const params = new URLSearchParams({ ticker: normalized });
  if (options.modelProfile) {
    params.set("modelProfile", options.modelProfile);
  }
  if (typeof options.refreshSeconds === "number" && Number.isFinite(options.refreshSeconds)) {
    params.set("refreshSeconds", String(Math.max(0, Math.floor(options.refreshSeconds))));
  }
  if (options.forceRefresh) {
    params.set("forceRefresh", "true");
  }
  if (options.asOf) {
    params.set("asOf", options.asOf);
  }

  const response = await fetch(`/api/ml/news-report?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load news report.");
  }

  return (await response.json()) as NewsReport;
}

export async function fetchNewsReportReasoningOnly(
  ticker: string,
  options: {
    refreshSeconds?: number;
    forceRefresh?: boolean;
  } = {},
): Promise<{
  ticker: string;
  reasoning: string;
  reasoningSource: string;
  recommendedAction: string;
  sentiment: string | null;
  topics: string[];
  headlines: string[];
  articleCount: number;
}> {
  /**
   * Fast lightweight endpoint that returns LLM reasoning immediately.
   *
   * Prioritizes showing the AI answer first by:
   * - Using only fast news API call (headlines, topics, sentiment)
   * - Generating reasoning with default/neutral technicals
   * - Skipping expensive quote/technicals fetch
   *
   * Typical response time: 100-500ms vs 2-5s for full report
   *
   * Use this when you want to show AI reasoning immediately,
   * then fetch full quote data separately in parallel.
   */
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker symbol.");
  }

  const params = new URLSearchParams({ ticker: normalized });
  if (typeof options.refreshSeconds === "number" && Number.isFinite(options.refreshSeconds)) {
    params.set("refreshSeconds", String(Math.max(0, Math.floor(options.refreshSeconds))));
  }
  if (options.forceRefresh) {
    params.set("forceRefresh", "true");
  }

  const response = await fetch(`/api/ml/news-report/reasoning?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load reasoning.");
  }

  return (await response.json()) as {
    ticker: string;
    reasoning: string;
    reasoningSource: string;
    recommendedAction: string;
    sentiment: string | null;
    topics: string[];
    headlines: string[];
    articleCount: number;
  };
}

export async function fetchNewsReportFast(
  ticker: string,
  options: {
    modelProfile?: ModelProfile;
    refreshSeconds?: number;
    forceRefresh?: boolean;
    asOf?: string;
  } = {},
): Promise<{
  reasoning: {
    ticker: string;
    reasoning: string;
    reasoningSource: string;
    recommendedAction: string;
    sentiment: string | null;
  };
  fullReport: NewsReport;
}> {
  /**
   * Optimize for perceived performance by fetching reasoning first.
   *
   * Parallel strategy:
   * 1. Immediately fetch lightweight reasoning (returns ~100-500ms)
   * 2. In parallel, fetch full report with quote data
   * 3. Return both so UI can show reasoning first, then update with full data
   *
   * This gives users the AI answer immediately while stock data loads.
   */
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker symbol.");
  }

  // Start both requests in parallel
  const [reasoning, fullReport] = await Promise.all([
    fetchNewsReportReasoningOnly(ticker, {
      refreshSeconds: options.refreshSeconds,
      forceRefresh: options.forceRefresh,
    }),
    fetchNewsReport(ticker, options),
  ]);

  return {
    reasoning: {
      ticker: reasoning.ticker,
      reasoning: reasoning.reasoning,
      reasoningSource: reasoning.reasoningSource,
      recommendedAction: reasoning.recommendedAction,
      sentiment: reasoning.sentiment,
    },
    fullReport,
  };
}

export async function fetchMarketNews(options: {
  limit?: number;
  refreshSeconds?: number;
  forceRefresh?: boolean;
} = {}): Promise<MarketNews> {
  const params = new URLSearchParams();
  if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(Math.max(1, Math.floor(options.limit))));
  }
  if (
    typeof options.refreshSeconds === "number" &&
    Number.isFinite(options.refreshSeconds)
  ) {
    params.set(
      "refreshSeconds",
      String(Math.max(0, Math.floor(options.refreshSeconds))),
    );
  }
  if (options.forceRefresh) {
    params.set("forceRefresh", "true");
  }

  const query = params.toString();
  const url = query ? `/api/ml/market-news?${query}` : "/api/ml/market-news";
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load market news.");
  }

  return (await response.json()) as MarketNews;
}

export async function fetchInvestmentChatResponse(payload: {
  prompt: string;
  modelProfile: ModelProfile;
  sectors: string[];
  trackedTickers: string[];
}): Promise<InvestmentChatResponse> {
  const response = await fetch("/api/ml/investment-chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not generate AI investment response.");
  }

  return (await response.json()) as InvestmentChatResponse;
}

async function readErrorMessage(response: Response) {
  const bodyText = await response.text();
  try {
    const parsed = JSON.parse(bodyText) as { error?: string; detail?: string };
    return parsed.error ?? parsed.detail ?? bodyText;
  } catch {
    return bodyText;
  }
}
