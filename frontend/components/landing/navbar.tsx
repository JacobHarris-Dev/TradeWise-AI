"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandWordmark } from "@/components/brand/brand-wordmark";

export function LandingNavbar() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 lg:px-12">
        <BrandWordmark href="/" className="shrink-0" />

        <div className="hidden items-center gap-8 md:flex">
          {[
            { label: "Product", id: "product" },
            { label: "Workflow", id: "workflow" },
            { label: "Demo", id: "demo" },
          ].map(({ label, id }) => (
            <a
              key={id}
              href={`#${id}`}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#demo"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 sm:inline-flex"
          >
            Live demo
          </a>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Log in
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </nav>
  );
}
