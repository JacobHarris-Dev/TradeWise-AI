"use client";

import { FormEvent, type KeyboardEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import {
  useTradeWorkspace,
  useTradeWorkspaceActions,
} from "@/components/providers/trade-workspace-provider";
import type { MockQuote, NewsReport, ModelProfile } from "@/lib/mocks/stock-data";
import {
  fetchInvestmentChatResponse,
  fetchNewsReport,
  fetchPaperAccount,
  fetchStockQuote,
  fetchStockQuotes,
  fetchStockRecommendations,
} from "@/lib/stock-quote";
import {
  buildQuoteMap,
  MAX_TRACKED_TICKERS,
  readStoredRefreshCadence,
  TRADE_STORAGE_KEYS,
  writeStoredJson,
  writeStoredString,
} from "@/lib/trade-workspace";

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
};

type InvestmentChatBubbleProps = {
  expanded?: boolean;
  showOpenTradeButton?: boolean;
};

const SECTOR_KEYWORDS: Record<string, string[]> = {
  Technology: ["tech", "technology", "software", "ai", "semiconductor", "chip"],
  Healthcare: ["health", "healthcare", "biotech", "pharma", "medical"],
  "Financial Services": ["finance", "financial", "bank", "payments", "fintech"],
  Energy: ["energy", "oil", "gas", "renewable", "solar"],
  "Consumer Defensive": ["consumer defensive", "staples", "grocery", "household"],
  "Consumer Cyclical": ["consumer cyclical", "retail", "ecommerce", "auto"],
  ETF: ["etf", "index", "broad market", "diversified"],
};

const RISK_KEYWORDS: Array<{ profile: ModelProfile; words: string[] }> = [
  { profile: "safe", words: ["safe", "conservative", "low risk", "stability"] },
  { profile: "risky", words: ["aggressive", "high risk", "growth", "momentum"] },
];

const FALLBACK_SECTORS = ["Technology", "Healthcare", "ETF"] as const;

const SIGNAL_BADGES = {
  bullish:
    "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  bearish: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  neutral: "bg-slate-800/90 text-slate-300 ring-1 ring-inset ring-slate-700",
} as const;

const SIGNAL_LABELS = {
  bullish: "Leaning buy",
  bearish: "Leaning sell",
  neutral: "Wait for now",
} as const;

type SelectedStockFocus = {
  ticker: string;
  companyName: string;
  reason: string;
  signal: MockQuote["signal"];
  confidence: number | null;
};

function parsePrompt(prompt: string) {
  const lower = prompt.toLowerCase();
  const mentionedSectors = Object.entries(SECTOR_KEYWORDS)
    .filter(([, keywords]) => keywords.some((word) => lower.includes(word)))
    .map(([sector]) => sector)
    .slice(0, MAX_TRACKED_TICKERS);

  const inferredProfile =
    RISK_KEYWORDS.find((item) => item.words.some((word) => lower.includes(word)))
      ?.profile ?? "neutral";

  const explicitTickerCandidates = prompt.match(/\$[A-Za-z]{1,5}\b|\b[A-Z]{1,5}\b/g) ?? [];
  const explicitTickers = Array.from(
    new Set(
      explicitTickerCandidates
        .map((value) => value.replace(/^\$/, "").trim().toUpperCase())
        .filter((value) => {
          if (!value) {
            return false;
          }
          if (["AI", "ETF", "USD", "I", "ME"].includes(value)) {
            return false;
          }
          return value === value.toUpperCase();
        }),
    ),
  ).slice(0, MAX_TRACKED_TICKERS);

  return {
    sectors: mentionedSectors.length ? mentionedSectors : ["Technology", "ETF"],
    modelProfile: inferredProfile,
    explicitTickers,
  };
}

function scoreQuote(quote: MockQuote) {
  const signalBonus = quote.signal === "bullish" ? 2 : quote.signal === "neutral" ? 1 : 0;
  return signalBonus + (quote.confidence ?? 0);
}

function buildQuoteReason(quote: MockQuote) {
  const explanation = quote.explanation?.trim();
  if (explanation) {
    return explanation;
  }

  const signalLabel =
    quote.signal === "bullish"
      ? "The model leans bullish"
      : quote.signal === "bearish"
        ? "The model leans bearish"
        : "The model leans neutral";
  const confidenceLabel =
    typeof quote.confidence === "number"
      ? `${quote.confidence.toFixed(1)}% confidence`
      : "with model confidence attached";

  return `${signalLabel} ${confidenceLabel}.`;
}

