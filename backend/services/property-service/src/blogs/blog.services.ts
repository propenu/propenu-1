import mongoose, { FilterQuery, SortOrder } from "mongoose";
import Blog from "./blog.model";

export type BlogQueryOptions = {
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

const allowedSortFields = new Set([
  "createdAt",
  "updatedAt",
  "publishedAt",
  "views",
  "likes",
  "shares",
  "title",
  "readTime",
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean);
}

/** Multipart FormData sends booleans as "true"/"false" strings. */
function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0 || value === "")
    return false;
  return undefined;
}

function withPublishDate(payload: Record<string, any>) {
  const next = { ...payload };

  if (!next.slug && next.title) {
    next.slug = toSlug(next.title);
  } else if (next.slug) {
    next.slug = toSlug(next.slug);
  }

  if (next.tags) next.tags = normalizeTags(next.tags);
  if (next.metaKeywords) next.metaKeywords = normalizeTags(next.metaKeywords);

  const published = coerceBoolean(next.published);
  if (published !== undefined) next.published = published;

  const featured = coerceBoolean(next.featured);
  if (featured !== undefined) next.featured = featured;

  if (next.readTime !== undefined && next.readTime !== null && next.readTime !== "") {
    const n = Number(next.readTime);
    if (!Number.isNaN(n) && n > 0) next.readTime = n;
    else delete next.readTime;
  } else if (next.readTime === "" || next.readTime === null) {
    delete next.readTime;
  }

  if (typeof next.featuredImage === "string") {
    next.featuredImage = next.featuredImage.trim();
  } else if (next.featuredImage == null) {
    next.featuredImage = "";
  }

  if (next.content == null) next.content = "";
  if (next.url == null) next.url = "";
  if (next.videoTitle == null) next.videoTitle = "";
  if (next.videoDescription == null) next.videoDescription = "";
  if (next.category == null) next.category = "";
  if (next.metaTitle == null || next.metaTitle === "") {
    next.metaTitle = next.title || "";
  }
  if (next.metaDescription == null) next.metaDescription = "";

  if (!next.author || typeof next.author !== "object") {
    next.author = {
      name: "",
      designation: "",
      description: "",
      socialLinks: { linkedin: "", twitter: "", website: "" },
    };
  } else {
    next.author = {
      name: next.author.name || "",
      designation: next.author.designation || "",
      description: next.author.description || "",
      profileImage: next.author.profileImage || "",
      socialLinks: {
        linkedin: next.author.socialLinks?.linkedin || "",
        twitter: next.author.socialLinks?.twitter || "",
        website: next.author.socialLinks?.website || "",
      },
    };
  }

  if (Array.isArray(next.faqs)) {
    next.faqs = next.faqs.filter(
      (faq: any) =>
        String(faq?.question || "").trim() || String(faq?.answer || "").trim(),
    );
  }

  if (Array.isArray(next.articleSections)) {
    next.articleSections = next.articleSections.filter(
      (sec: any) =>
        String(sec?.heading || "").trim() || String(sec?.content || "").trim(),
    );
  }

  if (next.published === true && !next.publishedAt) {
    next.publishedAt = new Date();
  }

  if (next.published === false) {
    next.publishedAt = null;
  }

  return next;
}

async function ensureUniqueSlug(slug: string, excludeId?: string) {
  const baseSlug = slug || "blog";
  let candidate = baseSlug;
  let suffix = 1;

  while (
    await Blog.exists({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

const sidebarArticleLimit = 5;
const articlePreviewFields =
  "title slug featuredImage imageAlt category views likes shares";

export const BlogService = {
  async createBlog(payload: Record<string, any>) {
    const next = withPublishDate(payload);
    next.slug = await ensureUniqueSlug(next.slug || toSlug(next.title));

    return Blog.create(next);
  },

  async getBlogs(options: BlogQueryOptions = {}) {
    const page = Math.max(Number(options.page) || 1, 1);
    const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter: FilterQuery<any> = {};

    if (options.q) {
      const query = new RegExp(escapeRegExp(options.q), "i");
      filter.$or = [
        { title: query },
        { excerpt: query },
        { content: query },
        { category: query },
        { tags: query },
      ];
    }

    if (options.category) {
      filter.category = new RegExp(`^${escapeRegExp(options.category)}$`, "i");
    }

    if (options.tag) {
      filter.tags = new RegExp(`^${escapeRegExp(options.tag)}$`, "i");
    }

    if (typeof options.published === "boolean") {
      filter.published = options.published;
    }

    if (typeof options.featured === "boolean") {
      filter.featured = options.featured;
    }

    const sortField = options.sortBy && allowedSortFields.has(options.sortBy)
      ? options.sortBy
      : "createdAt";
    const sortDirection: SortOrder = options.sortOrder === "asc" ? 1 : -1;

    const [items, total, recentArticles, popularArticles] = await Promise.all([
      Blog.find(filter)
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limit)
        .lean(),
      Blog.countDocuments(filter),
      Blog.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .select(articlePreviewFields)
        .limit(sidebarArticleLimit)
        .lean(),
      Blog.find(filter)
        .sort({ views: -1, publishedAt: -1, createdAt: -1 })
        .select(articlePreviewFields)
        .limit(sidebarArticleLimit)
        .lean(),
    ]);

    return {
      items,
      recentArticles,
      popularArticles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async getBlogById(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Blog.findById(id);
  },

  async getBlogBySlug(slug: string) {
    return Blog.findOne({ slug: toSlug(slug) });
  },

  async updateBlog(id: string, payload: Record<string, any>) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const next = withPublishDate(payload);
    if (next.slug) {
      next.slug = await ensureUniqueSlug(next.slug, id);
    } else if (next.title) {
      next.slug = await ensureUniqueSlug(toSlug(next.title), id);
    }

    return Blog.findByIdAndUpdate(id, next, {
      new: true,
      runValidators: true,
    });
  },

  async deleteBlog(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Blog.findByIdAndDelete(id);
  },

  async incrementViews(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Blog.findByIdAndUpdate(id, { $inc: { views: 1 } });
  },

  async incrementLikes(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Blog.findByIdAndUpdate(
      id,
      { $inc: { likes: 1 } },
      { new: true },
    ).select("likes shares views");
  },

  async incrementShares(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Blog.findByIdAndUpdate(
      id,
      { $inc: { shares: 1 } },
      { new: true },
    ).select("likes shares views");
  },
};
