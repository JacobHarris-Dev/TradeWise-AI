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
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div>
        <p className="font-mono text-sm font-semibold text-zinc-900">
          {ticker}
        </p>
        <p className="text-xs text-zinc-500">
          {shares} share{shares === 1 ? "" : "s"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-zinc-500">Est. value</p>
        <p className="text-sm font-medium text-zinc-800">
          {valueDisplay}
        </p>
      </div>
    </article>
  );
}
