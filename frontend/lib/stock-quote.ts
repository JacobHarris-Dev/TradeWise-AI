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

type ReusableResponseCacheEntry = {
  payload: unknown;
  expiresAt: number;
};

const inFlightRequestCache = new Map<string, Promise<unknown>>();
const reusableResponseCache = new Map<string, ReusableResponseCacheEntry>();

function cleanupReusableResponseCache(nowMs: number) {
  for (const [key, entry] of reusableResponseCache.entries()) {
    if (entry.expiresAt <= nowMs) {
      reusableResponseCache.delete(key);
    }
  }
}

function buildRequestCacheKey(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const url = typeof input === "string" ? input : input.toString();
  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body == null
        ? ""
        : "[non-string-body]";
  return `${method} ${url} ${body}`;
}

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

async function requestJsonWithCoalescing<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: { reuseWindowMs?: number } = {},
): Promise<T> {
  const requestKey = buildRequestCacheKey(input, init);
  const nowMs = Date.now();
  cleanupReusableResponseCache(nowMs);

  const reuseWindowMs = Math.max(0, options.reuseWindowMs ?? 0);
  if (reuseWindowMs > 0) {
    const cached = reusableResponseCache.get(requestKey);
    if (cached && cached.expiresAt > nowMs) {
      return cached.payload as T;
    }
  }

  const inFlight = inFlightRequestCache.get(requestKey);
  if (inFlight) {
    return (await inFlight) as T;
  }

  const requestPromise = (async () => {
    const response = await fetchWithNetworkGuard(input, init);
    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message || "Request failed.");
    }
    const payload = (await response.json()) as T;
    if (reuseWindowMs > 0) {
      reusableResponseCache.set(requestKey, {
        payload,
        expiresAt: Date.now() + reuseWindowMs,
      });
    }
    return payload;
  })();

  inFlightRequestCache.set(requestKey, requestPromise as Promise<unknown>);
  try {
    return await requestPromise;
  } finally {
    inFlightRequestCache.delete(requestKey);
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

  return requestJsonWithCoalescing<MockQuote>(
    `/api/ml/quote?${params.toString()}`,
    { cache: "no-store" },
    { reuseWindowMs: 1_000 },
  );
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

  return requestJsonWithCoalescing<{
    results: MockQuote[];
    errors: Array<{ ticker: string; message: string }>;
  }>(
    `/api/ml/quotes?${params.toString()}`,
    { cache: "no-store" },
    // Quote requests are the hottest startup path; short response reuse smooths bursty mounts.
    { reuseWindowMs: 2_000 },
  );
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
  return requestJsonWithCoalescing<WatchSession>(
    url,
    { cache: "no-store" },
    { reuseWindowMs: 2_000 },
  );
}

export async function fetchPaperAccount(userId?: string): Promise<PaperAccount> {
  const params = new URLSearchParams();
  if (userId?.trim()) {
    params.set("userId", userId.trim());
  }
  const query = params.toString();
  const url = query ? `/api/ml/paper-account?${query}` : "/api/ml/paper-account";

  return requestJsonWithCoalescing<PaperAccount>(
    url,
    { cache: "no-store" },
    { reuseWindowMs: 2_000 },
  );
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

  return requestJsonWithCoalescing<PaperAccountPerformance>(
    url,
    { cache: "no-store" },
    { reuseWindowMs: 2_000 },
  );
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

  return requestJsonWithCoalescing<NewsReport>(
    `/api/ml/news-report?${params.toString()}`,
    { cache: "no-store" },
    { reuseWindowMs: 2_000 },
  );
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
  return requestJsonWithCoalescing<MarketNews>(
    url,
    { cache: "no-store" },
    { reuseWindowMs: 2_000 },
  );
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
