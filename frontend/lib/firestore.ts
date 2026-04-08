import {
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
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
