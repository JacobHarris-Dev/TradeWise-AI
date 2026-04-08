"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PaperAccountPerformancePoint } from "@/lib/mocks/stock-data";
import type { PortfolioTimeRange } from "@/lib/mocks/portfolio-demo";
import {
  getPortfolioTotal,
  portfolioHistoryForRange,
  portfolioPercentChange,
} from "@/lib/mocks/portfolio-demo";

const RANGES: { key: PortfolioTimeRange; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "all", label: "All" },
];

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type PortfolioGrowthChartProps = {
  totalValue?: number;
  title?: string;
  points?: PaperAccountPerformancePoint[];
  dayChange?: number;
  dayChangePercent?: number;
  updatedAt?: string;
};

type TooltipPayload = {
  payload?: { label: string; fullLabel?: string; value: number };
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-slate-100">{p.fullLabel ?? p.label}</p>
      <p className="text-emerald-400">{formatUsd(p.value)}</p>
    </div>
  );
}

/**
 * Interactive portfolio value over time (mock series). Time-range pills update the chart.
 */
export function PortfolioGrowthChart({
  totalValue,
  title = "Total portfolio value",
  points,
  dayChange,
  dayChangePercent,
  updatedAt,
}: PortfolioGrowthChartProps) {
  const demoTotal = useMemo(() => getPortfolioTotal(), []);
  const total = totalValue ?? demoTotal;
  const [range, setRange] = useState<PortfolioTimeRange>("1m");
  const liveData = useMemo(
    () =>
      points?.map((point) => {
        const date = new Date(point.timestamp);
        return {
          label: date.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
          fullLabel: date.toLocaleString(),
          value: point.totalEquity,
        };
      }) ?? [],
    [points],
  );
  const hasLiveIntradayData = liveData.length > 0;
  const data = useMemo(
    () => {
      if (hasLiveIntradayData && range === "1d") {
        return liveData;
      }

      return portfolioHistoryForRange(range, total);
    },
    [hasLiveIntradayData, liveData, range, total],
  );
  const firstValue = data[0]?.value ?? total;
  const resolvedDayChange = useMemo(
    () => {
      if (range === "1d" && hasLiveIntradayData) {
        return typeof dayChange === "number" ? dayChange : total - firstValue;
      }

      return total - firstValue;
    },
    [dayChange, firstValue, hasLiveIntradayData, range, total],
  );
  const pctChange = useMemo(
    () => {
      if (range === "1d" && hasLiveIntradayData) {
        return typeof dayChangePercent === "number"
          ? dayChangePercent
          : firstValue > 0
            ? Math.round(((total - firstValue) / firstValue) * 10000) / 100
            : 0;
      }

      return portfolioPercentChange(range, total);
    },
    [dayChangePercent, firstValue, hasLiveIntradayData, range, total],
  );
  const isLiveIntraday = hasLiveIntradayData && range === "1d";
  const changePrefix = resolvedDayChange >= 0 ? "+" : "-";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
            {formatUsd(total)}
          </p>
          <p
            className={`mt-1 text-sm font-medium ${
              pctChange >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {changePrefix}
            {formatUsd(Math.abs(resolvedDayChange))} ({changePrefix}
            {Math.abs(pctChange).toFixed(2)}%){" "}
            <span className="font-normal text-slate-500">
              {isLiveIntraday ? "today" : "in range"}
            </span>
          </p>
          {isLiveIntraday && updatedAt ? (
            <p className="mt-1 text-xs text-slate-500">
              Updated {new Date(updatedAt).toLocaleTimeString()}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasLiveIntradayData ? (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
              {range === "1d" ? "1D live" : "Live data available"}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {RANGES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  range === key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 h-70 w-full min-h-60 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v) =>
                v >= 1_000_000
                  ? `$${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000
                    ? `$${(v / 1000).toFixed(1)}k`
                    : `$${v}`
              }
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#059669"
              strokeWidth={2}
              fill="url(#portfolioFill)"
              dot={{ r: 3, fill: "#059669", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#047857", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
