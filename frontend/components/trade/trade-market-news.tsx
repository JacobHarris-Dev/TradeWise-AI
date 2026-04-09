"use client";
import { useEffect, useState } from "react";
import type { MarketNews, MockQuote, NewsReport, RefreshCadence } from "@/lib/mocks/stock-data";
import { fetchMarketNews } from "@/lib/stock-quote";

const MARKET_NEWS_REFRESH_SECONDS = 300;
const MARKET_NEWS_LIMIT = 8;
const SIGNAL_LABELS = {
  bullish: "Leaning buy",
  bearish: "Leaning sell",
  neutral: "Wait for now",
} as const;
const CADENCE_LABELS: Record<RefreshCadence, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
} as const;

function formatPublishedAt(value?: string | null) {
  if (!value) {
    return "Time unavailable";
  }

  const publishedAt = new Date(value);
  if (Number.isNaN(publishedAt.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(publishedAt);
}

type TradeTickerNewsReportProps = {
  quote: MockQuote;
  newsReport: NewsReport | null;
  newsReportLoading: boolean;
  onRefresh: () => void;
  isAdvancedView: boolean;
  refreshCadence: RefreshCadence;
};

export function TradeTickerNewsReport({
  quote,
  newsReport,
  newsReportLoading,
  onRefresh,
  isAdvancedView,
  refreshCadence,
}: TradeTickerNewsReportProps) {
  const visibleNewsHeadlines =
    newsReport?.newsHeadlines?.length
      ? newsReport.newsHeadlines
      : quote.newsHeadlines ?? [];
  const marketContext =
    newsReport?.newsSummary
    ?? quote.newsSummary
    ?? "Headlines below give the backdrop behind the current TradeWise call.";

  return (
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Live news report
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
          disabled={newsReportLoading}
        >
          {newsReportLoading ? "Refreshing..." : "Refresh now"}
        </button>
      </div>
      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2">
        <p className="text-sm font-semibold text-white">
          {SIGNAL_LABELS[newsReport?.signal ?? quote.signal ?? "neutral"]} •{" "}
          {(newsReport?.confidence ?? quote.confidence ?? 0).toFixed(1)}% confidence
        </p>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{marketContext}</p>
      {visibleNewsHeadlines.length ? (
        <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
          {visibleNewsHeadlines.map((headline) => (
            <p key={headline}>{headline}</p>
          ))}
        </div>
      ) : null}
      {isAdvancedView ? (
        <p className="mt-2 text-xs text-slate-500">
          Updates every {CADENCE_LABELS[refreshCadence]} | Last refresh:{" "}
          {newsReport ? new Date(newsReport.refreshedAt).toLocaleTimeString() : "-"} | Source:{" "}
          {newsReport?.fromCache ? "cache" : "fresh"}
          {newsReport?.reasoningSource ? ` | Reasoning: ${newsReport.reasoningSource}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          News summary refreshed in the background.
        </p>
      )}
    </div>
  );
}

export function TradeMarketNews() {
  const [news, setNews] = useState<MarketNews | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialNews() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchMarketNews({
          limit: MARKET_NEWS_LIMIT,
          refreshSeconds: MARKET_NEWS_REFRESH_SECONDS,
        });
        if (!cancelled) {
          setNews(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load market news.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialNews();

    const interval = window.setInterval(() => {
      void fetchMarketNews({
        limit: MARKET_NEWS_LIMIT,
        refreshSeconds: MARKET_NEWS_REFRESH_SECONDS,
      })
        .then((response) => {
          if (!cancelled) {
            setNews(response);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("Could not refresh market news.");
          }
        });
    }, MARKET_NEWS_REFRESH_SECONDS * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const refreshNow = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const response = await fetchMarketNews({
        limit: MARKET_NEWS_LIMIT,
        refreshSeconds: MARKET_NEWS_REFRESH_SECONDS,
        forceRefresh: true,
      });
      setNews(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh market news.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Market news
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Trading-world headlines from Yahoo Finance
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            A broad market snapshot pulled from the yFinance news feed so the Trade page has context beyond the stocks in your basket.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshNow()}
          disabled={loading || refreshing}
          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh news"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-400">{error}</p>
      ) : null}

      {loading && !news ? (
        <p className="mt-4 text-sm text-slate-500">
          Loading market news...
        </p>
      ) : null}

      {news ? (
        <>
          <div className="mt-5 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950">
                Market brief
              </span>
              {news.briefSource ? (
                <span className="rounded-full border border-sky-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                  {news.briefSource}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-100">
              {news.llmBrief ?? news.summary ?? "No market brief available right now."}
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                {news.sentiment}
              </span>
              {news.topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300"
                >
                  {topic}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {news.summary ?? "No market summary available right now."}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {news.fromCache ? "Cached snapshot" : "Fresh snapshot"} | Updated{" "}
              {new Date(news.refreshedAt).toLocaleTimeString()} | {news.articleCount}{" "}
              article{news.articleCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {news.articles.map((article) => (
              <article
                key={`${article.title}-${article.link ?? article.publishedAt ?? "news"}`}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100">
                      {article.link ? (
                        <a
                          href={article.link}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {article.title}
                        </a>
                      ) : (
                        article.title
                      )}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {article.publisher ?? "Unknown publisher"}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatPublishedAt(article.publishedAt)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
