import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { app } from "@/lib/firebase";

const googleProvider = new GoogleAuthProvider();

function auth() {
  return getAuth(app);
}

export function getFirebaseAuth() {
  return auth();
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth(), callback);
}

export async function signInWithGooglePopup() {
  await signInWithPopup(auth(), googleProvider);
}

export async function signInWithEmailPassword(email: string, password: string) {
  await signInWithEmailAndPassword(auth(), email.trim(), password);
}

export async function signUpWithEmailPassword(email: string, password: string) {
  await createUserWithEmailAndPassword(auth(), email.trim(), password);
}

export async function signOutUser() {
  await signOut(auth());
}
