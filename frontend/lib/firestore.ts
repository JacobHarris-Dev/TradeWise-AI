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

function tradingStateRef(userId: string) {
  return doc(db, "tradingState", userId);
}

/** Persist wallet + positions + trade history for cross-session restore. */
export async function saveTradingState(
  userId: string,
  state: PersistedTradingState,
) {
  await setDoc(
    tradingStateRef(userId),
    {
      userId,
      cash: Number(state.cash.toFixed(2)),
      positions: state.positions,
      trades: state.trades,
      simulationTime: state.simulationTime,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Subscribe to persisted user trading state. */
export function subscribeToTradingState(
  userId: string,
  onState: (state: PersistedTradingState | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    tradingStateRef(userId),
    (snap) => {
      if (!snap.exists()) {
        onState(null);
        return;
      }
      const data = snap.data();
      onState({
        cash: typeof data.cash === "number" ? data.cash : 10_000,
        positions: (data.positions as Record<string, number> | undefined) ?? {},
        trades:
          (data.trades as PersistedTradingState["trades"] | undefined) ?? [],
        simulationTime:
          typeof data.simulationTime === "string" ? data.simulationTime : null,
        updatedAt:
          data.updatedAt && typeof data.updatedAt.toDate === "function"
            ? data.updatedAt.toDate().toISOString()
            : null,
      });
    },
    (error) => {
      onError?.(error);
      // Keep the app usable even if rules are not published yet.
      onState(null);
    },
  );
}
