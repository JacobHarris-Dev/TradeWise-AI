"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { LandingHomepage } from "./homepage";

export function PublicLandingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    router.replace("/dashboard");
  }, [loading, router, user]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="animate-pulse">
          <div className="h-12 w-12 rounded-full bg-emerald-600" />
        </div>
      </div>
    );
  }

  return <LandingHomepage />;
}
