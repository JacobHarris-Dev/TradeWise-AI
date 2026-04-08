"use client";

import {
  BrainCircuit,
  MousePointerClick,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type Step = {
  color: string;
  description: string;
  icon: LucideIcon;
  title: string;
  visual: React.ReactNode;
};

const STEPS: Step[] = [
  {
    title: "Load a starter basket",
    description:
      "Begin from the dashboard and preload the stocks you want to monitor instead of re-entering symbols every time.",
    icon: Search,
    color: "border-blue-100 bg-blue-50 text-blue-600",
    visual: (
      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18),transparent_55%)]" />
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-5 w-5 text-slate-400" />
            <span className="text-lg font-black tracking-tight text-slate-900">
              NVDA, AAPL, AMD
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {["NVDA", "AAPL", "AMD"].map((ticker) => (
              <div
                key={ticker}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-700"
              >
                {ticker}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Review the model signal",
    description:
      "TradeWise scores the setup, surfaces the current lean, and keeps confidence visible without forcing the user into a dense dashboard wall.",
    icon: BrainCircuit,
    color: "border-emerald-100 bg-emerald-50 text-emerald-600",
    visual: (
      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 p-8 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18),transparent_55%)]" />
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Model output
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              92% confidence
            </span>
          </div>
          <div className="text-3xl font-black tracking-tight text-slate-950">
            STRONG BUY
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div className="h-2 w-[92%] rounded-full bg-emerald-500" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Read the explanation layer",
    description:
      "Signals are not isolated outputs. The reasoning block ties technical triggers to recent headlines so the user understands the setup.",
    icon: Sparkles,
    color: "border-cyan-100 bg-cyan-50 text-cyan-600",
    visual: (
      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.18),transparent_55%)]" />
        <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-600" />
            <span className="text-sm font-black text-slate-900">AI reasoning</span>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Price recovered above support while the latest catalyst flow stays net
            constructive. Momentum and context are aligned rather than competing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["RSI recovery", "Momentum uptrend", "Positive headlines"].map(
              (tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600"
                >
                  {tag}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Practice the decision",
    description:
      "Use the paper-trading path and mock-trading tools to test the idea before you act. The workflow stays educational instead of opaque.",
    icon: MousePointerClick,
    color: "border-amber-100 bg-amber-50 text-amber-600",
    visual: (
      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_55%)]" />
        <div className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <button
            type="button"
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
          >
            Start paper trade
          </button>
          <button
            type="button"
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700"
          >
            Run mock trading day
          </button>
        </div>
      </div>
    ),
  },
];

export function LandingWalkthrough() {
  return (
    <section
      id="workflow"
      className="scroll-mt-24 border-t border-slate-200 bg-white py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mx-auto mb-20 max-w-3xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">
            Workflow
          </p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 md:text-5xl">
            From signal discovery to practice trade in one flow
          </h2>
          <p className="mt-5 text-lg font-medium leading-8 text-slate-600">
            The design folder had the right pacing. This version adapts that
            sequence to the real TradeWise product instead of using generic SaaS
            filler.
          </p>
        </div>

        <div className="space-y-24 lg:space-y-32">
          {STEPS.map((step, index) => {
            const Icon = step.icon;

            return (
              <div
                key={step.title}
                className={`flex flex-col items-center gap-10 lg:gap-16 ${
                  index % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"
                }`}
              >
                <div className="flex-1 text-center lg:text-left">
                  <div
                    className={`mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm lg:mx-0 ${step.color}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                    Step {index + 1}: {step.title}
                  </h3>
                  <p className="mx-auto mt-5 max-w-xl text-lg font-medium leading-8 text-slate-600 lg:mx-0">
                    {step.description}
                  </p>
                </div>

                <div className="h-[320px] w-full flex-1 lg:h-[400px]">
                  {step.visual}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
