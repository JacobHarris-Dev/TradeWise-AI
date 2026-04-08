"use client";

import { useEffect, useState } from "react";
import type { MarketNews } from "@/lib/mocks/stock-data";
import { fetchMarketNews } from "@/lib/stock-quote";

const MARKET_NEWS_REFRESH_SECONDS = 300;
const MARKET_NEWS_LIMIT = 8;

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
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Market news
          </p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Trading-world headlines from Yahoo Finance
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            A broad market snapshot pulled from the yFinance news feed so the Trade page has context beyond the stocks in your basket.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshNow()}
          disabled={loading || refreshing}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {refreshing ? "Refreshing..." : "Refresh news"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {loading && !news ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Loading market news...
        </p>
      ) : null}

      {news ? (
        <>
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white dark:bg-zinc-100 dark:text-zinc-900">
                {news.sentiment}
              </span>
              {news.topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {topic}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {news.summary ?? "No market summary available right now."}
            </p>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              {news.fromCache ? "Cached snapshot" : "Fresh snapshot"} | Updated{" "}
              {new Date(news.refreshedAt).toLocaleTimeString()} | {news.articleCount}{" "}
              article{news.articleCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {news.articles.map((article) => (
              <article
                key={`${article.title}-${article.link ?? article.publishedAt ?? "news"}`}
                className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
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
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {article.publisher ?? "Unknown publisher"}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
