"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  markers?: ChartMarker[];
};

type SeriesPoint = {
  time: string;
  label: string;
  fullLabel: string;
  price: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTimeLabel(raw: string) {
  if (/^\d+$/.test(raw)) {
    return `Step ${Number(raw) + 1}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildHistorySeries(history: number[]): SeriesPoint[] {
  return history.map((price, index) => {
    const label = `Step ${index + 1}`;
    return {
      time: String(index),
      label,
      fullLabel: label,
      price,
    };
  });
}

function buildTimelineSeries(points: ChartPoint[]): SeriesPoint[] {
  return points.map((point) => ({
    time: point.time,
    label: formatTimeLabel(point.time),
    fullLabel: new Date(point.time).toLocaleString(),
    price: point.price,
  }));
}

function resolveCursorPoint(series: SeriesPoint[], currentTime?: string | null) {
  if (!series.length) {
    return null;
  }

  if (!currentTime) {
    return series[series.length - 1] ?? null;
  }

  const exact = series.find((point) => point.time === currentTime);
  if (exact) {
    return exact;
  }

  const resolved = series
    .filter((point) => point.time <= currentTime)
    .slice(-1)[0];

  return resolved ?? series[0] ?? null;
}

function resolveMarkerPoint(series: SeriesPoint[], marker: ChartMarker) {
  const exact = series.find((point) => point.time === marker.time);
  if (exact) {
    return exact;
  }

  const resolved = series
    .filter((point) => point.time <= marker.time)
    .slice(-1)[0];

  return resolved ?? null;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SeriesPoint }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-slate-100">{point.fullLabel}</p>
      <p className="text-emerald-400">{formatCurrency(point.price)}</p>
    </div>
  );
}

export function LiveLineChart({
  history,
  points,
  ticker,
  title = "Price trend",
  subtitle = `Moves with incoming market updates for ${ticker}.`,
  currentTime,
  markers = [],
}: LiveLineChartProps) {
  const series = useMemo(() => {
    if (points?.length) {
      return buildTimelineSeries(points);
    }
    if (history?.length) {
      return buildHistorySeries(history);
    }
    return [];
  }, [history, points]);

  const min = useMemo(
    () => (series.length ? Math.min(...series.map((point) => point.price)) : 0),
    [series],
  );
  const max = useMemo(
    () => (series.length ? Math.max(...series.map((point) => point.price)) : 0),
    [series],
  );
  const up = series.length > 1 ? series[series.length - 1].price >= series[0].price : true;
  const cursorPoint = useMemo(
    () => resolveCursorPoint(series, currentTime),
    [currentTime, series],
  );
  const markerPoints = useMemo(
    () =>
      markers
        .map((marker) => {
          const resolved = resolveMarkerPoint(series, marker);
          if (!resolved) {
            return null;
          }

          return {
            ...marker,
            resolved,
          };
        })
        .filter(
          (marker): marker is ChartMarker & { resolved: SeriesPoint } => Boolean(marker),
        ),
    [markers, series],
  );

  if (series.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-10 text-center text-sm text-slate-400">
        Not enough history to draw a live chart for {ticker}.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-slate-950/20">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-right">
          <div className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Range {formatCurrency(min)} - {formatCurrency(max)}
          </div>
          {cursorPoint ? (
            <div className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-300">
              Cursor {cursorPoint.fullLabel}
            </div>
          ) : null}
          {markerPoints.length ? (
            <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              {markerPoints.length} trade marker{markerPoints.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="h-[320px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tradewise-line-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={up ? "#34d399" : "#fb7185"}
                  stopOpacity="0.28"
                />
                <stop
                  offset="100%"
                  stopColor={up ? "#34d399" : "#fb7185"}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(value) => formatCurrency(Number(value))}
              domain={["dataMin - 0.5", "dataMax + 0.5"]}
            />
            <Tooltip content={<ChartTooltip />} />

            {cursorPoint ? (
              <ReferenceLine
                x={cursorPoint.label}
                stroke="#818cf8"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            ) : null}

            <Area
              type="monotone"
              dataKey="price"
              stroke={up ? "#34d399" : "#fb7185"}
              strokeWidth={2.5}
              fill="url(#tradewise-line-fill)"
              dot={{ r: 2.5, fill: up ? "#34d399" : "#fb7185", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#fff", stroke: up ? "#10b981" : "#f43f5e", strokeWidth: 2 }}
            />

            {cursorPoint ? (
              <ReferenceDot
                x={cursorPoint.label}
                y={cursorPoint.price}
                r={7}
                fill="#818cf8"
                stroke="#fff"
                strokeWidth={2}
                isFront
              />
            ) : null}

            {markerPoints.map((marker, index) => (
              <ReferenceDot
                key={`${marker.label}-${marker.time}-${index}`}
                x={marker.resolved.label}
                y={marker.price}
                r={5}
                fill={marker.kind === "buy" ? "#34d399" : "#fb7185"}
                stroke="#0f172a"
                strokeWidth={2}
                isFront
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            Latest point
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {formatCurrency(series[series.length - 1].price)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            Lowest point
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(min)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            Highest point
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(max)}</p>
        </div>
      </div>
    </div>
  );
}
