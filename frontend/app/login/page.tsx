import { Suspense } from "react";
import { LoginPage } from "@/components/auth/login-page";

export default function LoginRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-500">
          Loading…
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
