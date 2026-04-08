import { useEffect, useState } from "react";
import {
  fetchStockQuote,
  fetchTradeSignal,
  fetchNewsContext,
  checkBackendHealth,
  type StockQuote,
  type TradeSignal,
  type NewsItem,
} from "@/lib/backend-api";

/**
 * Hook to fetch stock quote with error handling
 */
export function useStockQuote(ticker: string) {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const data = await fetchStockQuote(ticker);
        setQuote(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch quote");
        setQuote(null);
      } finally {
        setLoading(false);
      }
    };

    fetch();
    const interval = setInterval(fetch, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [ticker]);

  return { quote, loading, error };
}

/**
 * Hook to fetch AI trade signal
 */
export function useTradeSignal(ticker: string) {
  const [signal, setSignal] = useState<TradeSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const data = await fetchTradeSignal(ticker);
        setSignal(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch signal");
        setSignal(null);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [ticker]);

  return { signal, loading, error };
}

/**
 * Hook to fetch news context
 */
export function useNewsContext(ticker: string) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const data = await fetchNewsContext(ticker);
        setNews(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch news");
        setNews([]);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [ticker]);

  return { news, loading, error };
}

/**
 * Hook to check backend health
 */
export function useBackendHealth() {
  const [healthy, setHealthy] = useState(true);

  useEffect(() => {
    const check = async () => {
      const isHealthy = await checkBackendHealth();
      setHealthy(isHealthy);
    };

    check();
    const interval = setInterval(check, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  return { healthy };
}

/**
 * Hook to fetch combined stock data (quote + signal + news)
 */
export function useStockData(ticker: string) {
  const { quote, loading: quoteLoading } = useStockQuote(ticker);
  const { signal, loading: signalLoading } = useTradeSignal(ticker);
  const { news, loading: newsLoading } = useNewsContext(ticker);

  const loading = quoteLoading || signalLoading || newsLoading;

  return {
    quote,
    signal,
    news,
    loading,
    ready: quote && signal,
  };
}
