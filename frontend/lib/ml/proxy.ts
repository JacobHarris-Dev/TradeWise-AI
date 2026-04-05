import type { NextRequest } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

function getBackendBaseUrl() {
  return process.env.ML_BACKEND_URL ?? DEFAULT_BACKEND_URL;
}

export async function proxyToMlBackend(
  request: NextRequest,
  backendPath: string,
) {
  const backendUrl = new URL(backendPath, getBackendBaseUrl());
  backendUrl.search = request.nextUrl.search;

  const upstream = await fetch(backendUrl, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  headers.set("cache-control", "no-store");

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers,
  });
}
