import { FeaturedProject } from "@/types";
import { IAgricultural } from "@/types/agricultural";
import { ICommercial } from "@/types/commercial";
import { ILand } from "@/types/land";
import { IResidential } from "@/types/residential";

const url = process.env.NEXT_PUBLIC_API_URL


export type BlogDetail = {
  _id?: string;
  title: string;
  url?: string;
  videoTitle?: string;
  videoDescription?: string;
  slug: string;
  excerpt: string;
  featuredImage: string;
  imageAlt?: string;
  content: string;
  articleSections?: {
    heading?: string;
    content?: string;
  }[];
  author?: {
    name?: string;
    profileImage?: string;
    designation?: string;
    description?: string;
  };
  category: string;
  tags?: string[];
  faqs?: {
    question: string;
    answer: string;
  }[];
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  canonicalUrl?: string;
  publishedAt?: string;
  createdAt?: string;
  readTime?: number;
  views?: number;
  likes?: number;
  shares?: number;
};

export type BlogPreview = {
  _id?: string;
  title: string;
  slug: string;
  featuredImage?: string;
  imageAlt?: string;
  category?: string;
  excerpt?: string;
  tags?: string[];
  publishedAt?: string;
  createdAt?: string;
  readTime?: number;
  views?: number;
  likes?: number;
  shares?: number;
};

export type BlogListParams = {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  tag?: string;
  published?: boolean;
  featured?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export async function getBlogs(params: BlogListParams = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, String(value));
    }
  });

  const queryString = query.toString();
  const endpoint = `${url}/api/properties/blogs${queryString ? `?${queryString}` : ""}`;
  const res = await fetch(endpoint, {
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch blogs");
  }

  const json = await res.json();

  return {
    items: (json.items ?? json.data ?? []) as BlogPreview[],
    data: (json.data ?? json.items ?? []) as BlogPreview[],
  };
}

export async function getBlogBySlug({ slug }: { slug: string }) {
  const res = await fetch(
    `${url}/api/properties/blogs/slug/${encodeURIComponent(slug)}`,
    {
      next: { revalidate: 10 },
    }
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error("Failed to fetch blog");
  }

  const json = await res.json();
  return json.data as BlogDetail;
}

export async function getBlogArticleLists() {
  const res = await fetch(`${url}/api/properties/blogs?published=true&limit=1`, {
    next: { revalidate: 10 },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch blog article lists");
  }

  const json = await res.json();

  return {
    recentArticles: (json.recentArticles ?? []) as BlogPreview[],
    popularArticles: (json.popularArticles ?? []) as BlogPreview[],
  };
}


export async function getFeaturedSlugProjects({ slug }: { slug: string }) {
  const res = await fetch(`${url}/api/properties/featured-project/slug/${encodeURIComponent( slug )}`,
    {
      next: { revalidate: 10 }, // ISR – recommended by Next.js
    }
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Failed to fetch featured project");
  }
  const json = await res.json();
  return json.data as FeaturedProject;
}

export async function incrementProjectClicks(id: string) {
  try {
    const res = await fetch(`${url}/api/properties/featured-project/${id}/click`, {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Failed to increment project clicks:", await res.text());
    }
  } catch (err) {
    console.error("Error incrementing project clicks:", err);
  }
}







//top projects properties
export async function  getTopProjects() {
    const res = await fetch(`${url}/api/properties/top-projects`, {next : { revalidate: 10}});
    if(!res.ok) {
        throw new Error('Failed to fetch Top Projects');
    } 
    return res.json();
}


//residential

export async function getResidentialSlugProjects ({ slug }: { slug: string }) {
  
  const res = await fetch(`${url}/api/properties/residential/slug/${encodeURIComponent( slug )}`,
    {
      next: { revalidate: 10 }, // ISR – recommended by Next.js
    }
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Failed to fetch featured project");
  }
  const json = await res.json();
 return {
    ...json.data,
    relatedProjects: json.relatedProjects ?? [],
  } as IResidential;
}


//commercial
export async function getCommercialSlugProjects ({ slug }: { slug: string }) {
 
  const res = await fetch(`${url}/api/properties/commercial/slug/${encodeURIComponent( slug )}`,
    {
      next: { revalidate: 10 }, // ISR – recommended by Next.js
    }
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Failed to fetch featured project");
  }
  const json = await res.json();
  return json.data as ICommercial;
}

//agricultural

export async function getAgriculturalSlugProjects ({ slug }: { slug: string }) {

  const res = await fetch(`${url}/api/properties/agricultural/slug/${encodeURIComponent( slug )}`,
    {
      next: { revalidate: 10 }, // ISR – recommended by Next.js
    }
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Failed to fetch featured project");
  }
  const json = await res.json();
  return json.data as IAgricultural;
}

//land

export async function  getLandSlugProjects ({ slug }: { slug: string }) {

  const res = await fetch(`${url}/api/properties/land/slug/${encodeURIComponent( slug )}`,
    {
      next: { revalidate: 10 }, // ISR – recommended by Next.js
    }
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Failed to fetch featured project");
  }
  const json = await res.json();
  return json.data as ILand;
}

export async function getAgentDetails({ slug }: { slug: string }) {
  const res = await fetch(`${url}/api/users/agent/slug/${encodeURIComponent(slug)}`,
    {
      next: { revalidate: 10 }, // ISR – recommended by Next.js
    }
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Failed to fetch agent details");
  }
  const json = await res.json();
  return json.data;
}

export interface SiteLogoData {
  _id?: string;
  logoUrl?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SiteLogoResponse {
  success: boolean;
  data: SiteLogoData | null;
}

export interface BannerDeviceConfig {
  image?: string;
  clickUrl?: string;
  heading?: {
    enabled: boolean;
    html: string;
  };
  subheading?: {
    enabled: boolean;
    html: string;
  };
  location?: {
    state?: string;
    city?: string;
    locality?: string;
    subLocality?: string;
    /** Sponsored-style: { [state]: { [city]: localities[] } } */
    coverage?: Record<string, Record<string, string[]>>;
  };
}

export interface SiteBannerItem {
  _id: string;
  title?: string;
  priority?: number;
  location?: {
    state?: string;
    city?: string;
    locality?: string;
    subLocality?: string;
    coverage?: Record<string, Record<string, string[]>>;
  };
  devices?: {
    desktop?: BannerDeviceConfig;
    laptop?: BannerDeviceConfig;
    tablet?: BannerDeviceConfig;
    mobile?: BannerDeviceConfig;
  };
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  savedDevices?: string[];
}

export interface SiteBannersResponse {
  success: boolean;
  data: SiteBannerItem[];
}

export async function getSiteLogoServer(): Promise<SiteLogoResponse | null> {
  try {
    const res = await fetch(`${url}/api/properties/site-branding/logo`, {
      next: { revalidate: 600 },
    });

    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("Error fetching site logo:", error);
    return null;
  }
}

export async function getSiteBannersServer(): Promise<SiteBannersResponse | null> {
  try {
    const res = await fetch(`${url}/api/properties/site-branding/banners`, {
      next: { revalidate: 600 },
    });

    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("Error fetching site banners:", error);
    return null;
  }
}
