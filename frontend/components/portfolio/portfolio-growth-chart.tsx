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

type TooltipPayload = {
  payload?: { label: string; value: number };
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
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-zinc-900">{p.label}</p>
      <p className="text-emerald-600">{formatUsd(p.value)}</p>
    </div>
  );
}

/**
 * Interactive portfolio value over time (mock series). Time-range pills update the chart.
 */
export function PortfolioGrowthChart() {
  const total = useMemo(() => getPortfolioTotal(), []);
  const [range, setRange] = useState<PortfolioTimeRange>("1m");
  const data = useMemo(
    () => portfolioHistoryForRange(range, total),
    [range, total],
  );
  const pctChange = useMemo(
    () => portfolioPercentChange(range, total),
    [range, total],
  );

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">Total portfolio value</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
            {formatUsd(total)}
          </p>
          <p
            className={`mt-1 text-sm font-medium ${
              pctChange >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {pctChange >= 0 ? "+" : ""}
            {pctChange.toFixed(2)}% <span className="font-normal text-zinc-500">in range</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                range === key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 h-[280px] w-full min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) =>
                v >= 1_000_000
                  ? `$${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000
                    ? `$${(v / 1000).toFixed(1)}k`
                    : `$${v}`
              }
              tick={{ fontSize: 11, fill: "#71717a" }}
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
