import Link from "next/link";
import { LoginButton } from "@/components/auth/login-button";
import { MainNav } from "@/components/layout/main-nav";

type AppShellProps = {
  children: React.ReactNode;
};

/**
 * Shared chrome: brand link, nav, and auth control.
 * Wrapped around dashboard / trade / portfolio routes via a route-group layout.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              TradeWise
            </Link>
            <MainNav />
          </div>
          <LoginButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
