"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  History,
  Pause,
  Play,
  Radio,
  Settings2,
  X,
} from "lucide-react";
import { useTradeWorkspace } from "@/components/providers/trade-workspace-provider";
import {
  historicDateInputBounds,
  isoTimestampToLocalDateInput,
  type TradingTimeMode,
} from "@/lib/trade-workspace";

const HISTORIC_SPEED_MIN = 0.05;
const HISTORIC_SPEED_MAX = 100;

function formatSpeedDraft(value: number) {
  if (!Number.isFinite(value)) return "1";
  const t = Number(value.toFixed(4));
  return String(t);
}

function formatSimulatedTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type ModeModalProps = {
  open: boolean;
  onClose: () => void;
  currentMode: TradingTimeMode;
  startDate: string | null;
  onApply: (
    payload: { mode: "live" } | { mode: "historic"; localDate: string },
  ) => void;
};

function TradingTimeModeModal({
  open,
  onClose,
  currentMode,
  startDate,
  onApply,
}: ModeModalProps) {
  const dateBounds = historicDateInputBounds();
  const [draftMode, setDraftMode] = useState<TradingTimeMode>(currentMode);
  const [draftHistoricDate, setDraftHistoricDate] = useState(
    () =>
      isoTimestampToLocalDateInput(startDate) || dateBounds.max,
  );

  useEffect(() => {
    if (!open) return;
    setDraftMode(currentMode);
    setDraftHistoricDate(
      isoTimestampToLocalDateInput(startDate) || dateBounds.max,
    );
  }, [open, currentMode, startDate, dateBounds.max]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="trading-mode-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              id="trading-mode-modal-title"
              className="text-lg font-semibold text-white"
            >
              Session mode
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Choose how market data and time advance. Historic uses a separate paper
              portfolio from live.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDraftMode("live")}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
              draftMode === "live"
                ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                : "border-slate-700 bg-slate-950/80 hover:border-slate-600"
            }`}
          >
            <Radio className="h-8 w-8 text-emerald-400" />
            <span className="mt-3 text-sm font-semibold text-white">Live</span>
            <span className="mt-1 text-xs leading-relaxed text-slate-400">
              Real-time quotes, streaming context, and your live paper portfolio.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDraftMode("historic")}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
              draftMode === "historic"
                ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30"
                : "border-slate-700 bg-slate-950/80 hover:border-slate-600"
            }`}
          >
            <History className="h-8 w-8 text-amber-400" />
            <span className="mt-3 text-sm font-semibold text-white">Historic</span>
            <span className="mt-1 text-xs leading-relaxed text-slate-400">
              Simulated clock, prices and news pinned to simulated time. Separate
              holdings from live.
            </span>
          </button>
        </div>

        {draftMode === "historic" ? (
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <label
              htmlFor="historic-session-date"
              className="text-sm font-medium text-slate-200"
            >
              Start session on
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Pick any NYSE session day (last 10 years). Playback starts at 9:30 AM US Eastern
              on that date. Simulated time can run forward without stopping at chart end or
              today&apos;s date; prices use the last known bar when ahead of loaded history.
            </p>
            <input
              id="historic-session-date"
              type="date"
              min={dateBounds.min}
              max={dateBounds.max}
              value={draftHistoricDate}
              onChange={(e) => setDraftHistoricDate(e.target.value)}
              className="mt-3 w-full max-w-xs rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white [color-scheme:dark]"
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (draftMode === "live") {
                onApply({ mode: "live" });
                return;
              }
              if (!draftHistoricDate) return;
              onApply({ mode: "historic", localDate: draftHistoricDate });
            }}
            className="rounded-xl bg-amber-500/90 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={draftMode === "historic" && !draftHistoricDate}
          >
            Apply
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Shown on every page — adjust session mode or historic date anytime.
        </p>
      </div>
    </div>
  );
}

/**
 * Sticky bar below the app header: live vs historic indicator, session modal, and
 * historic playback controls (time, play/pause, speed).
 */
