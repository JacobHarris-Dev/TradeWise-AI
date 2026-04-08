import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign in · TradeWise",
  description: "Sign in to TradeWise to save your trading workspace and paper account",
};

export default function LoginLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-full bg-[#f4f5f7]">{children}</div>
  );
}
