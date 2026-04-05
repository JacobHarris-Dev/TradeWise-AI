import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign in · TradeWise",
  description: "Sign in to TradeWise to sync your watchlist and data",
};

export default function LoginLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-full bg-white dark:bg-zinc-950">{children}</div>
  );
}
