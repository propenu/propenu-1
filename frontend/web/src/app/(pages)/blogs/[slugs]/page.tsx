import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";
import {
  FiCalendar,
  FiChevronDown,
  FiClock,
  FiEye,
  FiHeart,
  FiShare2,
} from "react-icons/fi";
import {
  BlogDetail,
  BlogPreview,
  getBlogArticleLists,
  getBlogBySlug,
} from "@/data/serverData";
import { buildBlogPostingStructuredData } from "@/utilies/structuredData";
import { absoluteSiteUrl, DEFAULT_OG_IMAGE } from "@/utilies/siteUrl";
import BlogActions from "./BlogActions";

type PageProps = {
  params: { slugs: string } | Promise<{ slugs: string }>;
};

const fallbackImage = "/images/placeholder.svg";

function formatShortDate(value?: string) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function hasHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function stripHtml(value?: string) {
  if (!value) return "";

  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getVideoEmbedUrl(value?: string) {
  if (!value) return null;

  try {
    const videoUrl = new URL(value);
    const host = videoUrl.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = videoUrl.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }

    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      const id = videoUrl.searchParams.get("v") || videoUrl.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }

    if (["vimeo.com", "player.vimeo.com"].includes(host)) {
      const id = videoUrl.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function isDirectVideoUrl(value?: string) {
  return !!value && /\.(mp4|webm|ogg)(?:$|[?#])/i.test(value);
}

function normalizeBlogHtml(content: string) {
  return content
    .replace(/<p>(?:&nbsp;|\s|<span[^>]*>&nbsp;<\/span>)*<\/p>/gi, "")
    .replace(
      /<p>\s*(?:<span[^>]*>)?\s*●\s*(?:<\/span>)?(?:<span[^>]*>(?:&nbsp;|\s)+<\/span>)*(?:<span[^>]*>)?\s*&nbsp;\s*([\s\S]*?)\s*(?:<\/span>)?\s*<\/p>/gi,
      "<ul><li>$1</li></ul>",
    )
    .replace(/<\/ul>\s*<ul>/gi, "");
}

function getArticleSectionId(heading: string, index: number) {
  const slug = heading
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `article-section-${slug || index}-${index}`;
}

function getAuthorInitials(name?: string) {
  if (!name) return "P";

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ContentBlock({ content }: { content?: string }) {
  if (!content) return null;

  if (hasHtml(content)) {
    const normalizedContent = normalizeBlogHtml(content);

    return (
      <div className="overflow-x-auto">
        <div
          className="min-w-0 text-[15px] leading-7 text-gray-700 sm:text-base sm:leading-8 [&_a]:font-semibold [&_a]:text-[#26ad5f] [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-[#27AE60] [&_blockquote]:bg-[#f7fcf8] [&_blockquote]:pl-4 [&_blockquote]:pr-3 [&_blockquote]:py-2 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_em]:italic [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-gray-950 sm:[&_h1]:text-3xl [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-950 sm:[&_h2]:text-2xl [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-950 sm:[&_h3]:text-xl [&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-gray-200 [&_img]:shadow-sm [&_li]:mb-2 [&_li]:ml-2 [&_li_p]:mb-0 [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_p.has-text-align-center]:text-center [&_p.has-text-align-right]:text-right [&_strong]:font-semibold [&_strong]:text-gray-950 [&_sub]:align-sub [&_sup]:align-super [&_table]:my-6 [&_table]:w-full [&_table]:min-w-[640px] [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:overflow-hidden [&_table]:rounded-xl [&_table]:border [&_table]:border-gray-200 [&_table]:bg-white [&_table]:shadow-sm [&_tbody_tr:nth-child(even)]:bg-[#f7fcf8] [&_tbody_tr:hover]:bg-[#f3fbf6] [&_td]:border-b [&_td]:border-r [&_td]:border-gray-200 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_td]:text-sm [&_td:last-child]:border-r-0 [&_tbody_tr:last-child_td]:border-b-0 [&_th]:border-b [&_th]:border-r [&_th]:border-gray-200 [&_th]:bg-[#eef6f1] [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_th]:text-gray-950 [&_th:last-child]:border-r-0 [&_thead]:bg-[#eef6f1] [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_.has-text-align-center]:text-center [&_.has-text-align-left]:text-left [&_.has-text-align-right]:text-right [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&>h1:first-child]:mt-0 [&>h2:first-child]:mt-0 [&>h3:first-child]:mt-0 [&>p:first-child]:mt-0"
          dangerouslySetInnerHTML={{ __html: normalizedContent }}
        />
      </div>
    );
  }

  return (
    <p className="whitespace-pre-line text-[15px] leading-7 text-gray-700 sm:text-base sm:leading-8">
      {content}
    </p>
  );
}

function InfoItem({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
      {icon}
      {label}
    </span>
  );
}

function PopularArticleCard({ article }: { article: BlogPreview }) {
  return (
    <Link
      href={`/blogs/${article.slug}`}
      className="group flex gap-3 rounded-lg border border-gray-100 p-3 transition hover:border-green-100 hover:bg-green-50/40 bg-white"
    >
      <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
        <Image
          src={article.featuredImage || fallbackImage}
          alt={article.imageAlt || article.title}
          fill
          sizes="80px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="min-w-0">
        {article.category && (
          <p className="truncate text-xs font-medium text-[#26ad5f]">
            {article.category}
          </p>
        )}
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-gray-950 transition group-hover:text-[#26ad5f]">
          {article.title}
        </h3>
        <p className="mt-1 text-xs text-gray-400">5 min read</p>
      </div>
    </Link>
  );
}

function RecentArticleCard({ article }: { article: BlogPreview }) {
  return (
    <Link
      href={`/blogs/${article.slug}`}
      className="group block overflow-hidden rounded-lg border border-gray-100 bg-white transition hover:border-green-100 hover:shadow-sm"
    >
      <div className="relative aspect-video bg-gray-100">
        <Image
          src={article.featuredImage || fallbackImage}
          alt={article.imageAlt || article.title}
          fill
          sizes="(max-width: 768px) 100vw, 260px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="p-4">
        {article.category && (
          <p className="mb-2 text-xs font-medium text-[#26ad5f]">
            {article.category}
          </p>
        )}
        <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-gray-950 transition group-hover:text-[#26ad5f]">
          {article.title}
        </h3>
      </div>
    </Link>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { slugs } = await params;
  const blog = await getBlogBySlug({ slug: slugs });

  if (!blog) {
    return {
      title: "Blog Not Found",
      description: "Blog not found",
    };
  }

  return {
    title: blog.metaTitle || blog.title,
    description: blog.metaDescription || blog.excerpt,
    keywords: blog.metaKeywords,
    alternates: {
      canonical: blog.canonicalUrl || absoluteSiteUrl(`/blogs/${slugs}`),
    },
    openGraph: {
      title: blog.metaTitle || blog.title,
      description: blog.metaDescription || blog.excerpt,
      url: blog.canonicalUrl || absoluteSiteUrl(`/blogs/${slugs}`),
      siteName: "Propenu",
      type: "article",
      publishedTime: blog.publishedAt || blog.createdAt,
      authors: blog.author?.name ? [blog.author.name] : undefined,
      tags: blog.tags,
      images: [
        {
          url: absoluteSiteUrl(blog.featuredImage || DEFAULT_OG_IMAGE),
          width: 1200,
          height: 630,
          alt: blog.imageAlt || blog.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: blog.metaTitle || blog.title,
      description: blog.metaDescription || blog.excerpt,
      images: [absoluteSiteUrl(blog.featuredImage || DEFAULT_OG_IMAGE)],
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slugs } = await params;
  let blog: BlogDetail | null = null;
  let recentArticles: BlogPreview[] = [];
  let popularArticles: BlogPreview[] = [];

  try {
    blog = await getBlogBySlug({ slug: slugs });
  } catch (error) {
    console.error("Error fetching blog:", error);
  }

  if (!blog) {
    notFound();
  }

  try {
    const articleLists = await getBlogArticleLists();

    recentArticles = articleLists.recentArticles.filter(
      (article) => article.slug !== slugs,
    );
    popularArticles = articleLists.popularArticles.filter(
      (article) => article.slug !== slugs,
    );
  } catch (error) {
    console.error("Error fetching blog article lists:", error);
  }

  const shortPublishedDate = formatShortDate(blog.publishedAt ?? blog.createdAt);
  const structuredData = buildBlogPostingStructuredData({
    title: blog.title,
    description: blog.metaDescription || blog.excerpt,
    slug: blog.slug,
    image: blog.featuredImage,
    imageAlt: blog.imageAlt,
    publishedAt: blog.publishedAt ?? blog.createdAt,
    updatedAt: blog.createdAt,
    authorName: blog.author?.name,
    category: blog.category,
    tags: blog.tags,
    faqs: blog.faqs,
  });
  const articleContext = (blog.articleSections ?? [])
    .map((section, index) =>
      section.heading
        ? {
          heading: section.heading,
          id: getArticleSectionId(section.heading, index),
        }
        : null,
    )
    .filter((item): item is { heading: string; id: string } => Boolean(item));

  return (
    <>
      <Script
        id="blog-posting-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <main className="min-h-screen bg-[#f6fbf8] py-6">
        <section className="container">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,850px)_260px] lg:items-start lg:justify-center">
          <article className="min-w-0 max-w-[850px]">
            <h1 className="max-w-3xl text-[28px] font-semibold leading-9 text-gray-950 sm:text-4xl sm:leading-tight">
              {blog.title}
            </h1>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <InfoItem
                  icon={<FiClock size={14} />}
                  label={`${blog.readTime ?? 5} min read`}
                />
                {shortPublishedDate && (
                  <InfoItem
                    icon={<FiCalendar size={14} />}
                    label={shortPublishedDate}
                  />
                )}
              </div>

              <BlogActions
                blogId={blog._id}
                title={blog.title}
                initialLikes={blog.likes}
                initialShares={blog.shares}
              />
            </div>

            {/* Hero frame matches admin upload spec 1600×770 (aspect 16/7.7).
                object-contain avoids cutting banner edges; correct uploads fill the box. */}
            <div className="relative mt-5 aspect-[16/7.7] w-full overflow-hidden rounded-xl bg-[#eef6f1]">
              <Image
                src={blog.featuredImage || fallbackImage}
                alt={blog.imageAlt || blog.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 850px"
                className="object-contain"
              />
            </div>

  

            {blog.excerpt && (
              <div className="mt-6">
                <ContentBlock content={blog.excerpt} />
              </div>
            )}

            <div className="mt-6">
              <ContentBlock content={blog.content} />

              {(blog.url || blog.videoTitle || blog.videoDescription) && (
                <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  {blog.videoTitle && (
                    <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                      <h2 className="text-xl font-semibold text-gray-950 sm:text-2xl">
                        {blog.videoTitle}
                      </h2>
                    </div>
                  )}
                  {blog.url && getVideoEmbedUrl(blog.url) && (
                    <div className="mt-4 aspect-video w-full bg-black">
                      <iframe
                        src={getVideoEmbedUrl(blog.url)!}
                        title={blog.videoTitle || blog.title}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                  )}
                  {blog.url && isDirectVideoUrl(blog.url) && (
                    <video
                      className="mt-4 aspect-video w-full bg-black"
                      src={blog.url}
                      controls
                      preload="metadata"
                    >
                      Your browser does not support video playback.
                    </video>
                  )}
                  {blog.videoDescription && (
                    <p className="px-5 py-4 text-sm leading-6 text-gray-600 sm:px-6">
                      {blog.videoDescription}
                    </p>
                  )}
                  {blog.url && !getVideoEmbedUrl(blog.url) && !isDirectVideoUrl(blog.url) && (
                    <div className="px-5 pb-5 pt-4 sm:px-6">
                      <a
                        href={blog.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-[#26ad5f] underline"
                      >
                        Watch video
                      </a>
                    </div>
                  )}
                </section>
              )}

              {blog.articleSections?.map((section, index) => (
                <section
                  key={`${section.heading}-${section.content}`}
                  id={
                    section.heading
                      ? getArticleSectionId(section.heading, index)
                      : undefined
                  }
                  tabIndex={section.heading ? -1 : undefined}
                  className="mt-8 scroll-mt-8 focus:outline-none"
                >
                  {section.heading && (
                    <h2 className="mb-3 text-xl font-semibold text-gray-950 sm:text-2xl">
                      {section.heading}
                    </h2>
                  )}
                  <ContentBlock content={section.content} />
                </section>
              ))}

              {blog.faqs && blog.faqs.length > 0 && (
                <section className="mt-12">
                  <h2 className="text-xl font-semibold text-gray-950 sm:text-2xl">
                    Frequently Asked Questions
                  </h2>
                  <div className="mt-5">
                    {blog.faqs.map((faq) => (
                      <details
                        key={faq.question}
                        className="group py-4"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-normal text-gray-600 marker:hidden [&::-webkit-details-marker]:hidden">
                          <span>{stripHtml(faq.question)}</span>
                          <FiChevronDown
                            size={16}
                            className="shrink-0 text-gray-600 transition group-open:rotate-180"
                          />
                        </summary>
                        <div className="mt-3 pr-8">
                          <ContentBlock content={faq.answer} />
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}

              {blog.author && (
                <section className="mt-12 rounded-lg border border-gray-200 bg-white p-5">
                  <p className="mb-3 text-xs font-semibold uppercase text-[#26ad5f]">
                    Written by
                  </p>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#27AE60] text-base font-semibold text-[#26ad5f] shadow-sm">
                      <span>{getAuthorInitials(blog.author.name)}</span>
                    </div>

                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-gray-950">
                        {blog.author.name || "Propenu Editorial"}
                      </h2>
                      {blog.author.designation && (
                        <p className="mt-1 text-sm text-gray-500">
                          {blog.author.designation}
                        </p>
                      )}

                      {blog.author.description && (
                        <div className="mt-3 text-sm leading-6 text-gray-600">
                          <ContentBlock content={blog.author.description} />
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {recentArticles.length > 0 && (
                <section className="mt-12">
                  <h2 className="text-xl font-semibold text-gray-950 sm:text-2xl">
                    Recent Articles
                  </h2>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {recentArticles.map((article) => (
                      <RecentArticleCard
                        key={article._id ?? article.slug}
                        article={article}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </article>

          <aside className="space-y-5 self-start lg:sticky lg:top-20">
            <div className="space-y-3 text-xs text-gray-500">
              <p className="flex items-center gap-2">
                <FiEye size={14} />
                <span>{blog.views ?? 0} Views</span>
              </p>

              <p className="flex items-center gap-2">
                <FiShare2 size={14} />
                <span>{blog.shares ?? 0} Shares</span>
              </p>

              <p className="flex items-center gap-2">
                <FiHeart size={14} />
                <span>{blog.likes ?? 0} Likes</span>
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8F5EE] bg-white p-6 text-center">
              <h3 className="mb-2 text-lg font-medium leading-tight text-gray-800">
                Sell/Rent Your Property <br />
                with us for <span className="text-[#27A361]">Free</span>
              </h3>

              <p className="mb-5 text-xs text-gray-500">
                Find Buyers & Tenants easily
              </p>

              <Link
                href="/postproperty"
                className="btn-primary flex items-center justify-center"
              >
                Post Property
              </Link>
            </div>

            
            {articleContext.length > 0 && (
              <div className="mt-5 pb-2">
                <h2 className="text-lg font-semibold text-gray-950">
                  Article Context
                </h2>

                <ul className="mt-3 space-y-2">
                  {articleContext.map((item, index) => (
                    <li key={`${item.id}-${index}`}>
                      <a
                        href={`#${item.id}`}
                        className="group flex items-start gap-2 text-sm leading-6 text-gray-500 transition hover:text-[#26ad5f] focus:outline-none focus-visible:text-[#26ad5f]"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400 transition group-hover:bg-[#26ad5f]" />
                        <span>{item.heading}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}



            {popularArticles.length > 0 && (
              <div className="border-t border-gray-200 pt-5">
                <h2 className="text-sm font-semibold text-gray-950">
                  Popular Articles
                </h2>

                <div className="mt-4 space-y-3">
                  {popularArticles.map((article) => (
                    <PopularArticleCard
                      key={article._id ?? article.slug}
                      article={article}
                    />
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
        </section>
      </main>
    </>
  );
}
