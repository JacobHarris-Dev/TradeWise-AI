import Link from "next/link";
import { BrandWordmark } from "@/components/brand/brand-wordmark";

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-14 text-slate-500">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]">
          <div>
            <BrandWordmark href="/" className="mb-4" />
            <p className="max-w-sm text-sm leading-6">
              A calmer trading interface with live signal context, explainable AI
              reasoning, and a paper-trading path for practice before action.
            </p>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
              Explore
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#product" className="transition hover:text-slate-900">
                  Product
                </a>
              </li>
              <li>
                <a href="#workflow" className="transition hover:text-slate-900">
                  Workflow
                </a>
              </li>
              <li>
                <a href="#demo" className="transition hover:text-slate-900">
                  Live demo
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
              Access
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/login" className="transition hover:text-slate-900">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="transition hover:text-slate-900">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200 pt-8">
          <p className="text-center text-sm">
            © {new Date().getFullYear()} TradeWise AI. For research and paper-trading
            use only.
          </p>
        </div>
      </div>
    </footer>
  );
}
