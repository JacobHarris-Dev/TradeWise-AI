import type {
  AutoTradeResult,
  ChartType,
  RefreshCadence,
  MockQuote,
  MockTradingDay,
  ModelProfile,
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
    chartType?: ChartType;
  } = {},
): Promise<MockQuote> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker symbol.");
  }

  const params = new URLSearchParams({
    ticker: normalized,
    includeChart: options.includeChart === false ? "false" : "true",
  });
  if (options.modelProfile) {
    params.set("modelProfile", options.modelProfile);
  }
  if (options.chartType) {
    params.set("chartType", options.chartType);
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
    chartType?: ChartType;
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
        chartType: options.chartType,
      }),
    ),
  );
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
    }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || "Could not execute paper auto-trade.");
  }

  return (await response.json()) as AutoTradeResult;
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
