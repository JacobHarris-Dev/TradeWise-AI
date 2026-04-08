"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

export function LoginButton() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <span className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-400">
        Checking session…
      </span>
    );
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="max-w-55 truncate text-sm text-slate-300">
          {user.displayName ?? user.email ?? user.uid}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800"
        >
          Sign out
        </button>
      </div>
    );
  }

  const loginHref =
    pathname && pathname !== "/login"
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

  return (
    <Link
      href={loginHref}
      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-indigo-400"
    >
      Log in
    </Link>
  );
}
