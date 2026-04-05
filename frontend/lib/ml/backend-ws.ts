const DEFAULT_BACKEND_WS_URL = "ws://127.0.0.1:8000";

export function getMlBackendWebSocketUrl() {
  if (process.env.NEXT_PUBLIC_ML_BACKEND_WS_URL) {
    return process.env.NEXT_PUBLIC_ML_BACKEND_WS_URL;
  }

  if (typeof window === "undefined") {
    return DEFAULT_BACKEND_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8000`;
}
