const WEB_ORIGIN = (
  process.env.FRONTEND_URL ||
  process.env.WEB_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://propenu.com"
).replace(/\/+$/g, "");

const APP_SCHEME = (
  process.env.APP_DEEP_LINK_SCHEME ||
  process.env.MOBILE_DEEP_LINK_SCHEME ||
  "propenu"
).replace(/:\/\/.*$/g, "");

const normalizeToken = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

const normalizeCategory = (value: unknown) => {
  const token = normalizeToken(value);
  if (token === "plot" || token === "plots" || token === "landplot") return "land";
  if (token === "agriculture") return "agricultural";
  if (token === "featuredproject" || token === "featured-project") return "featuredproject";
  return token;
};

const toStringRecord = (data: Record<string, unknown> = {}) =>
  Object.entries(data).reduce<Record<string, string>>((result, [key, value]) => {
    if (value === undefined || value === null) return result;
    result[key] = String(value);
    return result;
  }, {});

const normalizePath = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return `${parsed.pathname}${parsed.search}`;
    }

    if (parsed.protocol.replace(":", "") === APP_SCHEME) {
      return `/${parsed.hostname}${parsed.pathname}${parsed.search}`.replace(/\/{2,}/g, "/");
    }
  } catch {
    // Treat as a relative application path below.
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
};

const getNotificationCenterPath = (audience: string) => {
  if (audience === "builder") return "/builder/notifications";
  if (audience === "agent") return "/agent/notifications";
  if (audience === "admin") return "/admin/notifications";
  return "/notifications";
};

const inferPathFromData = (data: Record<string, string>) => {
  const explicitPath = normalizePath(data.path || data.targetPath || data.link);
  if (explicitPath) return explicitPath;

  const type = normalizeToken(data.type);
  const audience = normalizeToken(data.audience);

  if (type.startsWith("ticket-")) {
    if (audience === "assignee") return "/admin/notifications";
    return "/support";
  }

  if (
    type.startsWith("payment-") ||
    type.startsWith("subscription-") ||
    type === "plan-upgrade-reminder"
  ) {
    return data.invoiceUrl ? "/my-plan" : "/plans";
  }

  const slug = String(data.slug || "").trim();
  const category = normalizeCategory(
    data.category ||
      data.propertyType ||
      data.categoryType ||
      data.listingCategory,
  );
  const listingKind = normalizeToken(data.listingKind);
  const promotionType = normalizeToken(data.promotionType);

  if (slug && (listingKind === "project" || category === "featuredproject")) {
    return promotionType === "prime" ? `/prime/${slug}` : `/project/${slug}`;
  }

  if (slug && category) {
    return `/properties/${category}/${slug}`;
  }

  if (data.projectId || data.listingId) {
    if (audience === "builder") return "/builder/my-projects";
    if (audience === "owner" || audience === "agent") return "/my-properties";
  }

  return getNotificationCenterPath(audience);
};

export const buildNotificationLinkData = (
  data: Record<string, unknown> = {},
): Record<string, string> => {
  const stringData = toStringRecord(data);
  const path = inferPathFromData(stringData);
  const webUrl = new URL(path || "/", WEB_ORIGIN).toString();
  const deepLinkPath = (path || "/").replace(/^\/+/, "");
  const deepLink = `${APP_SCHEME}://${deepLinkPath || "home"}`;

  return {
    ...stringData,
    path: path || "/",
    url: stringData.url && /^https?:\/\//i.test(stringData.url) ? stringData.url : webUrl,
    webUrl,
    deepLink: stringData.deepLink || deepLink,
  };
};
