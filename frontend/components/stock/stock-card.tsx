import type { MockQuote } from "@/lib/mocks/stock-data";

type StockCardProps = {
  /** Quote fields — pass a full MockQuote or individual props below */
  quote?: MockQuote;
  ticker?: string;
  companyName?: string;
  lastPrice?: number;
  changePercent?: number;
  /** Tighter layout for dense lists (e.g. market overview grid). */
  compact?: boolean;
};

/**
 * Reusable summary of one symbol: ticker, name, price, day change.
 * Used across the Trade and Portfolio surfaces, and anywhere else you list stocks.
 */
export function StockCard({
  quote,
  ticker: tickerProp,
  companyName: nameProp,
  lastPrice: priceProp,
  changePercent: changeProp,
  compact = false,
}: StockCardProps) {
  const ticker = quote?.ticker ?? tickerProp ?? "—";
  const companyName = quote?.companyName ?? nameProp ?? "";
  const lastPrice = quote?.lastPrice ?? priceProp ?? 0;
  const changePercent = quote?.changePercent ?? changeProp ?? 0;

  const changeColor =
    changePercent > 0
      ? "text-emerald-300"
      : changePercent < 0
        ? "text-rose-300"
        : "text-slate-500";

  return (
    <article
      className={`rounded-2xl border border-slate-800 bg-slate-900/90 ${
        compact ? "px-3 py-2" : "px-4 py-3"
      } shadow-lg shadow-slate-950/20`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold text-white">
            {ticker}
          </p>
          {!compact && companyName ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
              {companyName}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-white">
            ${lastPrice.toFixed(2)}
          </p>
          <p className={`text-xs font-medium ${changeColor}`}>
            {changePercent >= 0 ? "+" : ""}
            {changePercent.toFixed(2)}%
          </p>
        </div>
      </div>
    </article>
  );
}
