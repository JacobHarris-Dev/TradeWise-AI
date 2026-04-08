type HoldingCardProps = {
  ticker: string;
  shares: number;
  /** Until a live API exists, show a dash or static copy instead of real market value. */
  valueDisplay?: string;
};

/**
 * One row of the portfolio: symbol, quantity, and a placeholder for market value.
 */
export function HoldingCard({
  ticker,
  shares,
  valueDisplay = "—",
}: HoldingCardProps) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 shadow-lg shadow-slate-950/20">
      <div>
        <p className="font-mono text-sm font-semibold text-white">
          {ticker}
        </p>
        <p className="text-xs text-slate-500">
          {shares} share{shares === 1 ? "" : "s"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-500">Est. value</p>
        <p className="text-sm font-medium text-slate-200">
          {valueDisplay}
        </p>
      </div>
    </article>
  );
}
