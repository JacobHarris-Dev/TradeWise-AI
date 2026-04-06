"use client";

import { useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { getPortfolioPositions } from "@/lib/mocks/portfolio-demo";

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

type TooltipProps = {
  active?: boolean;
  payload?: { payload: PieDatum }[];
};

function PieTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-zinc-900">{row.name}</p>
      <p className="text-zinc-600">{formatUsd(row.value)}</p>
      <p className="text-emerald-600">{row.pct}% of portfolio</p>
    </div>
  );
}

/**
 * Interactive donut: hover segments to emphasize slice + tooltip with % and value.
 */
export function PortfolioAllocationChart() {
  const positions = useMemo(() => getPortfolioPositions(), []);
  const data: PieDatum[] = useMemo(
    () =>
      positions.map((p) => ({
        name: p.ticker,
        value: p.value,
        pct: p.pct,
      })),
    [positions],
  );

  const [active, setActive] = useState<number | undefined>(undefined);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Allocation</h2>
      <p className="mt-0.5 text-sm text-zinc-500">
        Hover a slice to see share of your portfolio
      </p>

      <div className="relative mx-auto mt-2 h-[280px] w-full max-w-[320px]">
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
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(undefined)}
            >
              {data.map((_, i) => (
                <Cell
                  key={data[i].name}
                  fill={COLORS[i % COLORS.length]}
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
      </div>

      <ul className="mt-2 space-y-2 border-t border-zinc-100 pt-4">
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
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="font-mono font-medium text-zinc-800">{d.name}</span>
            </span>
            <span className="text-zinc-600">{d.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
