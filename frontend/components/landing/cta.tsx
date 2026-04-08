"use client";

import Link from "next/link";

export function LandingCTA() {
  return (
    <section className="relative overflow-hidden border-t border-slate-200 bg-white py-24">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]" />
      <div className="mx-auto max-w-4xl px-6 text-center lg:px-12">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">
          Final call to action
        </p>
        <h2 className="mb-6 text-4xl font-black tracking-tight text-slate-900 lg:text-6xl">
          Move from the homepage into the workspace.
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-lg font-medium text-slate-600 lg:text-xl">
          Sign in to save your trading workspace, inspect the Trade view, and run the
          paper-trading flow behind the redesigned public experience.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-10 py-4 text-lg font-semibold text-white transition-colors hover:bg-slate-800 sm:w-auto"
          >
            Log in to TradeWise
          </Link>
          <a
            href="#demo"
            className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-10 py-4 text-lg font-semibold text-slate-900 transition-colors hover:bg-slate-50 sm:w-auto"
          >
            Revisit the demo
          </a>
        </div>
      </div>
    </section>
  );
}
