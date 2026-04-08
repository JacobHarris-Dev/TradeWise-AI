"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Home,
  LineChart,
  LogOut,
  Settings,
} from "lucide-react";
import { BrandIcon } from "@/components/brand/brand-icon";
import { useAuth } from "@/components/providers/auth-provider";
import { usePortfolioWorkspace } from "@/components/providers/trade-workspace-provider";

type AppShellProps = {
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/trade", label: "Markets", icon: LineChart },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
] as const;

function pageTitle(pathname: string) {
  if (pathname.startsWith("/trade")) {
    return "Trading Desk";
  }
  if (pathname.startsWith("/portfolio")) {
    return "My Portfolio";
  }
  return "Dashboard";
}

function initialsForUser(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return "TW";
  }

  const pieces = raw.split(/\s+/).filter(Boolean);
  if (pieces.length >= 2) {
    return `${pieces[0][0] ?? ""}${pieces[1][0] ?? ""}`.toUpperCase();
  }

  return raw.slice(0, 2).toUpperCase();
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const { paperAccount, portfolio } = usePortfolioWorkspace();

  const buyingPower = portfolio?.cash ?? paperAccount?.cash ?? 0;
  const userLabel = user?.displayName ?? user?.email ?? "TradeWise";
  const initials = initialsForUser(user?.displayName ?? user?.email);

  return (
    <div className="dark flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-900 md:flex">
        <div className="flex h-16 items-center border-b border-slate-800 px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <BrandIcon size={36} className="ring-1 ring-white/10" priority />
            <span className="text-xl font-bold tracking-tight text-white">
              TradeWise
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${
                  active
                    ? "bg-indigo-600/10 font-medium text-indigo-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3 px-4 py-2 text-slate-400">
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 flex w-full items-center gap-3 px-4 py-2 text-left text-slate-400 transition hover:text-slate-200"
          >
            <LogOut className="h-5 w-5" />
            <span>{user ? "Sign Out" : "Guest Mode"}</span>
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center md:hidden">
            <Link href="/dashboard" className="flex items-center gap-2">
              <BrandIcon size={32} className="ring-1 ring-white/10" />
              <span className="font-bold text-white">TradeWise</span>
            </Link>
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold text-slate-200">
              {pageTitle(pathname)}
            </h1>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Buying Power
              </span>
              <span className="font-mono text-sm font-medium text-emerald-400">
                ${buyingPower.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden max-w-48 truncate text-sm text-slate-300 md:block">
                {loading ? "Checking session..." : userLabel}
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-100">
                {initials}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8 lg:px-8">
          {children}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-slate-800 bg-slate-900 md:hidden">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex h-full w-full flex-col items-center justify-center ${
                active ? "text-indigo-400" : "text-slate-500"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-1 text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
