"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useAuth } from "@/components/providers/auth-provider";
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from "@/lib/auth";

function firebaseAuthMessage(code: string): string {
  const map: Record<string, string> = {
    "auth/invalid-email": "That email doesn’t look valid.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found for that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account already exists with this email.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/popup-blocked":
      "Pop-up was blocked. Allow pop-ups for this site and try again.",
    "auth/unauthorized-domain":
      "This URL is not in Firebase authorized domains. In Firebase Console → Authentication → Settings → Authorized domains, add localhost or the host you use (e.g. your LAN IP without port).",
    "auth/configuration-not-found":
      "Firebase Auth is not fully set up. Enable Google sign-in under Authentication → Sign-in method.",
  };
  return map[code] ?? "Sign-in failed. Try again.";
}

/**
 * Full login experience: Google + email/password, redirect to ?next= or /dashboard.
 */
export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//")
    ? nextPath
    : "/dashboard";

  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    router.replace(safeNext);
  }, [authLoading, user, router, safeNext]);

  const onGoogle = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: string }).code)
          : "";
      setError(firebaseAuthMessage(code) || "Google sign-in failed.");
    } finally {
      setPending(false);
    }
  }, [signInWithGoogle]);

  const onEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setPending(true);
      try {
        if (mode === "signup") {
          await signUpWithEmailPassword(email, password);
        } else {
          await signInWithEmailPassword(email, password);
        }
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: string }).code)
            : "";
        setError(firebaseAuthMessage(code));
      } finally {
        setPending(false);
      }
    },
    [email, password, mode],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-500">
        Checking session…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block rounded-lg outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-white"
          >
            <BrandLogo priority />
          </Link>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-zinc-900">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Save your trade workspace and paper-trading data after you sign in.
          </p>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => void onGoogle()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-zinc-500">Or email</span>
          </div>
        </div>

        <div className="mb-4 flex rounded-lg bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === "signin"
                ? "bg-white text-zinc-900 shadow"
                : "text-zinc-600"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === "signup"
                ? "bg-white text-zinc-900 shadow"
                : "text-zinc-600"
            }`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={(e) => void onEmailSubmit(e)} className="flex flex-col gap-3">
          <label className="text-xs font-medium text-zinc-600">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Password
            <input
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending
              ? "Working…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          <Link
            href="/"
            className="font-medium text-zinc-700 underline"
          >
            View homepage
          </Link>
        </p>
      </div>
    </div>
  );
}
