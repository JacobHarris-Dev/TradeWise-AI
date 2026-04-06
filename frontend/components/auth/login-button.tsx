"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

export function LoginButton() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        Checking session…
      </span>
    );
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="max-w-55 truncate text-sm text-zinc-600 dark:text-zinc-300">
          {user.displayName ?? user.email ?? user.uid}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
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
      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      Log in
    </Link>
  );
}
