"use client";

import { FormEvent, useMemo, useState } from "react";
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

function parsePrompt(prompt: string) {
  const lower = prompt.toLowerCase();
  const mentionedSectors = Object.entries(SECTOR_KEYWORDS)
    .filter(([, keywords]) => keywords.some((word) => lower.includes(word)))
    .map(([sector]) => sector)
    .slice(0, MAX_TRACKED_TICKERS);

  const inferredProfile =
    RISK_KEYWORDS.find((item) => item.words.some((word) => lower.includes(word)))
      ?.profile ?? "neutral";

  const explicitTickers = Array.from(
    new Set(
      prompt
        .toUpperCase()
        .match(/\b[A-Z]{1,5}\b/g)
        ?.filter((value) => !["AI", "ETF", "USD", "I", "ME"].includes(value)) ?? [],
    ),
  ).slice(0, MAX_TRACKED_TICKERS);

  return {
    sectors: mentionedSectors.length ? mentionedSectors : ["Technology", "ETF"],
    modelProfile: inferredProfile,
    explicitTickers,
  };
}

function scoreQuote(quote: MockQuote) {
  const signalBonus =
    quote.signal === "bullish" ? 2 : quote.signal === "neutral" ? 1 : 0;
  return signalBonus + (quote.confidence ?? 0);
}

export function InvestmentChatBubble() {
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
        "Tell me what you want to invest in, and I will pick + track 3 stocks using our model.",
    },
  ]);

  const canSubmit = useMemo(() => prompt.trim().length > 2 && !loading, [loading, prompt]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const rawPrompt = prompt.trim();
    if (!rawPrompt) {
      return;
    }

    setPrompt("");
    setError(null);
    setLoading(true);
    setMessages((current) => [...current, { role: "user", text: rawPrompt }]);

    try {
      const parsed = parsePrompt(rawPrompt);
      setModelProfile(parsed.modelProfile);
      writeStoredString(TRADE_STORAGE_KEYS.modelProfile, parsed.modelProfile);

      const tickerSet = new Set(parsed.explicitTickers);
      if (tickerSet.size < MAX_TRACKED_TICKERS) {
        const recommendations = await fetchStockRecommendations(parsed.sectors, {
          count: 5,
        });
        for (const item of recommendations) {
          tickerSet.add(item.ticker.trim().toUpperCase());
          if (tickerSet.size >= 5) {
            break;
          }
        }
      }

      const candidateTickers = Array.from(tickerSet);
      if (!candidateTickers.length) {
        throw new Error("I could not find candidate stocks from that prompt.");
      }

      const quoteResults = await Promise.allSettled(
        candidateTickers.map((ticker) =>
          fetchStockQuote(ticker, {
            includeChart: false,
            modelProfile: parsed.modelProfile,
          }),
        ),
      );

      const rankedQuotes = quoteResults
        .filter((result): result is PromiseFulfilledResult<MockQuote> => result.status === "fulfilled")
        .map((result) => result.value)
        .sort((a, b) => scoreQuote(b) - scoreQuote(a))
        .slice(0, MAX_TRACKED_TICKERS);

      if (!rankedQuotes.length) {
        throw new Error("Could not score candidate stocks right now.");
      }

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
        lastAction: `AI prompt loaded ${trackedTickers.join(", ")} based on: "${rawPrompt}"`,
      });

      const generated = await fetchInvestmentChatResponse({
        prompt: rawPrompt,
        modelProfile: parsed.modelProfile,
        sectors: parsed.sectors,
        trackedTickers,
      });

      if (generated.source !== "qwen") {
        throw new Error("Qwen did not generate a response.");
      }

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

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">TradeWise AI Prompt</h3>
        <button
          type="button"
          onClick={() => router.push("/trade")}
          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Open Trade
        </button>
      </div>

      <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${
              message.role === "assistant"
                ? "bg-zinc-100 text-zinc-800"
                : "ml-auto bg-zinc-900 text-white"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-3 flex gap-2">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Example: I want safe tech + healthcare picks this week"
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-emerald-400 focus:ring-2"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Thinking..." : "Track 3"}
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}