import Cookies from "js-cookie";

const TOKEN_KEY = "token";
const PREV_TOKEN_KEY = "propenu_token_before_view_as";
const META_KEY = "propenu_view_as_meta";
const RETURN_URL_KEY = "propenu_view_as_return_url";

export type ViewAsMeta = {
  targetName: string;
  targetRoleName: string;
  expiresAt: string;
  impersonatorSub?: string;
};

function cookieOptions(expiresDays?: number) {
  return {
    path: "/",
    sameSite: "Lax" as const,
    expires: expiresDays ?? 1,
    secure: typeof window !== "undefined" && window.location.protocol === "https:",
  };
}

export function stashCurrentWebToken(): void {
  if (typeof window === "undefined") return;
  const current = Cookies.get(TOKEN_KEY);
  if (current) {
    sessionStorage.setItem(PREV_TOKEN_KEY, current);
  } else {
    sessionStorage.removeItem(PREV_TOKEN_KEY);
  }
}

export function setViewAsToken(token: string, meta: ViewAsMeta, returnUrl?: string): void {
  stashCurrentWebToken();
  Cookies.set(TOKEN_KEY, token, cookieOptions(1));
  sessionStorage.setItem(META_KEY, JSON.stringify(meta));
  if (returnUrl) {
    sessionStorage.setItem(RETURN_URL_KEY, returnUrl);
  }
  window.dispatchEvent(new Event("auth-changed"));
}

export function readViewAsMeta(): ViewAsMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ViewAsMeta;
  } catch {
    return null;
  }
}

export function clearViewAsSession(): void {
  if (typeof window === "undefined") return;
  Cookies.remove(TOKEN_KEY, { path: "/" });
  const previous = sessionStorage.getItem(PREV_TOKEN_KEY);
  sessionStorage.removeItem(PREV_TOKEN_KEY);
  sessionStorage.removeItem(META_KEY);
  if (previous) {
    Cookies.set(TOKEN_KEY, previous, cookieOptions(30));
  }
  window.dispatchEvent(new Event("auth-changed"));
}

export function consumeReturnUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(RETURN_URL_KEY);
  sessionStorage.removeItem(RETURN_URL_KEY);
  return value;
}

/** Decode JWT payload without verifying (UI banner only). */
export function decodeTokenClaims(token?: string): Record<string, unknown> | null {
  const value = token || Cookies.get(TOKEN_KEY);
  if (!value) return null;
  try {
    const part = value.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part));
  } catch {
    return null;
  }
}

export function isViewAsTokenActive(): boolean {
  const claims = decodeTokenClaims();
  if (claims?.impersonation && claims?.readOnly) return true;
  return Boolean(readViewAsMeta());
}
