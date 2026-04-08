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
      ? "text-emerald-600"
      : changePercent < 0
        ? "text-red-600"
        : "text-zinc-500";

  return (
    <article
      className={`rounded-xl border border-zinc-200 bg-white ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold text-zinc-900">
            {ticker}
          </p>
          {!compact && companyName ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
              {companyName}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-zinc-900">
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
