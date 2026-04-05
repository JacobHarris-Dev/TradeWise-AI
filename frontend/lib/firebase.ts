import { type FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

/** Web app Firebase configuration (from env; see .env.example). */
export function getFirebaseConfig(): FirebaseOptions {
  const config: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
  if (measurementId) {
    config.measurementId = measurementId;
  }

  return config;
}

// Initialize Firebase (singleton; safe with Next.js Fast Refresh)
export const app =
  getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig());

export function getFirebaseApp() {
  return app;
}

let analyticsPromise: Promise<Analytics | null> | undefined;

/**
 * Analytics only runs in the browser. Dynamic import keeps `firebase/analytics`
 * off the server bundle.
 */
export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (!analyticsPromise) {
    analyticsPromise = import("firebase/analytics").then(({ getAnalytics }) =>
      getAnalytics(app),
    );
  }
  return analyticsPromise;
}
