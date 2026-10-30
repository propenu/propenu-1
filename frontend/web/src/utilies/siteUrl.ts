export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_WEB_URL ||
  "https://propenu.com";

export const DEFAULT_OG_IMAGE = "/email/propenu-logo.png";

export function absoluteSiteUrl(pathOrUrl = "/") {
  try {
    return new URL(pathOrUrl).toString();
  } catch {
    const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return new URL(normalizedPath, SITE_URL).toString();
  }
}

export function normalizeCanonicalPath(pathname?: string | null) {
  const cleanPath = String(pathname || "/")
    .split(/[?#]/)[0]
    .replace(/\/{2,}/g, "/");

  if (!cleanPath || cleanPath === "/") {
    return "/";
  }

  return cleanPath.replace(/\/+$/g, "");
}
