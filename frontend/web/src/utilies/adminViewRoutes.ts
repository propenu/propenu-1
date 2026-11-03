/** SuperAdmin read-only view-as URL prefix (exact screens, separate from real dashboards). */
export const ADMIN_VIEW_ROOT = "/admin-view";

export type AdminViewKind = "builder" | "agent" | "owner";

const OWNER_CANONICAL_HOME = "/my-properties";

const OWNER_PATH_MAP: Record<string, string> = {
  "": OWNER_CANONICAL_HOME,
  "my-properties": "/my-properties",
  settings: "/settings",
  "shortlisted-properties": "/shortlisted-properties",
  "contacted-properties": "/contacted-properties",
  membership: "/membership",
  notifications: "/notifications",
  support: "/support",
  "delete-account": "/delete-account",
};

export function getAdminViewKind(pathname?: string | null): AdminViewKind | null {
  const path = String(pathname || "");
  if (path === `${ADMIN_VIEW_ROOT}/builder` || path.startsWith(`${ADMIN_VIEW_ROOT}/builder/`)) {
    return "builder";
  }
  if (path === `${ADMIN_VIEW_ROOT}/agent` || path.startsWith(`${ADMIN_VIEW_ROOT}/agent/`)) {
    return "agent";
  }
  if (path === `${ADMIN_VIEW_ROOT}/owner` || path.startsWith(`${ADMIN_VIEW_ROOT}/owner/`)) {
    return "owner";
  }
  return null;
}

/** Map /admin-view/... browser URL → real page path for Next rewrite. */
export function resolveAdminViewRewrite(pathname: string): string | null {
  const kind = getAdminViewKind(pathname);
  if (!kind) return null;

  if (kind === "builder") {
    const rest = pathname.slice(`${ADMIN_VIEW_ROOT}/builder`.length);
    return `/builder${rest || ""}` || "/builder";
  }

  if (kind === "agent") {
    const rest = pathname.slice(`${ADMIN_VIEW_ROOT}/agent`.length);
    return `/agent${rest || ""}` || "/agent";
  }

  // owner
  const rest = pathname
    .slice(`${ADMIN_VIEW_ROOT}/owner`.length)
    .replace(/^\//, "");
  const mapped = OWNER_PATH_MAP[rest];
  return mapped || null;
}

/** Keep sidebar navigation under /admin-view/* while view-as is active. */
export function toAdminViewHref(
  pathname: string | null | undefined,
  canonicalHref: string,
): string {
  const kind = getAdminViewKind(pathname);
  if (!kind) return canonicalHref;

  if (kind === "builder" && (canonicalHref === "/builder" || canonicalHref.startsWith("/builder/"))) {
    return `${ADMIN_VIEW_ROOT}${canonicalHref}`;
  }

  if (kind === "agent" && (canonicalHref === "/agent" || canonicalHref.startsWith("/agent/"))) {
    return `${ADMIN_VIEW_ROOT}${canonicalHref}`;
  }

  if (kind === "owner") {
    if (canonicalHref === "/my-properties") return `${ADMIN_VIEW_ROOT}/owner`;
    const ownerKeys = Object.keys(OWNER_PATH_MAP).filter(Boolean);
    for (const key of ownerKeys) {
      if (OWNER_PATH_MAP[key] === canonicalHref) {
        return `${ADMIN_VIEW_ROOT}/owner/${key}`;
      }
    }
  }

  return canonicalHref;
}

/** Redirect a normal dashboard URL to the matching /admin-view URL (when session is view-as). */
export function toAdminViewFromCanonical(pathname: string): string | null {
  if (pathname.startsWith(ADMIN_VIEW_ROOT)) return null;

  if (pathname === "/builder" || pathname.startsWith("/builder/")) {
    if (
      pathname.startsWith("/builder/invite") ||
      pathname.startsWith("/builder/onboard")
    ) {
      return null;
    }
    return `${ADMIN_VIEW_ROOT}${pathname}`;
  }

  if (pathname === "/agent" || pathname.startsWith("/agent/")) {
    return `${ADMIN_VIEW_ROOT}${pathname}`;
  }

  for (const [key, canonical] of Object.entries(OWNER_PATH_MAP)) {
    if (!key) continue;
    if (pathname === canonical || pathname.startsWith(`${canonical}/`)) {
      return key === "my-properties" && pathname === "/my-properties"
        ? `${ADMIN_VIEW_ROOT}/owner`
        : `${ADMIN_VIEW_ROOT}/owner/${key}${pathname.slice(canonical.length)}`;
    }
  }
  if (pathname === "/my-properties") return `${ADMIN_VIEW_ROOT}/owner`;

  return null;
}

export function adminViewHomeForRole(roleName?: string | null): string {
  const role = String(roleName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (role === "builder" || role === "builder_staff") {
    return `${ADMIN_VIEW_ROOT}/builder`;
  }
  if (
    role === "agent" ||
    role === "customer_care" ||
    role === "relationship_manager"
  ) {
    return `${ADMIN_VIEW_ROOT}/agent`;
  }
  return `${ADMIN_VIEW_ROOT}/owner`;
}
