import type { NextRequest } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

function getBackendBaseUrl() {
  return process.env.ML_BACKEND_URL ?? DEFAULT_BACKEND_URL;
}

function formatFetchFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error) {
      return `${error.message} (${cause.message})`;
    }
    return error.message;
  }
  return String(error);
}

/** Returned when `fetch` to the Python API fails (e.g. ECONNREFUSED if nothing listens on port 8000). */
function mlBackendUnreachableResponse(backendOrigin: string, detail: string) {
  const body = {
    error: "ml_backend_unreachable",
    message:
      "The ML API is not reachable. Start the TradeWise backend (e.g. uvicorn on port 8000) or set ML_BACKEND_URL in the frontend environment.",
    backend: backendOrigin,
    detail,
  };
  return new Response(JSON.stringify(body), {
    status: 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function proxyToMlBackend(
  request: NextRequest,
  backendPath: string,
) {
  const base = getBackendBaseUrl();
  const backendUrl = new URL(backendPath, base);
  backendUrl.search = request.nextUrl.search;

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(backendUrl, {
      method: request.method,
      body,
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(request.headers.get("content-type")
          ? { "content-type": request.headers.get("content-type") as string }
          : {}),
      },
    });
  } catch (err) {
    let origin: string;
    try {
      origin = new URL(base).origin;
    } catch {
      origin = base;
    }
    return mlBackendUnreachableResponse(
      origin,
      formatFetchFailureMessage(err),
    );
  }

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
