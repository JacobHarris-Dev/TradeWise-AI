"use client";

type LiveLineChartProps = {
  history: number[];
  ticker: string;
};

export function LiveLineChart({ history, ticker }: LiveLineChartProps) {
  if (history.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-10 text-center text-sm text-slate-400">
        Not enough history to draw a live chart for {ticker}.
      </div>
    );
  }

  const width = 960;
  const height = 320;
  const padding = 20;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = Math.max(max - min, 1);

  const points = history
    .map((value, index) => {
      const x =
        padding + (index / Math.max(history.length - 1, 1)) * (width - padding * 2);
      const y =
        height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `${padding},${height - padding} ${points} ${
    width - padding
  },${height - padding}`;
  const up = history[history.length - 1] >= history[0];

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-slate-950/20">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            Price trend
          </p>
          <p className="text-xs text-slate-500">
            Moves with incoming market updates for {ticker}.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Range
          </p>
          <p className="text-sm font-semibold text-white">
            ${min.toFixed(2)} - ${max.toFixed(2)}
          </p>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full rounded-xl"
        role="img"
        aria-label={`${ticker} live line chart`}
      >
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
        <rect width={width} height={height} rx="18" fill="#020617" />
        <path d={`M ${areaPoints}`} fill="url(#tradewise-line-fill)" />
        <polyline
          fill="none"
          stroke={up ? "#34d399" : "#fb7185"}
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
    </div>
  );
}
