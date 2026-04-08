"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trade", label: "Trade" },
  { href: "/portfolio", label: "Portfolio" },
] as const;

/**
 * Primary navigation for the app shell.
 * Sign-in is only in the header (LoginButton on the right).
 */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1" aria-label="Main">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-indigo-500/15 text-indigo-300"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
