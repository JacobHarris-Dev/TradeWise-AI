import type { NextRequest } from "next/server";
import { proxyToMlBackend } from "@/lib/ml/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyToMlBackend(request, "/v1/paper-account");
}
