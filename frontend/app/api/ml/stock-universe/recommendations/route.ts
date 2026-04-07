import type { NextRequest } from "next/server";
import { proxyToMlBackend } from "@/lib/ml/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sectors = request.nextUrl.searchParams.get("sectors")?.trim();
  if (!sectors) {
    return Response.json({ error: "At least one sector is required." }, { status: 400 });
  }

  return proxyToMlBackend(request, "/v1/stock-universe/recommendations");
}
