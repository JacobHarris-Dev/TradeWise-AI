import { getMockStockQuote, type MockQuote } from "@/lib/mocks/stock-data";

/**
 * Single entry point for “current quote” data on the Trade page.
 * Today: returns mock data (with a short delay to mimic a network call).
 * Later: replace the body with `fetch('/api/quote?ticker=...')` or a server action.
 */
export async function fetchStockQuote(ticker: string): Promise<MockQuote> {
  await new Promise((r) => setTimeout(r, 180));
  return getMockStockQuote(ticker);
}
