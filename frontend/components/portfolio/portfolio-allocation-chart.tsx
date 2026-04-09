"use client";

import { useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const COLORS = ["#059669", "#2563eb", "#7c3aed", "#d97706", "#db2777", "#0891b2"];

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

type PieDatum = { name: string; value: number; pct: number };
type AllocationRow = { ticker: string; value: number; pct?: number; shares?: number };
type PortfolioAllocationChartProps = {
  positions?: AllocationRow[];
  title?: string;
  description?: string;
  totalEquity?: number;
};

type TooltipProps = {
  active?: boolean;
  payload?: { payload: PieDatum }[];
};

function PieTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-slate-100">{row.name}</p>
      <p className="text-slate-400">{formatUsd(row.value)}</p>
      <p className="text-emerald-400">{row.pct}% of portfolio</p>
    </div>
  );
}

/**
 * Interactive donut: hover segments to emphasize slice + tooltip with % and value.
 */
function sliceColor(name: string, index: number) {
  if (name.toLowerCase() === "cash") {
    return "#52525b";
  }
  return COLORS[index % COLORS.length];
}

export function PortfolioAllocationChart({
  positions,
  title = "Allocation",
  description = "Hover a slice to see share of your portfolio",
  totalEquity,
}: PortfolioAllocationChartProps) {
  const sourceRows = useMemo(() => {
    const source = positions ?? [];
    return source.filter((row) => row.value > 0);
  }, [positions]);
  const data: PieDatum[] = useMemo(
    () => {
      const total = sourceRows.reduce((sum, row) => sum + row.value, 0);
      return sourceRows.map((row) => ({
        name: row.ticker,
        value: row.value,
        pct:
          row.pct ?? (total > 0 ? Math.round((row.value / total) * 1000) / 10 : 0),
      }));
    },
    [sourceRows],
  );

  const [active, setActive] = useState<number | undefined>(undefined);
  const resolvedTotalEquity = useMemo(
    () => totalEquity ?? data.reduce((sum, row) => sum + row.value, 0),
    [data, totalEquity],
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-0.5 text-sm text-slate-400">
        {description}
      </p>

      {data.length ? (
        <>
          <div className="relative mx-auto mt-2 h-70 w-full max-w-[320px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  isAnimationActive={false}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(undefined)}
                >
                  {data.map((row, i) => (
                    <Cell
                      key={row.name}
                      fill={sliceColor(row.name, i)}
                      stroke="#fff"
                      strokeWidth={2}
                      style={{
                        cursor: "pointer",
                        opacity: active === undefined || active === i ? 1 : 0.45,
                        transition: "opacity 0.15s ease",
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-center shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Total equity
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {formatUsd(resolvedTotalEquity)}
                </p>
              </div>
            </div>
          </div>

          <ul className="mt-2 space-y-2 border-t border-slate-800 pt-4">
            {data.map((d, i) => (
              <li
                key={d.name}
                className="flex items-center justify-between text-sm"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(undefined)}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: sliceColor(d.name, i) }}
                  />
                  <span className="font-mono font-medium text-slate-200">{d.name}</span>
                </span>
                <span className="text-slate-400">{d.pct}%</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Current holdings
            </p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {sourceRows.map((row) => (
                <li key={`${row.ticker}-holding`} className="flex items-center justify-between gap-2">
                  <span className="font-mono">{row.ticker}{row.shares ? ` • ${row.shares} sh` : ""}</span>
                  <span className="font-medium">{formatUsd(row.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 px-4 py-6 text-sm text-slate-500">
          No positions to chart yet.
        </div>
      )}
    </div>
  );
}
