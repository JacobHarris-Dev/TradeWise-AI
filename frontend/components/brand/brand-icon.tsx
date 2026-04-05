import Image from "next/image";

type BrandIconProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

/** Square TW mark from `/public/brand/tradewise-icon.png`. */
export function BrandIcon({
  size = 40,
  className = "",
  priority = false,
}: BrandIconProps) {
  return (
    <Image
      src="/brand/tradewise-icon.png"
      alt="TradeWise"
      width={size}
      height={size}
      className={`shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${className}`}
      priority={priority}
    />
  );
}
