import type { NextRequest } from "next/server";
import { proxyToMlBackend } from "@/lib/ml/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();
  if (!query) {
    return Response.json({ error: "A search query is required." }, { status: 400 });
  }

  return proxyToMlBackend(request, "/v1/stock-universe/resolve");
}
