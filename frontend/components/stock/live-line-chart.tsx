
"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

type ChartPoint = {
  time: string;
  price: number;
};

type ChartMarker = {
  time: string;
  price: number;
  label: string;
  kind: "buy" | "sell";
};

type LiveLineChartProps = {
  history?: number[];
  points?: ChartPoint[];
  ticker: string;
  title?: string;
  subtitle?: string;
  currentTime?: string | null;
  revealUntilTime?: string | null;
  markers?: ChartMarker[];
};

export function LiveLineChart({
  history,
  points,
  ticker,
  title = "Price trend",
  subtitle = "Moves with incoming market updates.",
  currentTime,
  revealUntilTime,
  markers = [],
}: LiveLineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const basePoints = useMemo(() => {
    if (points?.length) return points;
    const fallbackEndMs = history ? history.length * 15 * 60_000 : 0;
    if (history?.length) {
      return history.map((price, i) => ({
        time: new Date(fallbackEndMs - (history.length - i) * 15 * 60_000).toISOString(),
        price,
      }));
    }
    return [];
  }, [history, points]);

  const visibleData = useMemo(() => {
    const fallbackTargetTime = basePoints[basePoints.length - 1]?.time ?? null;
    const targetMs = revealUntilTime
      ? new Date(revealUntilTime).getTime()
      : new Date(currentTime ?? fallbackTargetTime ?? 0).getTime();

    const filtered = basePoints.filter(
      (p) => new Date(p.time).getTime() <= targetMs
    );
    if (!filtered.length) return [];

    const candles = [];
    const startClose = filtered[0].price;

    for (let i = 0; i < filtered.length; i++) {
      const point = filtered[i];
      const prevPrice = i > 0 ? filtered[i - 1].price : startClose;
      const currentPrice = point.price;

      // 15-min open is just previous close (or tiny offset for the very first bar)
      const open = i > 0 ? prevPrice : currentPrice - (currentPrice * 0.0005);
      const close = currentPrice;

      // Deterministic noise for wicks to make the mock practice timeline look like a realistic chart
      const diff = Math.abs(open - close);
      const noise = ((currentPrice * 100) % 7) * 0.05 * diff; 
      
      let high = Math.max(open, close) + noise;
      let low = Math.min(open, close) - noise;
      
      // If flat, give a tiny artificial tick
      if (high === low) {
          high += 0.01;
          low -= 0.01;
      }

      candles.push({
        time: Math.floor(new Date(point.time).getTime() / 1000) as Time,
        open,
        high,
        low,
        close,
      });
    }

    // Deduplicate and strictly sort identically by time
    const deduped: CandlestickData<Time>[] = [];
    const seen = new Set();
    candles.sort((a, b) => (a.time as number) - (b.time as number)).forEach((c) => {
      if (!seen.has(c.time)) {
        seen.add(c.time);
        deduped.push(c);
      }
    });

    return deduped;
  }, [basePoints, revealUntilTime, currentTime]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.4)" },
        horzLines: { color: "rgba(30, 41, 59, 0.4)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelBackgroundColor: "#1e293b", color: "#475569" },
        horzLine: { labelBackgroundColor: "#1e293b", color: "#475569" },
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true, 
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    seriesRef.current = candlestickSeries;
    markersRef.current = createSeriesMarkers(candlestickSeries, []);

    return () => {
      markersRef.current?.detach();
      markersRef.current = null;
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(visibleData as CandlestickData<Time>[]);

      if (chartRef.current && visibleData.length > 0) {
        chartRef.current.timeScale().fitContent();
      }

      if (markersRef.current) {
        const markerCandidates: Array<SeriesMarker<Time> | null> = markers.length
          ? markers
          .map((m) => {
            const mTime = Math.floor(new Date(m.time).getTime() / 1000);
            let match = visibleData[0];
            let minDiff = Infinity;
            for (const v of visibleData) {
              const diff = Math.abs((v.time as number) - mTime);
              if (diff < minDiff) {
                minDiff = diff;
                match = v;
              }
            }
            if (!match) return null;
            return {
              time: match.time as Time,
              position: m.kind === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
              color: m.kind === "buy" ? "#3b82f6" : "#d946ef",
              shape: m.kind === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
              text: m.label,
              size: 1,
            };
          })
          : [];
        const lightweightMarkers = markerCandidates.filter(
          (marker): marker is SeriesMarker<Time> => marker !== null,
        );

        lightweightMarkers.sort((a, b) => (a.time as number) - (b.time as number));
        const dedupedMarkers: SeriesMarker<Time>[] = [];
        const seenMarkers = new Set<number>();
        lightweightMarkers.forEach((marker) => {
          const key = marker.time as number;
          if (seenMarkers.has(key)) {
            return;
          }
          seenMarkers.add(key);
          dedupedMarkers.push(marker);
        });

        markersRef.current.setMarkers(dedupedMarkers);
      }
    }
  }, [visibleData, markers]);

  const lastPoint = visibleData.length ? visibleData[visibleData.length - 1] : null;
  const isUp = lastPoint && lastPoint.close >= lastPoint.open;

  return (
    <div className="flex h-full min-h-100 flex-col rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl">
      <div className="flex items-start justify-between border-b border-slate-800 p-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-200">
            {title}
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-bold text-slate-300">
              {ticker}
            </span>
          </h3>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        {lastPoint && (
          <div className="text-right">
            <div className={`font-mono text-lg font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              ${lastPoint.close.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500">Active Close</div>
          </div>
        )}
      </div>
      <div className="relative h-full min-h-75 flex-1 p-4">
        <div ref={chartContainerRef} className="absolute inset-x-4 inset-y-4" />
      </div>
    </div>
  );
}
