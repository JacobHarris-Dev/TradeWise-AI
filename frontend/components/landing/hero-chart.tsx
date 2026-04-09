"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const chartData = [
  { time: "9:30", price: 184.1 },
  { time: "10:00", price: 183.7 },
  { time: "10:30", price: 184.8 },
  { time: "11:00", price: 184.3 },
  { time: "11:30", price: 185.4 },
  { time: "12:00", price: 186.1 },
  { time: "12:30", price: 185.7 },
  { time: "13:00", price: 186.9 },
  { time: "13:30", price: 186.4 },
  { time: "14:00", price: 187.3 },
  { time: "14:30", price: 188.2 },
  { time: "15:00", price: 187.8 },
  { time: "15:30", price: 188.9 },
];

export function LandingHeroChart() {
  return (
    <div className="mt-8 h-[260px] w-full rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.55))] p-4 sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
        >
          <defs>
            <linearGradient id="landing-price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              borderColor: "#dbe2ea",
              borderRadius: "14px",
              boxShadow: "0 16px 40px -20px rgba(15, 23, 42, 0.28)",
              color: "#0f172a",
            }}
            labelStyle={{ color: "#64748b", fontWeight: 600 }}
            itemStyle={{ color: "#047857", fontWeight: 700 }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="#10b981"
            strokeWidth={3}
            fill="url(#landing-price-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
