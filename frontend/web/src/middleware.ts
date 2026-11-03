import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_VIEW_ROOT,
  resolveAdminViewRewrite,
  toAdminViewFromCanonical,
} from "@/utilies/adminViewRoutes";

const userOnlyRoutes = [
  "/settings",
  "/my-properties",
  "/shortlisted-properties",
  "/contacted-properties",
  "/membership",
];
const builderRestrictedRoutes = ["/postproperty"];

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString(),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const pathname = req.nextUrl.pathname;

  // Public builder invite / onboard links (email CTA) — no login required
  const isPublicBuilderInviteRoute =
    pathname.startsWith("/builder/invite") ||
    pathname.startsWith("/builder/onboard");
  if (isPublicBuilderInviteRoute) {
    return NextResponse.next();
  }

  const isAdminViewRoute = pathname.startsWith(`${ADMIN_VIEW_ROOT}/`);
  const isProtectedRoleRoute =
    pathname.startsWith("/user") ||
    pathname.startsWith("/agent") ||
    pathname.startsWith("/builder") ||
    pathname.startsWith("/admin") ||
    isAdminViewRoute;
  const isUserOnlyRoute = userOnlyRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isBuilderRestrictedRoute = builderRestrictedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // 1. Not logged in → block protected routes
  if (!token && (isProtectedRoleRoute || isUserOnlyRoute)) {
    return new NextResponse(null, { status: 403 });
  }

  if (!token) return NextResponse.next();

  const payload = decodeTokenPayload(token);
  if (!payload) {
    return new NextResponse(null, { status: 403 });
  }

  const role = String(payload.roleName || "");
  const isImpersonation = Boolean(
    payload.impersonation && payload.readOnly,
  );

  // SuperAdmin view-as must use /admin-view/* URLs only
  if (isAdminViewRoute) {
    if (!isImpersonation) {
      return new NextResponse(null, { status: 403 });
    }
    const rewriteTo = resolveAdminViewRewrite(pathname);
    if (!rewriteTo) {
      return new NextResponse(null, { status: 404 });
    }
    const url = req.nextUrl.clone();
    url.pathname = rewriteTo;
    return NextResponse.rewrite(url);
  }

  // If already in view-as but opened a normal dashboard URL → bounce to /admin-view/*
  if (isImpersonation) {
    const adminPath = toAdminViewFromCanonical(pathname);
    if (adminPath) {
      const url = req.nextUrl.clone();
      url.pathname = adminPath;
      return NextResponse.redirect(url);
    }
  }

  // 3. Role rules (normal sessions)
  if (
    pathname.startsWith("/agent") &&
    role !== "agent" &&
    role !== "customer_care" &&
    role !== "relationship_manager"
  ) {
    return new NextResponse(null, { status: 403 });
  }

  if (
    pathname.startsWith("/builder") &&
    role !== "builder" &&
    role !== "builder_staff"
  ) {
    return new NextResponse(null, { status: 403 });
  }

  if (pathname.startsWith("/user") && role !== "user") {
    return new NextResponse(null, { status: 403 });
  }

  if (
    pathname.startsWith("/admin") &&
    role !== "admin" &&
    role !== "super_admin" &&
    role !== "regional_manager"
  ) {
    return new NextResponse(null, { status: 403 });
  }

  if (isUserOnlyRoute && role !== "user") {
    return new NextResponse(null, { status: 403 });
  }

  if (
    isBuilderRestrictedRoute &&
    (role === "builder" || role === "builder_staff")
  ) {
    return new NextResponse(null, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/user/:path*",
    "/agent/:path*",
    "/builder/:path*",
    "/admin/:path*",
    "/admin-view/:path*",
    "/settings/:path*",
    "/my-properties/:path*",
    "/shortlisted-properties/:path*",
    "/contacted-properties/:path*",
    "/membership/:path*",
    "/notifications/:path*",
    "/support/:path*",
    "/delete-account/:path*",
    "/postproperty/:path*",
  ],
};
