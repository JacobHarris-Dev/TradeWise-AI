import {
  arrayUnion,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { app } from "@/lib/firebase";
import type { TradingTimeMode } from "@/lib/trade-workspace";

const db = getFirestore(app);

export function getFirestoreDb() {
  return db;
}

/** Upsert profile in `users/{uid}` after sign-in. */
export async function upsertUserDocument(user: User) {
  const ref = doc(db, "users", user.uid);
  await setDoc(
    ref,
    {
      userId: user.uid,
      name: user.displayName ?? "",
      email: user.email ?? "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
const TICKER_RE = /^[A-Z0-9.\-]{1,16}$/;
const TICKER_ALIASES: Record<string, string> = {
  APPL: "AAPL",
};

export function normalizeTicker(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  return TICKER_ALIASES[normalized] ?? normalized;
}

export function isValidTicker(ticker: string): boolean {
  return TICKER_RE.test(ticker);
}

/** Add one symbol to `watchlists/{userId}.tickers` (deduped by Firestore arrayUnion). */
export async function addTickerToWatchlist(userId: string, rawTicker: string) {
  const ticker = normalizeTicker(rawTicker);
  if (!isValidTicker(ticker)) {
    throw new Error("Invalid ticker (use letters, numbers, dot or hyphen; max 16 chars).");
  }
  const ref = doc(db, "watchlists", userId);
  await setDoc(
    ref,
    {
      userId,
      tickers: arrayUnion(ticker),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Live updates when the watchlist document changes. */
export function subscribeToWatchlist(
  userId: string,
  onTickers: (tickers: string[]) => void,
): Unsubscribe {
  const ref = doc(db, "watchlists", userId);
  return onSnapshot(ref, (snap) => {
    const data = snap.data();
    const tickers = (data?.tickers as string[] | undefined) ?? [];
    onTickers(
      [...new Set(tickers.map((ticker) => normalizeTicker(ticker)))].sort(),
    );
  });
}

export type PersistedTradingState = {
  cash: number;
  positions: Record<string, number>;
  trades: {
    symbol: string;
    shares: number;
    price: number;
    type: "buy" | "sell";
    timestamp: string;
  }[];
  simulationTime: string | null;
  updatedAt?: string | null;
};

/** Live vs historic paper portfolios are stored and hydrated separately. */
export type PersistedTradingSlices = {
  live: PersistedTradingState | null;
  historic: PersistedTradingState | null;
};

/** Avoid treating every Firestore snapshot as new state when wallet/trades/sim time are unchanged (prevents feedback loops with local saves). */
function persistedSliceEqual(
  a: PersistedTradingState | null,
  b: PersistedTradingState | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.cash !== b.cash) return false;
  if (a.simulationTime !== b.simulationTime) return false;
  if (JSON.stringify(a.positions) !== JSON.stringify(b.positions)) return false;
  if (JSON.stringify(a.trades) !== JSON.stringify(b.trades)) return false;
  return true;
}

export function persistedTradingSlicesEqual(
  a: PersistedTradingSlices,
  b: PersistedTradingSlices,
): boolean {
  return persistedSliceEqual(a.live, b.live) && persistedSliceEqual(a.historic, b.historic);
}

function tradingStateRef(userId: string) {
  return doc(db, "tradingState", userId);
}

function parsePersistedSlice(
  raw: Record<string, unknown>,
): PersistedTradingState {
  return {
    cash: typeof raw.cash === "number" ? raw.cash : 10_000,
    positions: (raw.positions as Record<string, number> | undefined) ?? {},
    trades: (raw.trades as PersistedTradingState["trades"] | undefined) ?? [],
    simulationTime:
      typeof raw.simulationTime === "string" ? raw.simulationTime : null,
    updatedAt:
      raw.updatedAt &&
      typeof (raw.updatedAt as { toDate?: () => Date }).toDate === "function"
        ? (raw.updatedAt as { toDate: () => Date }).toDate().toISOString()
        : null,
  };
}

function parseTradingStateDocument(
  data: Record<string, unknown>,
): PersistedTradingSlices {
  const historicRaw = data.historic;
  const historic =
    historicRaw && typeof historicRaw === "object"
      ? parsePersistedSlice(historicRaw as Record<string, unknown>)
      : null;

  const liveRaw = data.live;
  if (liveRaw && typeof liveRaw === "object") {
    return {
      live: parsePersistedSlice(liveRaw as Record<string, unknown>),
      historic,
    };
  }

  const hasLegacyLive =
    typeof data.cash === "number" ||
    (data.positions && typeof data.positions === "object") ||
    (Array.isArray(data.trades) && data.trades.length > 0) ||
    typeof data.simulationTime === "string";

  if (hasLegacyLive) {
    return { live: parsePersistedSlice(data), historic };
  }

  return { live: null, historic };
}

/** Persist one mode's wallet + positions + trade history (`live` vs `historic` on the same doc). */
export async function saveTradingState(
  userId: string,
  mode: TradingTimeMode,
  state: PersistedTradingState,
) {
  await setDoc(
    tradingStateRef(userId),
    {
      userId,
      [mode]: {
        cash: Number(state.cash.toFixed(2)),
        positions: state.positions,
        trades: state.trades,
        simulationTime: state.simulationTime,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Subscribe to persisted live + historic trading state for the signed-in user. */
export function subscribeToTradingState(
  userId: string,
  onSlices: (slices: PersistedTradingSlices) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    tradingStateRef(userId),
    (snap) => {
      if (!snap.exists()) {
        onSlices({ live: null, historic: null });
        return;
      }
      onSlices(parseTradingStateDocument(snap.data() as Record<string, unknown>));
    },
    (error) => {
      onError?.(error);
      onSlices({ live: null, historic: null });
    },
  );
}