export function TradingTimeModeStrip() {
  const [modalOpen, setModalOpen] = useState(false);
  const [speedDraft, setSpeedDraft] = useState("1");
  const [speedInputFocused, setSpeedInputFocused] = useState(false);
  const {
    tradingTimeMode,
    setTradingTimeMode,
    beginHistoricSessionAt,
    startDate,
    simulatedDate,
    speedMultiplier,
    setSpeedMultiplier,
    historicPlaybackPaused,
    setHistoricPlaybackPaused,
  } = useTradeWorkspace();

  const handleApplySessionMode = useCallback(
    (
      payload:
        | { mode: "live" }
        | { mode: "historic"; localDate: string },
    ) => {
      if (payload.mode === "live") {
        setTradingTimeMode("live");
        setModalOpen(false);
        return;
      }
      beginHistoricSessionAt(payload.localDate);
      setTradingTimeMode("historic");
      setModalOpen(false);
    },
    [beginHistoricSessionAt, setTradingTimeMode],
  );

  const togglePlay = useCallback(() => {
    setHistoricPlaybackPaused((p) => !p);
  }, [setHistoricPlaybackPaused]);

  useEffect(() => {
    if (!speedInputFocused) {
      setSpeedDraft(formatSpeedDraft(speedMultiplier));
    }
  }, [speedInputFocused, speedMultiplier]);

  const commitSpeedDraft = useCallback(() => {
    const raw = speedDraft.replace(",", ".").trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setSpeedDraft(formatSpeedDraft(speedMultiplier));
      return;
    }
    const clamped = Math.min(
      HISTORIC_SPEED_MAX,
      Math.max(HISTORIC_SPEED_MIN, n),
    );
    setSpeedMultiplier(clamped);
    setHistoricPlaybackPaused(false);
    setSpeedDraft(formatSpeedDraft(clamped));
  }, [
    setHistoricPlaybackPaused,
    setSpeedMultiplier,
    speedDraft,
    speedMultiplier,
  ]);

  const isHistoric = tradingTimeMode === "historic";

  return (
    <>
      <TradingTimeModeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentMode={tradingTimeMode}
        startDate={startDate}
        onApply={handleApplySessionMode}
      />

      <div
        className={`sticky top-0 z-10 -mx-4 mb-4 flex flex-col gap-2 border-b px-4 py-2.5 backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 ${
          isHistoric
            ? "border-amber-500/25 bg-amber-950/40"
            : "border-slate-800 bg-slate-900/90"
        }`}
        role="region"
        aria-label="Trading session mode"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[unset] sm:flex-none">
            {isHistoric ? (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                  <History className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/90">
                    Historic
                  </p>
                  <p className="truncate text-xs text-slate-400 sm:text-sm">
                    <span className="hidden text-slate-500 sm:inline">
                      Sim time:{" "}
                    </span>
                    <time
                      className="font-medium text-slate-100"
                      dateTime={simulatedDate ?? undefined}
                      title={formatSimulatedTime(simulatedDate)}
                    >
                      {formatSimulatedTime(simulatedDate)}
                    </time>
                  </p>
                </div>
              </>
            ) : (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Radio className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/90">
                    Live
                  </p>
                  <p className="text-xs text-slate-400 sm:text-sm">
                    Real-time data &amp; live paper portfolio
                  </p>
                </div>
              </>
            )}
          </div>

          {isHistoric ? (
            <div className="flex flex-wrap items-center gap-2 border-slate-700/80 sm:border-l sm:pl-3">
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30"
                aria-pressed={!historicPlaybackPaused}
              >
                {historicPlaybackPaused ? (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Play
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </>
                )}
              </button>
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="global-historic-speed"
                  className="text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  Speed
                </label>
                <input
                  id="global-historic-speed"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-describedby="global-historic-speed-hint"
                  value={speedDraft}
                  onChange={(e) => setSpeedDraft(e.target.value)}
                  onFocus={() => setSpeedInputFocused(true)}
                  onBlur={() => {
                    setSpeedInputFocused(false);
                    commitSpeedDraft();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-14 rounded-md border border-slate-600 bg-slate-950 px-1.5 py-1 text-center text-xs font-semibold tabular-nums text-amber-100 outline-none ring-amber-500/40 focus:border-amber-500/50 focus:ring-1 [color-scheme:dark]"
                />
                <span className="text-xs text-slate-500">×</span>
                <span
                  id="global-historic-speed-hint"
                  className="hidden text-[10px] text-slate-500 lg:inline"
                >
                  {HISTORIC_SPEED_MIN}–{HISTORIC_SPEED_MAX}
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Session
            </button>
            {isHistoric ? (
              <Link
                href="/trade"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-white"
              >
                Trade
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
