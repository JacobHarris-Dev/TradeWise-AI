import type { NextRequest } from "next/server";
import { proxyToMlBackend } from "@/lib/ml/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim();
  if (!ticker) {
    return Response.json({ error: "Ticker is required." }, { status: 400 });
  }

  // Proxy to lightweight reasoning endpoint that returns LLM answer immediately
  return proxyToMlBackend(request, "/v1/news-report/reasoning");
}