async function resolveThreeStockBasket(params: {
  promptSectors: string[];
  explicitTickers: string[];
  modelProfile: ModelProfile;
}) {
  const candidateSet = new Set<string>(
    params.explicitTickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
  );

  const sectorSets = [params.promptSectors, [...FALLBACK_SECTORS]];
  for (const sectors of sectorSets) {
    if (candidateSet.size >= MAX_TRACKED_TICKERS) {
      break;
    }

    try {
      const recommendations = await fetchStockRecommendations(sectors, { count: 5 });
      for (const item of recommendations) {
        candidateSet.add(item.ticker.trim().toUpperCase());
        if (candidateSet.size >= 5) {
          break;
        }
      }
    } catch {
      // Try the next fallback sector set if one recommendation request fails.
    }
  }

  const initialCandidates = Array.from(candidateSet);
  if (!initialCandidates.length) {
    throw new Error("I could not find candidate stocks from that prompt.");
  }

  const quoteMap = new Map<string, MockQuote>();
  try {
    const batch = await fetchStockQuotes(initialCandidates, {
      includeChart: false,
      modelProfile: params.modelProfile,
    });

    for (const quote of batch.results) {
      quoteMap.set(quote.ticker, quote);
    }
  } catch {
    // Fall through to individual quote fetches for better resilience.
  }

  const missingCandidates = initialCandidates.filter((ticker) => !quoteMap.has(ticker));
  if (quoteMap.size < MAX_TRACKED_TICKERS && missingCandidates.length) {
    const fallbackFetches = await Promise.allSettled(
      missingCandidates.map((ticker) =>
        fetchStockQuote(ticker, {
          includeChart: false,
          modelProfile: params.modelProfile,
        }),
      ),
    );

    for (const result of fallbackFetches) {
      if (result.status === "fulfilled") {
        quoteMap.set(result.value.ticker, result.value);
      }
    }
  }

  if (quoteMap.size < MAX_TRACKED_TICKERS) {
    let fallbackTickers: string[] = [];
    try {
      const fallbackRecommendations = await fetchStockRecommendations(
        [...FALLBACK_SECTORS],
        { count: MAX_TRACKED_TICKERS },
      );
      fallbackTickers = fallbackRecommendations
        .map((item) => item.ticker.trim().toUpperCase())
        .filter((ticker) => ticker && !quoteMap.has(ticker));
    } catch {
      fallbackTickers = [];
    }

    if (fallbackTickers.length) {
      const fallbackQuotes = await Promise.allSettled(
        fallbackTickers.map((ticker) =>
          fetchStockQuote(ticker, {
            includeChart: false,
            modelProfile: params.modelProfile,
          }),
        ),
      );

      for (const result of fallbackQuotes) {
        if (result.status === "fulfilled") {
          quoteMap.set(result.value.ticker, result.value);
        }
      }
    }
  }

  const selectedQuotes = Array.from(quoteMap.values())
    .sort((a, b) => scoreQuote(b) - scoreQuote(a))
    .slice(0, MAX_TRACKED_TICKERS);

  if (selectedQuotes.length < MAX_TRACKED_TICKERS) {
    throw new Error("Could not load three stock picks right now.");
  }

  return selectedQuotes;
}

