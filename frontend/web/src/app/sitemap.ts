import { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_WEB_URL ||
  "https://propenu.com";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type SitemapEntity = {
  slug?: string;
  type?: string;
  listingSource?: string;
  promotion?: { type?: string };
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
};

function buildAbsoluteUrl(path: string) {
  return new URL(path, BASE_URL).toString();
}

function getLastModified(entry: SitemapEntity) {
  const value =
    entry.updatedAt ||
    entry.publishedAt ||
    entry.createdAt;

  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeSlug(value?: string) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

function isFeaturedProject(entry: SitemapEntity) {
  return (
    entry.type?.toLowerCase() === "featuredproject" ||
    entry.listingSource?.toLowerCase() === "featured"
  );
}

function toSitemapEntries(
  entries: SitemapEntity[],
  routePrefix: string,
  priority: number,
): MetadataRoute.Sitemap {
  const seen = new Set<string>();

  return entries.flatMap((entry) => {
    const slug = normalizeSlug(entry.slug);
    if (!slug || seen.has(slug)) {
      return [];
    }

    seen.add(slug);

    return [
      {
        url: buildAbsoluteUrl(`${routePrefix}/${slug}`),
        lastModified: getLastModified(entry),
        changeFrequency: "weekly" as const,
        priority,
      },
    ];
  });
}

function toProjectSearchEntries(entries: SitemapEntity[]): MetadataRoute.Sitemap {
  const seen = new Set<string>();

  return entries.flatMap((entry) => {
    if (!isFeaturedProject(entry)) return [];

    const slug = normalizeSlug(entry.slug);
    if (!slug) return [];

    const routePrefix =
      entry.promotion?.type?.toLowerCase() === "prime" ? "/prime" : "/project";
    const key = `${routePrefix}/${slug}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      url: buildAbsoluteUrl(key),
      lastModified: getLastModified(entry),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    }];
  });
}

async function fetchJson<T>(endpoint: string): Promise<T> {
  const res = await fetch(endpoint, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}`);
  }

  return res.json();
}

async function getProjects() {
  if (!API_URL) return [];

  try {
    const query = new URLSearchParams({
      type: "featured",
      limit: "1000",
    });
    const json = await fetchJson<{ items?: SitemapEntity[]; data?: SitemapEntity[] }>(
      `${API_URL}/api/properties/featured-project?${query.toString()}`,
    );

    return json.items ?? json.data ?? [];
  } catch (error) {
    console.error("Projects Sitemap Error:", error);
    return [];
  }
}

async function getPrimeProjects() {
  if (!API_URL) return [];

  try {
    const query = new URLSearchParams({
      type: "prime",
      limit: "1000",
    });
    const json = await fetchJson<{ items?: SitemapEntity[]; data?: SitemapEntity[] }>(
      `${API_URL}/api/properties/featured-project?${query.toString()}`,
    );

    return json.items ?? json.data ?? [];
  } catch (error) {
    console.error("Prime Sitemap Error:", error);
    return [];
  }
}

async function getBlogs() {
  if (!API_URL) return [];

  try {
    const query = new URLSearchParams({
      published: "true",
      limit: "1000",
      sortBy: "publishedAt",
      sortOrder: "desc",
    });
    const json = await fetchJson<{ items?: SitemapEntity[]; data?: SitemapEntity[] }>(
      `${API_URL}/api/properties/blogs?${query.toString()}`,
    );

    return json.items ?? json.data ?? [];
  } catch (error) {
    console.error("Blog Sitemap Error:", error);
    return [];
  }
}

async function getSearchProperties(category: string) {
  if (!API_URL) return [];

  try {
    const query = new URLSearchParams({
      category,
      listingType: "sale",
    });
    const res = await fetch(`${API_URL}/api/properties/search?${query.toString()}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch search properties for ${category}`);
    }

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await res.json();
      return (json.items ?? json.data ?? []) as SitemapEntity[];
    }

    const payload = await res.text();
    if (!payload.trim()) {
      return [];
    }

    return payload
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as SitemapEntity & { __meta?: unknown };
          return parsed.__meta ? [] : [parsed];
        } catch {
          return [];
        }
      });
  } catch (error) {
    console.error(`${category} Sitemap Error:`, error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    "",
    "/blogs",
    "/postproperty",
    "/plans",
    "/agent-connect",
    "/owner-listed",
    "/builder",
    "/agent",
    "/reviews",
    "/about",
    "/privacy",
    "/terms",
    "/help-center",
    "/safety-guide",
    "/home-loans",
    "/home-care",
    "/interior-designer",
    "/properties/residential",
    "/properties/commercial",
    "/properties/land",
    "/properties/agricultural",
  ].map((route) => ({
    url: buildAbsoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: route === "" ? 1 : 0.8,
  }));

  const [
    projects,
    primeProjects,
    blogs,
    residentialProperties,
    commercialProperties,
    landProperties,
    agriculturalProperties,
  ] = await Promise.all([
    getProjects(),
    getPrimeProjects(),
    getBlogs(),
    getSearchProperties("Residential"),
    getSearchProperties("Commercial"),
    getSearchProperties("Land"),
    getSearchProperties("Agricultural"),
  ]);

  const projectPages = toSitemapEntries(projects, "/project", 0.9);
  const primePages = toSitemapEntries(primeProjects, "/prime", 0.9);
  const blogPages = toSitemapEntries(blogs, "/blogs", 0.7);
  const residentialPages = toSitemapEntries(
    residentialProperties.filter((entry) => !isFeaturedProject(entry)),
    "/properties/residential",
    0.85,
  );
  const commercialPages = toSitemapEntries(
    commercialProperties.filter((entry) => !isFeaturedProject(entry)),
    "/properties/commercial",
    0.85,
  );
  const landPages = toSitemapEntries(
    landProperties.filter((entry) => !isFeaturedProject(entry)),
    "/properties/land",
    0.8,
  );
  const agriculturalPages = toSitemapEntries(
    agriculturalProperties.filter((entry) => !isFeaturedProject(entry)),
    "/properties/agricultural",
    0.8,
  );
  const projectSearchPages = toProjectSearchEntries([
    ...residentialProperties,
    ...commercialProperties,
    ...landProperties,
    ...agriculturalProperties,
  ]);

  const entries = [
    ...staticPages,
    ...projectPages,
    ...primePages,
    ...projectSearchPages,
    ...blogPages,
    ...residentialPages,
    ...commercialPages,
    ...landPages,
    ...agriculturalPages,
  ];

  const seenUrls = new Set<string>();
  return entries.filter((entry) => {
    if (seenUrls.has(entry.url)) return false;
    seenUrls.add(entry.url);
    return true;
  });
}
