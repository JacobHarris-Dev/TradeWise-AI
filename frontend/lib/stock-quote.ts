import type { MockQuote } from "@/lib/mocks/stock-data";

/**
 * Browser-facing entry point for live quote data.
 * The request goes through the same-origin Next route handler, which proxies to Python.
 */
export async function fetchStockQuote(
  ticker: string,
  options: { includeChart?: boolean } = {},
): Promise<MockQuote> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter a ticker symbol.");
  }

  const params = new URLSearchParams({
    ticker: normalized,
    includeChart: options.includeChart === false ? "false" : "true",
  });

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
  options: { includeChart?: boolean } = {},
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
      fetchStockQuote(ticker, { includeChart: options.includeChart }),
    ),
  );
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
