import Link from "next/link";
import { BrandIcon } from "@/components/brand/brand-icon";

type BrandWordmarkProps = {
  href?: string;
  showIcon?: boolean;
  className?: string;
};

/** Header wordmark: optional icon + two-tone TradeWise text (matches brand colors). */
export function BrandWordmark({
  href = "/",
  showIcon = true,
  className = "",
}: BrandWordmarkProps) {
  const inner = (
    <span className="flex items-center gap-2.5">
      {showIcon ? <BrandIcon size={36} /> : null}
      <span className="text-lg font-semibold tracking-tight">
        <span className="text-[#0f172a]">Trade</span>
        <span className="text-[#2563eb]">Wise</span>
      </span>
    </span>
  );

  if (!href) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center transition-opacity hover:opacity-90 ${className}`}
    >
      {inner}
    </Link>
  );
}
