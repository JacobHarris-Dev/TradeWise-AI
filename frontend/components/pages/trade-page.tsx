"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { TradeStarterSectors } from "@/components/dashboard/trade-starter-sectors";
import { AiDisclaimer } from "@/components/layout/ai-disclaimer";
import { useTradeWorkspace } from "@/components/providers/trade-workspace-provider";
import { StockCard } from "@/components/stock/stock-card";
import { TradeTickerNewsReport } from "@/components/trade/trade-market-news";
import type { ModelProfile, RefreshCadence, TradeSignal } from "@/lib/mocks/stock-data";
import { MAX_TRACKED_TICKERS, type TradeMode } from "@/lib/trade-workspace";

const LiveLineChart = dynamic(
  () =>
    import("@/components/stock/live-line-chart").then(
      (mod) => mod.LiveLineChart,
    ),
  {
    ssr: false,
    loading: () => (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-slate-950/20">
        <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 text-sm text-slate-400">
          Loading chart...
        </div>
      </section>
    ),
  },
);

const SIGNAL_BADGES = {
  bullish:
    "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  bearish:
    "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  neutral:
    "bg-slate-800/90 text-slate-300 ring-1 ring-inset ring-slate-700",
} as const;

const SIGNAL_LABELS = {
  bullish: "Leaning buy",
  bearish: "Leaning sell",
  neutral: "Wait for now",
} as const;

const ACTION_BADGES = {
  buy: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  sell: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  hold: "bg-slate-800/90 text-slate-300 ring-1 ring-inset ring-slate-700",
} as const;

const ACTION_LABELS = {
  buy: "Paper buy",
  sell: "Paper sell",
  hold: "Wait",
} as const;

const RECOMMENDATION_BADGES = {
  buy: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
  sell: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30",
  hold: "bg-slate-800/90 text-slate-300 ring-1 ring-inset ring-slate-700",
} as const;

const RECOMMENDATION_LABELS = {
  buy: "Buy setup",
  sell: "Sell setup",
  hold: "Hold only",
} as const;

const TRADE_MODE_LABELS = {
  manual: "I decide",
  model: "TradeWise decides",
} as const;

const MODEL_PROFILE_LABELS: Record<ModelProfile, string> = {
  safe: "Safe",
  neutral: "Neutral",
  risky: "Risky",
} as const;
const CADENCE_LABELS: Record<RefreshCadence, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
} as const;
const TRADE_UI_MODE_STORAGE_KEY = "tradewise.tradeUiMode";

type TradeUiMode = "simple" | "advanced";

function formatReasoningSourceLabel(source?: "qwen" | "template" | "remote-llm" | null) {
  if (source === "remote-llm") {
    return "Qwen";
  }
  if (source === "qwen") {
    return "Local Qwen";
  }
  if (source === "template") {
    return "Fallback";
  }
  return null;
}

function InfoHint({ label: _label }: { label: string }) {
  void _label;
  return null;
}

function QuotePriceLoadingLabel({
  className = "text-slate-400",
}: {
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400"
        aria-hidden
      />
      Loading data...
    </span>
  );
}

type TimelinePoint = {
  time: string;
  price: number;
};

type TimelineDisplay = {
  lastPrice: number;
  changePercent: number;
};

type TradeRecommendation = "buy" | "sell" | "hold";

function interpolateTimelinePrice(
  points: TimelinePoint[],
  targetTime?: string | null,
): number | null {
  if (!points.length) {
    return null;
  }
  if (!targetTime || points.length === 1) {
    return points[points.length - 1]?.price ?? null;
  }

  const targetMs = new Date(targetTime).getTime();
  if (Number.isNaN(targetMs)) {
    return points[points.length - 1]?.price ?? null;
  }

  const firstMs = new Date(points[0].time).getTime();
  if (!Number.isNaN(firstMs) && targetMs <= firstMs) {
    return points[0].price;
  }

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    const nextMs = new Date(next.time).getTime();
    if (Number.isNaN(nextMs)) {
      continue;
    }
    if (targetMs > nextMs) {
      continue;
    }

    const previous = points[index - 1] ?? next;
    const previousMs = new Date(previous.time).getTime();
    if (
      Number.isNaN(previousMs) ||
      targetMs <= previousMs ||
      nextMs <= previousMs
    ) {
      return previous.price;
    }

    const ratio = (targetMs - previousMs) / (nextMs - previousMs);
    return Number(
      (previous.price + (next.price - previous.price) * ratio).toFixed(4),
    );
  }

  return points[points.length - 1]?.price ?? null;
}

function resolveTimelineDisplay(
  points: TimelinePoint[],
  targetTime?: string | null,
): TimelineDisplay | null {
  const lastPrice = interpolateTimelinePrice(points, targetTime);
  if (lastPrice == null) {
    return null;
  }

  const firstPointMs = points.length ? new Date(points[0].time).getTime() : NaN;
  const targetMs = targetTime ? new Date(targetTime).getTime() : NaN;
  const previousTargetTime =
    !Number.isNaN(targetMs) && !Number.isNaN(firstPointMs)
      ? new Date(Math.max(firstPointMs, targetMs - 60_000)).toISOString()
      : points[Math.max(0, points.length - 2)]?.time ?? targetTime ?? null;
  const previousPrice =
    interpolateTimelinePrice(points, previousTargetTime) ?? lastPrice;

  return {
    lastPrice,
    changePercent:
      previousPrice > 0
        ? Number((((lastPrice / previousPrice) - 1) * 100).toFixed(2))
        : 0,
  };
}

