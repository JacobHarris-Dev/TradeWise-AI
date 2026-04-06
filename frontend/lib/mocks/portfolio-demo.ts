/**
 * Demo portfolio totals and time-series for charts.
 * Replace with API / Firestore when you have real history.
 */

import { MOCK_HOLDINGS, getMockStockQuote } from "@/lib/mocks/stock-data";

export type PortfolioTimeRange = "1d" | "1w" | "1m" | "6m" | "1y" | "all";

export type PortfolioPosition = {
  ticker: string;
  shares: number;
  price: number;
  value: number;
  pct: number;
};

export function getPortfolioPositions(): PortfolioPosition[] {
  const rows = MOCK_HOLDINGS.map((h) => {
    const q = getMockStockQuote(h.ticker);
    const value = Math.round(q.lastPrice * h.shares * 100) / 100;
    return { ticker: h.ticker, shares: h.shares, price: q.lastPrice, value, pct: 0 };
  });
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows.map((r) => ({
    ...r,
    pct: total > 0 ? Math.round((r.value / total) * 1000) / 10 : 0,
  }));
}

export function getPortfolioTotal(): number {
  return getPortfolioPositions().reduce((s, r) => s + r.value, 0);
}

/** Synthetic history ending at `endValue` (smooth uptrend + small wobble). */
export function portfolioHistoryForRange(
  range: PortfolioTimeRange,
  endValue: number,
): { label: string; value: number }[] {
  const meta: Record<
    PortfolioTimeRange,
    { n: number; labels: string[] }
  > = {
    "1d": {
      n: 13,
      labels: [
        "6a",
        "8a",
        "10a",
        "12p",
        "2p",
        "4p",
        "6p",
        "8p",
        "10p",
        "12a",
        "2a",
        "4a",
        "Now",
      ],
    },
    "1w": {
      n: 7,
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
    "1m": {
      n: 10,
      labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "Now"],
    },
    "6m": {
      n: 12,
      labels: [
        "J",
        "F",
        "M",
        "A",
        "M",
        "J",
        "J",
        "A",
        "S",
        "O",
        "N",
        "Now",
      ],
    },
    "1y": {
      n: 12,
      labels: [
        "J",
        "F",
        "M",
        "A",
        "M",
        "J",
        "J",
        "A",
        "S",
        "O",
        "N",
        "Now",
      ],
    },
    all: {
      n: 8,
      labels: ["Y1", "Y2", "Y3", "Y4", "Y5", "Y6", "Y7", "Now"],
    },
  };

  const { n, labels } = meta[range];
  const startRatio = 0.82 + (range === "1d" ? 0.06 : 0);
  const startValue = endValue * startRatio;
  const out: { label: string; value: number }[] = [];

  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 1 : i / (n - 1);
    const base = startValue + (endValue - startValue) * t;
    const wobble = Math.sin(i * 1.73 + n * 0.31) * endValue * 0.015;
    const raw = i === n - 1 ? endValue : base + wobble;
    out.push({
      label: labels[i] ?? `${i + 1}`,
      value: Math.round(raw * 100) / 100,
    });
  }

  return out;
}

export function portfolioPercentChange(
  range: PortfolioTimeRange,
  endValue: number,
): number {
  const series = portfolioHistoryForRange(range, endValue);
  if (series.length < 2) return 0;
  const first = series[0].value;
  if (first <= 0) return 0;
  return Math.round(((endValue - first) / first) * 10000) / 100;
}
