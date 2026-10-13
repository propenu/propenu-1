export type RequestMonitorEvent = {
  id: string;
  method: string;
  url: string;
  path: string;
  group: string;
  status?: number;
  durationMs?: number;
  startedAt: number;
  endedAt?: number;
  ok?: boolean;
};

export const REQUEST_MONITOR_EVENT = "propenu:request-monitor";
export const RATE_LIMIT_RECOVERED_EVENT = "propenu:rate-limit-recovered";

function getRequestPath(url: string) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split("?")[0] || url;
  }
}

export function getRequestGroup(path: string) {
  if (path.includes("/api/users/location")) return "Location";
  if (path.includes("/api/users/auth")) return "Auth";
  if (path.includes("/api/properties/search")) return "Search";
  if (path.includes("/api/properties")) return "Properties";
  if (path.includes("/api/payments")) return "Payments";
  if (path.includes("/api/chatbot")) return "Propenu Assistant";
  if (path.includes("/api/tickets")) return "Tickets";
  return "Other";
}

export function emitRequestMonitorEvent(
  event: Omit<RequestMonitorEvent, "path" | "group"> & {
    path?: string;
    group?: string;
  },
) {
  if (typeof window === "undefined") return;

  const path = event.path || getRequestPath(event.url);
  window.dispatchEvent(
    new CustomEvent<RequestMonitorEvent>(REQUEST_MONITOR_EVENT, {
      detail: {
        ...event,
        path,
        group: event.group || getRequestGroup(path),
      },
    }),
  );
}

export function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getRateLimitResetMs(headers: Headers | Record<string, any>) {
  const readHeader = (name: string) => {
    if (headers instanceof Headers) return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()];
  };

  const retryAfter = Number(readHeader("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  const reset = Number(readHeader("ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    const epochMs = reset * 1000;
    const secondsMs = reset * 1000;

    if (epochMs > Date.now()) {
      return epochMs - Date.now();
    }

    return secondsMs;
  }

  return 60 * 1000;
}
