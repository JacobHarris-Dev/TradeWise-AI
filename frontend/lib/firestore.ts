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