export function InvestmentChatBubble({
  expanded = false,
  showOpenTradeButton = true,
}: InvestmentChatBubbleProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { setModelProfile } = useTradeWorkspace();
  const { hydrateWorkspace } = useTradeWorkspaceActions();

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text:
        "Tell me what you want to invest in, and I will pick and track 3 stocks using our model.",
    },
  ]);
  const [selectedStocks, setSelectedStocks] = useState<SelectedStockFocus[]>([]);

  const canSubmit = useMemo(() => prompt.trim().length > 2 && !loading, [loading, prompt]);

  const submitPrompt = async () => {
    const rawPrompt = prompt.trim();
    if (!rawPrompt || loading) {
      return;
    }

    setPrompt("");
    setError(null);
    setLoading(true);
    setSelectedStocks([]);
    setMessages((current) => [...current, { role: "user", text: rawPrompt }]);

    try {
      const parsed = parsePrompt(rawPrompt);
      setModelProfile(parsed.modelProfile);
      writeStoredString(TRADE_STORAGE_KEYS.modelProfile, parsed.modelProfile);

      const rankedQuotes = await resolveThreeStockBasket({
        promptSectors: parsed.sectors,
        explicitTickers: parsed.explicitTickers,
        modelProfile: parsed.modelProfile,
      });

      const trackedTickers = rankedQuotes.map((quote) => quote.ticker);
      const selectedTicker = trackedTickers[0] ?? "";
      const accountUserId = user?.uid ?? "guest";
      const refreshCadence = readStoredRefreshCadence();
      const newsRefreshSeconds =
        refreshCadence === "15m" ? 900 : refreshCadence === "5m" ? 300 : 60;

      const [paperAccountResult, newsResult] = await Promise.allSettled([
        fetchPaperAccount(accountUserId),
        selectedTicker
          ? fetchNewsReport(selectedTicker, {
              modelProfile: parsed.modelProfile,
              refreshSeconds: newsRefreshSeconds,
            })
          : Promise.resolve(null),
      ]);

      const newsReportsByTicker: Record<string, NewsReport> = {};
      if (newsResult.status === "fulfilled" && newsResult.value?.ticker) {
        newsReportsByTicker[newsResult.value.ticker] = newsResult.value;
      }

      setSelectedStocks(
        rankedQuotes.map((quote) => ({
          ticker: quote.ticker,
          companyName: quote.companyName,
          reason: buildQuoteReason(quote),
          signal: quote.signal,
          confidence: quote.confidence ?? null,
        })),
      );

      writeStoredJson(TRADE_STORAGE_KEYS.preferredSectors, parsed.sectors);
      writeStoredJson(TRADE_STORAGE_KEYS.trackedTickers, trackedTickers);

      hydrateWorkspace({
        savedAt: Date.now(),
        trackedTickers,
        selectedTicker,
        quotesByTicker: buildQuoteMap(rankedQuotes),
        newsReportsByTicker,
        paperAccount:
          paperAccountResult.status === "fulfilled" ? paperAccountResult.value : null,
        autoTradeResult: null,
        lastAction: `AI selected ${trackedTickers.join(", ")} from: "${rawPrompt}"`,
      });

      const generated = await fetchInvestmentChatResponse({
        prompt: rawPrompt,
        modelProfile: parsed.modelProfile,
        sectors: parsed.sectors,
        trackedTickers,
      });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: generated.reply,
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not process that investment prompt.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePromptKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (canSubmit) {
      void submitPrompt();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    void submitPrompt();
  };

  return (
    <section
      className={`rounded-2xl border border-indigo-500/25 bg-[linear-gradient(180deg,rgba(49,46,129,0.24),rgba(15,23,42,0.92))] ${
        expanded ? "p-6" : "p-4"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className={`${expanded ? "text-lg" : "text-sm"} font-semibold text-white`}>
            TradeWise AI Prompt
          </h3>
          <p className={`mt-1 ${expanded ? "max-w-2xl text-sm leading-6" : "text-xs"} text-slate-300`}>
            Describe the kind of stocks you want to practice with and TradeWise will choose up to three symbols, load the basket, and explain the reasoning.
          </p>
        </div>
        {showOpenTradeButton ? (
          <button
            type="button"
            onClick={() => router.push("/trade")}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Open Trade
          </button>
        ) : null}
      </div>

      <div
        className={`space-y-2 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/80 ${
          expanded ? "max-h-80 p-4" : "max-h-44 p-3"
        }`}
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[92%] rounded-2xl px-3 py-2 ${expanded ? "text-sm leading-6" : "text-sm"} ${
              message.role === "assistant"
                ? "bg-slate-800 text-slate-100"
                : "ml-auto bg-indigo-600 text-white"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className={`mt-4 ${expanded ? "space-y-3" : "flex gap-2"}`}
      >
        {expanded ? (
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder="Example: I want safer healthcare and tech names I can track this week without taking too much risk."
            className="min-h-28 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none ring-indigo-400 focus:ring-2"
            disabled={loading}
          />
        ) : (
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder="Example: I want safe tech + healthcare picks this week"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-indigo-400 focus:ring-2"
            disabled={loading}
          />
        )}
        <div className={expanded ? "flex items-center justify-between gap-3" : ""}>
          {expanded ? (
            <p className="text-xs text-slate-400">
              Replies use Qwen when available and fall back gracefully if the model is unavailable.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`rounded-xl bg-emerald-500 font-semibold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${
              expanded ? "px-5 py-3 text-sm" : "px-4 py-2 text-sm"
            }`}
          >
            {loading ? "Thinking..." : "Track 3"}
          </button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      {selectedStocks.length ? (
        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white">Why these 3</h4>
              <p className="mt-1 text-xs text-slate-400">
                The model-backed basket is always topped up to three names, and each pick gets its own rationale.
              </p>
            </div>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              3 picks
            </span>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {selectedStocks.map((stock, index) => (
              <article
                key={stock.ticker}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Pick {index + 1}
                    </p>
                    <h5 className="mt-1 font-mono text-base font-semibold text-white">
                      {stock.ticker}
                    </h5>
                    <p className="text-xs text-slate-400">{stock.companyName}</p>
                  </div>
                  {stock.signal ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        stock.signal === "bullish"
                          ? SIGNAL_BADGES.bullish
                          : stock.signal === "bearish"
                            ? SIGNAL_BADGES.bearish
                            : SIGNAL_BADGES.neutral
                      }`}
                    >
                      {SIGNAL_LABELS[stock.signal]}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {stock.reason}
                </p>
                {typeof stock.confidence === "number" ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Confidence: {stock.confidence.toFixed(1)}%
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
