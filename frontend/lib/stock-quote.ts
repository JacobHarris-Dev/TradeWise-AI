import type {
  AutoTradeBatchResult,
  AutoTradeResult,
  NewsReport,
  InvestmentChatResponse,
  PaperAccount,
  PaperAccountPerformance,
  PriceSnapshot,
  RefreshCadence,
  MockQuote,
  MockTradingDay,
  ModelProfile,
  StockRecommendation,
  StockRecommendationsResponse,
} from "@/lib/mocks/stock-data";

/**
 * Browser-facing entry point for live quote data.
 * The request goes through the same-origin Next route handler, which proxies to Python.
 */
export async function fetchStockQuote(
  ticker: string,
  options: {
    includeChart?: boolean;
    modelProfile?: ModelProfile;
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

  const response = await fetch(`/api/ml/quote?${params.toString()}`, {
    cache: "no-store",
  });

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
  } = {},
): Promise<MockQuote[]> {
  const normalizedTickers = Array.from(
    new Set(
      tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
    ),
  );

  if (normalizedTickers.length === 0) {
    return [];
  }

  return Promise.all(
    normalizedTickers.map((ticker) =>
      fetchStockQuote(ticker, {
        includeChart: options.includeChart,
        modelProfile: options.modelProfile,
      }),
    ),
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

export async function fetchStockPriceSnapshots(
  tickers: string[],
): Promise<PriceSnapshot[]> {
  const normalizedTickers = Array.from(
    new Set(
      tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
    ),
  );

  if (normalizedTickers.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    tickers: normalizedTickers.join(","),
  });
  const response = await fetch(`/api/ml/price-snapshots?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load market snapshots.");
  }

  return (await response.json()) as PriceSnapshot[];
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
): Promise<PaperAccountPerformance> {
  const params = new URLSearchParams();
  if (userId?.trim()) {
    params.set("userId", userId.trim());
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

  const response = await fetch(`/api/ml/news-report?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not load news report.");
  }

  return (await response.json()) as NewsReport;
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
