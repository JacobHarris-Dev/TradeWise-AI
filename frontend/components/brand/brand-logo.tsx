import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

/** Full horizontal lockup (wordmark + tagline) from `/public/brand/tradewise-logo.png`. */
export function BrandLogo({ className = "", priority = false }: BrandLogoProps) {
  return (
    <div
      className={`relative mx-auto w-full max-w-[min(100%,320px)] ${className}`}
    >
      <Image
        src="/brand/tradewise-logo.png"
        alt="TradeWise — Smart trading intelligence"
        width={640}
        height={240}
        className="h-auto w-full object-contain"
        priority={priority}
        sizes="320px"
      />
    </div>
  );
}
