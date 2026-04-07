import type { NextRequest } from "next/server";
import { proxyToMlBackend } from "@/lib/ml/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tickers = request.nextUrl.searchParams.get("tickers")?.trim();
  if (!tickers) {
    return Response.json({ error: "Tickers are required." }, { status: 400 });
  }

  return proxyToMlBackend(request, "/v1/price-snapshots");
}