type ReplayModelRead = {
  signal: TradeSignal;
  confidence: number;
};

const REPLAY_SHORT_WINDOW = 5;
const REPLAY_LONG_WINDOW = 20;
const REPLAY_MOMENTUM_WINDOW = 7;
const REPLAY_ANNUAL_RATE = 0.045;

function parseReplayIntervalMs(interval?: string | null) {
  if (!interval) {
    return null;
  }
  const match = interval.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = match[2];
  if (unit === "m") {
    return value * 60_000;
  }
  if (unit === "h") {
    return value * 60 * 60_000;
  }
  return value * 24 * 60 * 60_000;
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStd(values: number[]) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function replaySignalFromScore(score: number): TradeSignal {
  if (score > 0.12) {
    return "bullish";
  }
  if (score < -0.12) {
    return "bearish";
  }
  return "neutral";
}

function buildReplayCloses(
  quote: {
    history?: number[];
    marketDataInterval?: string | null;
  },
  timelineEndIso: string | null | undefined,
  targetTime: string | null | undefined,
) {
  const history = quote.history ?? [];
  if (!history.length) {
    return [];
  }

  const intervalMs = parseReplayIntervalMs(quote.marketDataInterval) ?? 60_000;
  const endMs = timelineEndIso ? new Date(timelineEndIso).getTime() : Number.NaN;
  const targetMs = targetTime ? new Date(targetTime).getTime() : Number.NaN;

  if (Number.isNaN(endMs) || Number.isNaN(targetMs) || targetMs >= endMs) {
    return history.slice();
  }

  const offsetBars = (endMs - targetMs) / intervalMs;
  const rawIndex = history.length - 1 - offsetBars;
  if (rawIndex <= 0) {
    return history.slice(0, Math.min(history.length, REPLAY_LONG_WINDOW));
  }

  const floorIndex = Math.floor(rawIndex);
  const fraction = rawIndex - floorIndex;
  const closes = history.slice(0, Math.max(1, floorIndex + 1));

  if (fraction > 0 && floorIndex + 1 < history.length) {
    const current = history[floorIndex] ?? history[history.length - 1] ?? 0;
    const next = history[floorIndex + 1] ?? current;
    closes.push(Number((current + (next - current) * fraction).toFixed(4)));
  }

  return closes;
}

function deriveReplayModelRead(
  quote: {
    history?: number[];
    marketDataInterval?: string | null;
    signal?: TradeSignal;
    confidence?: number;
  },
  timelineEndIso: string | null | undefined,
  targetTime: string | null | undefined,
): ReplayModelRead | null {
  const closes = buildReplayCloses(quote, timelineEndIso, targetTime);
  if (closes.length < REPLAY_LONG_WINDOW || closes.length <= REPLAY_MOMENTUM_WINDOW) {
    if (!quote.signal) {
      return null;
    }
    return {
      signal: quote.signal,
      confidence: quote.confidence ?? 50,
    };
  }

  const lastPrice = closes[closes.length - 1] ?? 0;
  const shortMa = average(closes.slice(-REPLAY_SHORT_WINDOW));
  const longMa = average(closes.slice(-REPLAY_LONG_WINDOW));
  const momentumBase = closes[closes.length - 1 - REPLAY_MOMENTUM_WINDOW] ?? lastPrice;
  const momentum =
    momentumBase > 0 ? lastPrice / momentumBase - 1 : 0;
  const returns = closes
    .slice(1)
    .map((value, index) => {
      const previous = closes[index] ?? 0;
      return previous > 0 ? value / previous - 1 : 0;
    });
  const volatility = sampleStd(returns);
  const trendStrength = longMa > 0 ? shortMa / longMa - 1 : 0;
  const discountFactor = Math.exp((-REPLAY_ANNUAL_RATE * 30) / 365);
  const score =
    (
      0.55 * Math.tanh(trendStrength * 10) +
      0.3 * Math.tanh(momentum * 7) -
      0.15 * Math.tanh(volatility * 45)
    ) *
    discountFactor;

  return {
    signal: replaySignalFromScore(score),
    confidence: Number(
      Math.min(99, Math.max(50, 55 + Math.abs(score) * 45)).toFixed(1),
    ),
  };
}

function deriveTradeRecommendation({
  signal,
  confidence,
  sentiment,
  changePercent,
}: {
  signal: TradeSignal;
  confidence: number;
  sentiment?: "positive" | "negative" | "neutral" | null;
  changePercent: number;
}): TradeRecommendation {
  if (signal === "bullish") {
    return "buy";
  }
  if (signal === "bearish") {
    return "sell";
  }

  if (sentiment === "positive" && changePercent >= -0.5) {
    return "buy";
  }
  if (sentiment === "negative" && changePercent <= 0.5) {
    return "sell";
  }

  if (
    confidence < 54 &&
    (sentiment == null || sentiment === "neutral") &&
    Math.abs(changePercent) < 0.6
  ) {
    return "hold";
  }

  return changePercent >= 0 ? "buy" : "sell";
}

function recommendationToSignal(action: TradeRecommendation): TradeSignal {
  if (action === "buy") {
    return "bullish";
  }
  if (action === "sell") {
    return "bearish";
  }
  return "neutral";
}

function recommendationPhrase(action: TradeRecommendation) {
  if (action === "buy") {
    return "buying";
  }
  if (action === "sell") {
    return "selling";
  }
  return "holding";
}

function confidenceDescriptor(confidence: number) {
  if (confidence >= 80) {
    return "High conviction";
  }
  if (confidence >= 65) {
    return "Moderate conviction";
  }
  if (confidence >= 50) {
    return "Building confidence";
  }
  return "Low conviction";
}

function confidenceTone(signal: TradeSignal) {
  if (signal === "bullish") {
    return {
      text: "text-emerald-300",
      ring: "rgba(16,185,129,0.95)",
      track: "rgba(15,23,42,0.9)",
      bar: "from-emerald-500 via-emerald-400 to-lime-300",
      panel: "border-emerald-500/20 bg-emerald-500/10",
    };
  }
  if (signal === "bearish") {
    return {
      text: "text-rose-300",
      ring: "rgba(244,63,94,0.95)",
      track: "rgba(15,23,42,0.9)",
      bar: "from-rose-500 via-rose-400 to-orange-300",
      panel: "border-rose-500/20 bg-rose-500/10",
    };
  }
  return {
    text: "text-sky-300",
    ring: "rgba(56,189,248,0.95)",
    track: "rgba(15,23,42,0.9)",
    bar: "from-sky-500 via-cyan-400 to-slate-300",
    panel: "border-sky-500/20 bg-sky-500/10",
  };
}

function ConfidenceMeter({
  confidence,
  signal,
}: {
  confidence: number;
  signal: TradeSignal;
}) {
  const value = Math.max(0, Math.min(confidence, 100));
  const tone = confidenceTone(signal);
  const descriptor = confidenceDescriptor(value);
  const arcDegrees = Math.max(12, Math.round((value / 100) * 360));

  return (
    <section
      className={`mt-4 rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${tone.panel}`}
    >
      <div className="grid gap-4 md:grid-cols-[9rem_minmax(0,1fr)] md:items-center">
        <div className="mx-auto">
          <div
            className="flex h-36 w-36 items-center justify-center rounded-full p-3"
            style={{
              background: `conic-gradient(${tone.ring} 0deg ${arcDegrees}deg, ${tone.track} ${arcDegrees}deg 360deg)`,
            }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950 ring-1 ring-slate-800">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Confidence
              </span>
              <span className={`mt-1 text-3xl font-semibold ${tone.text}`}>
                {value.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Signal strength
          </p>
          <p className={`mt-1 text-lg font-semibold ${tone.text}`}>
            {descriptor}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Higher confidence means TradeWise sees a cleaner setup in the current data. It is still a probability read, not a guarantee.
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span>Cautious</span>
              <span>Strong</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-950 ring-1 ring-inset ring-slate-800">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Trade route: compact single-surface trading workspace with manual and future
 * model-run modes.
 */
export function TradePage() {
  const [uiMode, setUiMode] = useState<TradeUiMode>("simple");
  const [manualShares, setManualShares] = useState(1);
  const {
    trackedTickers,
    selectedTicker,
    quotesByTicker,
    loading: quotesLoading,
    error,
    lastAction,
    tradeMode,
    modelProfile,
    refreshCadence,
    autoTradeEnabled,
    mockTradingDay,
    mockTradingLoading,
    mockTradingError,
    autoTradeResult,
    paperTradeLog,
    autoTradeLoading,
    autoTradeError,
    newsReportsByTicker,
    newsReportLoading,
    newsReportError,
    paperAccount,
    paperAccountLoading,
    paperAccountError,
    streamConnected,
    streamError,
    lastTickAt,
    clock,
    marketSnapshot,
    simulation,
    simulationSnapshot,
    simulatedDate,
    historicReplayWindowHours,
    tradingTimeMode,
    advanceSimulationTime,
    resetSimulationTime,
    setTradeMode,
    setModelProfile,
    setRefreshCadence,
    setAutoTradeEnabled,
    selectTrackedTicker,
    removeTrackedTicker,
    loadNewsReport,
    runAutoTrade,
    loadMockTradingDay,
    simulateOrder,
    clearPaperTradeLog,
  } = useTradeWorkspace();

  useEffect(() => {
    const stored = window.localStorage.getItem(TRADE_UI_MODE_STORAGE_KEY);
    if (stored === "simple" || stored === "advanced") {
      startTransition(() => {
        setUiMode(stored);
      });
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TRADE_UI_MODE_STORAGE_KEY, uiMode);
  }, [uiMode]);

  const isAdvancedView = uiMode === "advanced";

  const marketTimeDate = (() => {
    if (tradingTimeMode !== "historic") {
      return clock;
    }
    const iso = simulatedDate ?? simulationSnapshot?.time ?? null;
    if (!iso) {
      return clock;
    }
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? clock : parsed;
  })();

  const currentTime = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(marketTimeDate);

  const quote = selectedTicker ? quotesByTicker[selectedTicker] ?? null : null;
  const newsReport = selectedTicker ? newsReportsByTicker[selectedTicker] ?? null : null;
  const isHistoricSession =
    tradingTimeMode === "historic" && simulationSnapshot != null;
  const selectedSimPriceSymbol = selectedTicker || quote?.ticker || trackedTickers[0] || "";
  const selectedSimPrice = simulationSnapshot
    ? simulationSnapshot.currentPrices[selectedSimPriceSymbol] ?? null
    : null;
  const activeProfile = quote?.selectedModelProfile ?? modelProfile;
  const currentSymbol = quote?.ticker || selectedTicker || trackedTickers[0] || "AAPL";
  const trackedTickerSummary = trackedTickers.length
    ? trackedTickers.join(", ")
    : currentSymbol;
  const tradeDecisionExplanation = newsReport?.studentReasoning
    ?? newsReport?.report
    ?? quote?.explanation
    ?? null;
  const reasoningSourceLabel = formatReasoningSourceLabel(newsReport?.reasoningSource ?? null);
  const streamStatusDescription =
    !marketSnapshot.isOpen
      ? null
      : streamConnected
        ? "Live stream connected"
        : "Connecting to IEX stream";
  const liveMarketStatusLine = streamStatusDescription
    ? `${marketSnapshot.statusLabel} | ${streamStatusDescription}`
    : marketSnapshot.statusLabel;
  const liveFeedLabel = !marketSnapshot.isOpen
    ? "Paused"
    : streamConnected
      ? "Connected"
      : "Connecting";

  const marketStatusLine =
    tradingTimeMode === "historic"
      ? "Historic session · quotes & headlines follow simulated time"
      : liveMarketStatusLine;
  const paperTradeStats = useMemo(() => {
    return paperTradeLog.reduce(
      (acc, entry) => {
        acc.total += 1;
        if (entry.action === "buy") acc.buys += 1;
        if (entry.action === "sell") acc.sells += 1;
        if (entry.action === "hold") acc.holds += 1;
        return acc;
      },
      { total: 0, buys: 0, sells: 0, holds: 0 },
    );
  }, [paperTradeLog]);

  const simulationTimeline = useMemo(
    () => simulation?.priceTimelineBySymbol[selectedSimPriceSymbol] ?? [],
    [selectedSimPriceSymbol, simulation],
  );
  const historicDisplaysByTicker = useMemo<Record<string, TimelineDisplay | null>>(
    () => {
      if (!isHistoricSession || !simulationSnapshot || !simulation) {
        return {};
      }
      const next: Record<string, TimelineDisplay | null> = {};
      for (const ticker of trackedTickers) {
        next[ticker] = resolveTimelineDisplay(
          simulation.priceTimelineBySymbol[ticker] ?? [],
          simulationSnapshot.time,
        );
      }
      return next;
    },
    [isHistoricSession, simulation, simulationSnapshot, trackedTickers],
  );
  const selectedHistoricDisplay = useMemo(
    () =>
      isHistoricSession
        ? resolveTimelineDisplay(
            simulationTimeline,
            simulationSnapshot?.time ?? simulatedDate ?? null,
          )
        : null,
    [isHistoricSession, simulatedDate, simulationSnapshot?.time, simulationTimeline],
  );
  const replayReadsByTicker = useMemo<Record<string, ReplayModelRead | null>>(
    () => {
      if (!isHistoricSession || !simulation || !simulationSnapshot) {
        return {};
      }
      const next: Record<string, ReplayModelRead | null> = {};
      for (const ticker of trackedTickers) {
        const quoteForTicker = quotesByTicker[ticker];
        const points = simulation.priceTimelineBySymbol[ticker] ?? [];
        const timelineEndIso = points[points.length - 1]?.time ?? null;
        next[ticker] = quoteForTicker
          ? deriveReplayModelRead(
              quoteForTicker,
              timelineEndIso,
              simulationSnapshot.time,
            )
          : null;
      }
      return next;
    },
    [isHistoricSession, quotesByTicker, simulation, simulationSnapshot, trackedTickers],
  );
  const trackedActionsByTicker = useMemo<Record<string, TradeRecommendation | null>>(
    () => {
      const next: Record<string, TradeRecommendation | null> = {};
      for (const ticker of trackedTickers) {
        const trackedQuote = quotesByTicker[ticker];
        if (!trackedQuote) {
          next[ticker] = null;
          continue;
        }

        const replayRead = replayReadsByTicker[ticker] ?? null;
        const trackedSignal =
          isHistoricSession
            ? replayRead?.signal ?? trackedQuote.signal ?? null
            : trackedQuote.signal ?? null;
        if (!trackedSignal) {
          next[ticker] = null;
          continue;
        }

        const trackedConfidence =
          isHistoricSession
            ? replayRead?.confidence ?? trackedQuote.confidence ?? 0
            : trackedQuote.confidence ?? 0;
        const trackedChangePercent =
          isHistoricSession
            ? historicDisplaysByTicker[ticker]?.changePercent ?? trackedQuote.changePercent ?? 0
            : trackedQuote.changePercent ?? 0;
        const report = newsReportsByTicker[ticker];

        next[ticker] =
          report?.recommendedAction ??
          deriveTradeRecommendation({
            signal: trackedSignal,
            confidence: trackedConfidence,
            sentiment: report?.newsSentiment ?? trackedQuote.newsSentiment ?? null,
            changePercent: trackedChangePercent,
          });
      }
      return next;
    },
    [
      trackedTickers,
      quotesByTicker,
      replayReadsByTicker,
      isHistoricSession,
      historicDisplaysByTicker,
      newsReportsByTicker,
    ],
  );
  const selectedReplayRead =
    isHistoricSession && selectedTicker
      ? replayReadsByTicker[selectedTicker] ?? null
      : null;
  const displayedSignal = isHistoricSession
    ? selectedReplayRead?.signal ?? quote?.signal ?? null
    : quote?.signal ?? null;
  const displayedConfidence = isHistoricSession
    ? selectedReplayRead?.confidence ?? quote?.confidence ?? 0
    : quote?.confidence ?? 0;
  const displayedSelectedPrice =
    isHistoricSession
      ? selectedHistoricDisplay?.lastPrice ?? selectedSimPrice
      : quote?.lastPrice ?? null;
  const displayedSelectedChangePercent =
    isHistoricSession
      ? selectedHistoricDisplay?.changePercent ?? quote?.changePercent ?? 0
      : quote?.changePercent ?? 0;
  const selectedPriceMetricLabel = isHistoricSession ? "Replay price" : "Latest price";
  const selectedMoveMetricLabel = isHistoricSession ? "Replay move" : "Today's move";
  const selectedUpdateMetricLabel = isHistoricSession ? "Replay clock" : "Live update";
  const selectedUpdateMetricValue =
    isHistoricSession && simulationSnapshot
      ? new Date(simulationSnapshot.time).toLocaleTimeString()
      : lastTickAt
        ? new Date(lastTickAt).toLocaleTimeString()
        : "-";
  const displayedAction = displayedSignal
    ? newsReport?.recommendedAction ??
      deriveTradeRecommendation({
        signal: displayedSignal,
        confidence: displayedConfidence,
        sentiment: newsReport?.newsSentiment ?? quote?.newsSentiment ?? null,
        changePercent: displayedSelectedChangePercent,
      })
    : null;
  const displayedToneSignal =
    displayedAction != null
      ? recommendationToSignal(displayedAction)
      : displayedSignal;
  const showDisplayPriceLoading =
    quotesLoading && (!isHistoricSession || displayedSelectedPrice == null);
  const shouldShowHistoricPracticeChart =
    isHistoricSession && Boolean(simulationSnapshot && simulationTimeline.length > 1);

  const simulationMarkers = useMemo(
    () =>
      (simulation?.trades ?? [])
        .filter((trade) => trade.symbol === selectedSimPriceSymbol)
        .map((trade) => ({
          time: trade.timestamp,
          price: trade.price,
          label: `${trade.type === "buy" ? "Buy" : "Sell"} ${trade.shares}`,
          kind: trade.type,
        })),
    [selectedSimPriceSymbol, simulation],
  );

  return (
    <div className="flex max-w-6xl flex-col gap-4 text-slate-100">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-white">
            Trade
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Track up to three stocks on one live stream with paper trading controls.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span
            suppressHydrationWarning
            title={
              tradingTimeMode === "historic"
                ? "Simulated session time (historic mode)"
                : "Current local time"
            }
            className={`rounded-full border px-3 py-1 ${
              tradingTimeMode === "historic"
                ? "border-amber-500/35 bg-amber-950/50 text-amber-100"
                : "border-slate-700 bg-slate-950/70 text-slate-300"
            }`}
          >
            {tradingTimeMode === "historic" ? (
              <span className="font-semibold text-amber-200/90">Sim </span>
            ) : null}
            {currentTime}
          </span>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            {marketStatusLine}
            {tradingTimeMode !== "historic" && marketSnapshot.isOpen
              ? ` | IEX: ${liveFeedLabel}`
              : null}
          </p>
        </div>

        <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Experience view
              <InfoHint label="Simple keeps this page beginner-friendly. Advanced shows all detailed metrics and logs." />
            </span>
            <select
              value={uiMode}
              onChange={(e) => setUiMode(e.target.value as TradeUiMode)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="simple">Simple</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              How you want to practice
              <InfoHint label="Choose whether you want to make the paper decisions yourself or let TradeWise handle the paper trades for you." />
            </span>
            <select
              value={tradeMode}
              onChange={(e) => setTradeMode(e.target.value as TradeMode)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="manual">{TRADE_MODE_LABELS.manual}</option>
              <option value="model">{TRADE_MODE_LABELS.model}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Risk style
              <InfoHint label="Safe reacts more carefully, Neutral stays balanced, and Risky responds more aggressively to market moves." />
            </span>
            <select
              value={modelProfile}
              onChange={(e) => setModelProfile(e.target.value as ModelProfile)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="safe">Safe</option>
              <option value="neutral">Neutral</option>
              <option value="risky">Risky</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Check-ins
              <InfoHint label="This is how often TradeWise checks the model and, if enabled, decides whether to place a paper trade." />
            </span>
            <select
              value={refreshCadence}
              onChange={(e) => setRefreshCadence(e.target.value as RefreshCadence)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="1m">1 minute</option>
              <option value="5m">5 minutes</option>
              <option value="15m">15 minutes</option>
            </select>
          </label>
        </section>
      </section>

      <section id="trade-setup" className="w-full">
        <TradeStarterSectors />
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Trade activity
            </p>
            <p className="mt-1 text-sm text-slate-400">
              This log shows the latest paper buys, sells, and holds TradeWise has made.
            </p>
            {!paperTradeLog.length ? (
              <p className="mt-2 text-sm text-slate-400">
                No paper trades yet. Turn on paper trading or run a check to start the log.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-slate-300">
              {paperTradeStats.total} entries
            </span>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">
              {paperTradeStats.buys} buys
            </span>
            <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-rose-300">
              {paperTradeStats.sells} sells
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-slate-300">
              {paperTradeStats.holds} holds
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tradeMode === "model" ? (
            <button
              type="button"
              onClick={() => void loadMockTradingDay()}
              disabled={mockTradingLoading || !selectedTicker}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-60"
            >
              {mockTradingLoading ? "Loading..." : "Replay a practice day"}
            </button>
          ) : null}
        </div>

        {paperTradeLog.length ? (
          <div className="mt-4 max-h-72 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/70">
            <ul className="divide-y divide-slate-800/70">
              {paperTradeLog.map((entry) => (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-mono text-sm font-semibold text-white">
                      {entry.ticker}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        ACTION_BADGES[entry.action]
                      }`}
                    >
                      {ACTION_LABELS[entry.action]}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        SIGNAL_BADGES[entry.signal]
                      }`}
                    >
                      {SIGNAL_LABELS[entry.signal]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    {entry.submitted
                      ? entry.statusMessage
                      : `No paper trade placed. ${entry.statusMessage}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Risk style: {MODEL_PROFILE_LABELS[entry.modelProfile]} | Confidence:{" "}
                    {entry.confidence.toFixed(1)}%
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {isHistoricSession ? "Practice replay" : "Live tracking"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {isHistoricSession
                ? "This page now replays the tracked symbols against the simulated session clock."
                : "This page refreshes the tracked symbols automatically while the market is open."}
            </p>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          {isAdvancedView
            ? `Mode: ${TRADE_MODE_LABELS[tradeMode]}. Risk style: ${MODEL_PROFILE_LABELS[modelProfile]}. Check-ins: ${CADENCE_LABELS[refreshCadence]}. Tracking ${trackedTickers.length}/${MAX_TRACKED_TICKERS} symbols.`
            : "Simple view is on: showing beginner-friendly guidance with less data clutter."}
        </p>
        {quotesLoading ? (
          <p className="mt-2 inline-flex items-center gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
            <span
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-indigo-400/40 border-t-indigo-200"
              aria-hidden
            />
            Loading market data for prices and charts…
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
        ) : null}
        {mockTradingError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {mockTradingError}
          </p>
        ) : null}
        {autoTradeError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {autoTradeError}
          </p>
        ) : null}
        {paperAccountError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {paperAccountError}
          </p>
        ) : null}
        {streamError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {streamError}
          </p>
        ) : null}
        {newsReportError ? (
          <p className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {newsReportError}
          </p>
        ) : null}
      </section>

      {trackedTickers.length ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Tracked symbols
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                One shared stream updates every symbol below. Select a card to focus the detail view.
              </p>
            </div>
            {isAdvancedView ? (
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                {trackedTickers.length}/{MAX_TRACKED_TICKERS} slots used
              </p>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {trackedTickers.map((ticker) => {
              const trackedQuote = quotesByTicker[ticker];
              const trackedHistoricDisplay = historicDisplaysByTicker[ticker] ?? null;
              const trackedReplayRead = replayReadsByTicker[ticker] ?? null;
              const trackedSignal =
                isHistoricSession
                  ? trackedReplayRead?.signal ?? trackedQuote?.signal ?? null
                  : trackedQuote?.signal ?? null;
              const trackedConfidence =
                isHistoricSession
                  ? trackedReplayRead?.confidence ?? trackedQuote?.confidence
                  : trackedQuote?.confidence;
              const trackedAction = trackedActionsByTicker[ticker] ?? null;
              const isSelected = ticker === selectedTicker;
              return (
                <div
                  key={ticker}
                  className={`rounded-2xl border p-3 transition ${
                    isSelected
                      ? "border-indigo-500/60 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.12)]"
                      : "border-slate-800 bg-slate-950/70"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectTrackedTicker(ticker)}
                    className="w-full text-left"
                  >
                    <StockCard
                      quote={trackedQuote}
                      ticker={ticker}
                      lastPrice={
                        isHistoricSession
                          ? trackedHistoricDisplay?.lastPrice
                          : undefined
                      }
                      changePercent={
                        isHistoricSession
                          ? trackedHistoricDisplay?.changePercent
                          : undefined
                      }
                      compact
                      isPriceLoading={
                        quotesLoading &&
                        (!isHistoricSession || trackedHistoricDisplay == null)
                      }
                    />
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {trackedAction ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            RECOMMENDATION_BADGES[trackedAction]
                          }`}
                        >
                          {RECOMMENDATION_LABELS[trackedAction]}
                          {isAdvancedView
                            ? ` • ${
                                trackedConfidence?.toFixed(1) ?? "-"
                              }%`
                            : ""}
                        </span>
                      ) : trackedSignal ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            SIGNAL_BADGES[trackedSignal]
                          }`}
                        >
                          {SIGNAL_LABELS[trackedSignal]}
                          {isAdvancedView
                            ? ` • ${trackedConfidence?.toFixed(1) ?? "-"}%`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Loading quote...
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-300">
                          Selected
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeTrackedTicker(ticker)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {quote ? (
        <section className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <StockCard
              quote={quote}
              lastPrice={isHistoricSession ? displayedSelectedPrice ?? undefined : undefined}
              changePercent={
                isHistoricSession ? displayedSelectedChangePercent : undefined
              }
              isPriceLoading={showDisplayPriceLoading}
            />

            {tradeMode === "manual" ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-slate-950/20">
                <h2 className="text-sm font-semibold text-white">
                  Self-directed practice
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Use this mode if you want to compare your own call with the model before
                  risking real money.
                </p>
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Shares
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={manualShares}
                    onChange={(e) =>
                      setManualShares(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => simulateOrder("buy", manualShares)}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Practice buy
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateOrder("sell", manualShares)}
                    className="flex-1 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/15"
                  >
                    Practice sell
                  </button>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-slate-950/20">
                <div className="flex items-start gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      TradeWise-guided practice
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      TradeWise can watch {trackedTickerSummary} for you and make
                      paper-only decisions while this page stays open.
                    </p>
                  </div>
                </div>
                {isAdvancedView ? (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Risk style
                        <InfoHint label="This is the personality of the model you picked: cautious, balanced, or aggressive." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {MODEL_PROFILE_LABELS[modelProfile]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Check-ins
                        <InfoHint label="How often TradeWise pauses to reevaluate the stock and decide whether to paper buy, paper sell, or wait." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {CADENCE_LABELS[refreshCadence]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        When it runs
                        <InfoHint label="The automatic checks happen while the market is open and this page is open in your browser." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        Market hours
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Live price feed
                        <InfoHint label="This feed keeps the price moving so the chart and price card stay current between model check-ins." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {!marketSnapshot.isOpen
                          ? "Paused until market open"
                          : streamConnected
                            ? "Live IEX stream is on"
                            : "Connecting to the IEX stream"}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        What it is doing
                        <InfoHint label="This tells you whether TradeWise is actively checking the model right now or waiting for the next market session." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {marketSnapshot.isOpen
                          ? `Checking every ${CADENCE_LABELS[refreshCadence]}`
                          : "Waiting for the next session"}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  {marketSnapshot.isOpen
                    ? autoTradeEnabled
                      ? `Paper trading is on. TradeWise will keep checking ${trackedTickerSummary} every ${CADENCE_LABELS[refreshCadence]}.`
                      : "The live price feed is ready. Turn on paper trading when you want TradeWise to handle the practice calls."
                    : "The market is closed right now, so live prices and paper trades stay paused until the next trading session."}
                </p>
                {isAdvancedView ? (
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Paper account snapshot
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {tradingTimeMode === "historic" && simulationSnapshot
                        ? `$${simulationSnapshot.cash.toFixed(2)} cash • ${simulationSnapshot.positions.length} open position${
                            simulationSnapshot.positions.length === 1 ? "" : "s"
                          } (historic session)`
                        : paperAccountLoading && !paperAccount
                          ? "Loading account..."
                          : paperAccount
                            ? `$${paperAccount.cash.toFixed(2)} cash • ${paperAccount.positions.length} open position${
                                paperAccount.positions.length === 1 ? "" : "s"
                              }`
                            : "No account snapshot yet."}
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoTradeEnabled((current) => !current)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      autoTradeEnabled
                        ? "bg-rose-500 text-white hover:bg-rose-400"
                        : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    }`}
                  >
                    {autoTradeEnabled ? "Pause paper trading" : "Start paper trading"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAutoTrade()}
                    disabled={autoTradeLoading}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-60"
                  >
                    {autoTradeLoading ? "Checking..." : "Check once now"}
                  </button>
                </div>
                {autoTradeResult ? (
                  <p className="mt-3 text-sm text-slate-400">
                    Most recent paper move: {ACTION_LABELS[autoTradeResult.action]}.{" "}
                    {autoTradeResult.statusMessage}
                  </p>
                ) : null}
              </section>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {displayedSignal ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg shadow-slate-950/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      What TradeWise suggests right now
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      A quick read for {quote.ticker} based on the latest data this page has
                      seen.
                    </p>
                  </div>
                  {displayedAction ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        RECOMMENDATION_BADGES[displayedAction]
                      }`}
                    >
                      {RECOMMENDATION_LABELS[displayedAction]}
                    </span>
                  ) : null}
                </div>

                {isAdvancedView ? (
                  <>
                    <ConfidenceMeter
                      confidence={displayedConfidence}
                      signal={displayedToneSignal ?? displayedSignal}
                    />
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        Risk style
                        <InfoHint label="This is the version of TradeWise you picked at the top of the page." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {MODEL_PROFILE_LABELS[activeProfile]}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        {selectedPriceMetricLabel}
                        <InfoHint label="The most recent price the page has for this stock." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {showDisplayPriceLoading ? (
                          <QuotePriceLoadingLabel />
                        ) : displayedSelectedPrice == null ? (
                          "-"
                        ) : (
                          `$${displayedSelectedPrice.toFixed(2)}`
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        {selectedMoveMetricLabel}
                        <InfoHint label="This shows how much the price has moved in percentage terms over the latest visible window." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {showDisplayPriceLoading ? (
                          <QuotePriceLoadingLabel />
                        ) : (
                          <>
                            {displayedSelectedChangePercent >= 0 ? "+" : ""}
                            {displayedSelectedChangePercent.toFixed(2)}%
                          </>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                        {selectedUpdateMetricLabel}
                        <InfoHint label="This is the time of the last live price update from the streaming feed." />
                      </dt>
                      <dd className="mt-1 font-semibold text-white">
                        {selectedUpdateMetricValue}
                      </dd>
                    </div>
                    </dl>
                  </>
                ) : (
                  <>
                    <ConfidenceMeter
                      confidence={displayedConfidence}
                      signal={displayedToneSignal ?? displayedSignal}
                    />
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      Quick take: TradeWise currently favors {recommendationPhrase(displayedAction ?? "hold")} on {quote.ticker}. Switch to Advanced view for more timing and market context.
                    </p>
                  </>
                )}

                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Why this action
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {newsReportLoading ? (
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Refreshing
                        </span>
                      ) : null}
                      {reasoningSourceLabel ? (
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                          {reasoningSourceLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {showDisplayPriceLoading ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <QuotePriceLoadingLabel className="text-indigo-200" />
                        <span className="text-slate-500">
                          Price data is updating after your last change (e.g. historic mode).
                        </span>
                      </span>
                    ) : (
                      <>
                        Quick take: TradeWise currently favors{" "}
                        {recommendationPhrase(displayedAction ?? "hold")} on {quote.ticker}. Switch to
                        Advanced view for confidence and timing metrics.
                      </>
                    )}
                    {tradeDecisionExplanation
                      ?? `TradeWise would ${displayedAction ?? "hold"} ${quote.ticker} based on the latest signal, confidence, and news mix. Refresh the live news report to load the latest buy, sell, or hold explanation.`}
                  </p>
                </div>

                <TradeTickerNewsReport
                  quote={quote}
                  newsReport={newsReport}
                  newsReportLoading={newsReportLoading}
                  onRefresh={() => void loadNewsReport({ forceRefresh: true, showLoading: true })}
                  isAdvancedView={isAdvancedView}
                  refreshCadence={refreshCadence}
                />
              </section>
            ) : null}

            {shouldShowHistoricPracticeChart && simulationSnapshot ? (
              <LiveLineChart
                points={simulationTimeline}
                ticker={selectedSimPriceSymbol}
                title="Practice session timeline"
                subtitle={`Historical replay reveals the last ${historicReplayWindowHours} hours as the simulated clock advances.`}
                currentTime={simulationSnapshot.time}
                revealUntilTime={simulationSnapshot.time}
                markers={simulationMarkers}
              />
            ) : quotesLoading ? (
              <section className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/20">
                <QuotePriceLoadingLabel className="text-sm font-medium text-indigo-200" />
                <p className="text-center text-xs text-slate-500">
                  Chart will appear when fresh prices arrive.
                </p>
              </section>
            ) : quote.history?.length ? (
              <LiveLineChart history={quote.history} ticker={quote.ticker} />
            ) : quote.chartDataUri ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-slate-950/20">
                <Image
                  src={quote.chartDataUri}
                  alt={`${quote.ticker} synthetic price chart`}
                  width={960}
                  height={320}
                  unoptimized
                  className="h-auto w-full rounded-xl"
                />
              </section>
            ) : null}

            {simulationSnapshot ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Simulation snapshot
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => advanceSimulationTime(-1)}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      -1 step
                    </button>
                    <button
                      type="button"
                      onClick={() => advanceSimulationTime(1)}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      +1 step
                    </button>
                    <button
                      type="button"
                      onClick={resetSimulationTime}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      Latest
                    </button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Simulation time
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {new Date(simulationSnapshot.time).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Current price
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      {showDisplayPriceLoading ? (
                        <QuotePriceLoadingLabel className="text-zinc-500 dark:text-zinc-400" />
                      ) : displayedSelectedPrice == null ? (
                        "-"
                      ) : (
                        `$${displayedSelectedPrice.toFixed(2)}`
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Portfolio value
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      ${simulationSnapshot.portfolioValue.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Cash
                    </dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                      ${simulationSnapshot.cash.toFixed(2)}
                    </dd>
                  </div>
                </dl>
                {!isHistoricSession ? (
                  <div className="mt-4">
                    <LiveLineChart
                      points={simulationTimeline}
                      ticker={selectedSimPriceSymbol}
                      title="Simulation timeline"
                      subtitle="The dashed cursor shows the exact replay moment for the selected stock."
                      currentTime={simulationSnapshot.time}
                      revealUntilTime={simulationSnapshot.time}
                      markers={simulationMarkers}
                    />
                  </div>
                ) : null}
                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Positions
                  </p>
                  {simulationSnapshot.positions.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {simulationSnapshot.positions.map((position) => (
                        <li key={position.symbol}>
                          {position.symbol}: {position.shares} shares @ $
                          {position.price.toFixed(2)} = ${position.value.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      No open positions yet.
                    </p>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-6 shadow-lg shadow-slate-950/20">
          <h2 className="text-sm font-semibold text-white">
            Load a trade basket first
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Use the starter sectors to load up to three stocks, then review the basket, replay a practice day, or let TradeWise paper trade it for you.
          </p>
          <Link
            href="#trade-setup"
            className="mt-3 inline-flex rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-indigo-400"
          >
            Open setup tools
          </Link>
        </section>
      )}

      {lastAction ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {lastAction}
        </p>
      ) : null}

      {mockTradingDay && isAdvancedView ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-slate-950/20">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Practice replay
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                A dress rehearsal using recent market history so you can see how the model
                would have behaved before trying a live paper-trading day.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {mockTradingDay.sessionLabel}
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Model build
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                {mockTradingDay.modelVersion}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Risk style
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                {MODEL_PROFILE_LABELS[mockTradingDay.modelProfile]}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Starting cash
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                ${mockTradingDay.summary.startingCash.toFixed(2)}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Ending value
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                ${mockTradingDay.summary.endingEquity.toFixed(2)}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Return
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                {mockTradingDay.summary.returnPercent >= 0 ? "+" : ""}
                {mockTradingDay.summary.returnPercent.toFixed(2)}%
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                Paper moves
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">
                {mockTradingDay.summary.buys} buy / {mockTradingDay.summary.sells} sell
              </dd>
            </div>
          </dl>

          <details className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white">
              Show the step-by-step replay
            </summary>
            <div className="max-h-80 overflow-auto border-t border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-900">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Step</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Signal</th>
                    <th className="px-3 py-2">Paper move</th>
                    <th className="px-3 py-2">Practice balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {mockTradingDay.steps.map((step) => (
                    <tr key={`${step.slot}-${step.sourceDate}`}>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {step.slot}
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {step.sourceDate}
                      </td>
                      <td className="px-3 py-2 text-white">
                        ${step.price.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            SIGNAL_BADGES[step.signal]
                          }`}
                        >
                          {SIGNAL_LABELS[step.signal]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            ACTION_BADGES[step.action]
                          }`}
                        >
                          {ACTION_LABELS[step.action]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-white">
                        ${step.equity.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="mt-3 text-xs text-slate-500">
            Source: {mockTradingDay.datasetSource}
          </p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={clearPaperTradeLog}
        className="self-start rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
      >
        Clear trade log
      </button>

      <AiDisclaimer />
    </div>
  );
}
