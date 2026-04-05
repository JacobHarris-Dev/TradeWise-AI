"use client";

import type { User } from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  signInWithGooglePopup,
  signOutUser,
  subscribeToAuth,
} from "@/lib/auth";
import { upsertUserDocument } from "@/lib/firestore";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return subscribeToAuth((next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void upsertUserDocument(user).catch((err) => {
      if (!cancelled) console.error("Failed to sync user to Firestore:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    await signInWithGooglePopup();
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signInWithGoogle,
      signOut,
    }),
    [user, loading, signInWithGoogle, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
