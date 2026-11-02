import { Suspense } from "react";
import Script from "next/script";
import { notFound } from "next/navigation";
import { getFeaturedSlugProjects, incrementProjectClicks } from "@/data/serverData";
import { FeaturedProject } from "@/types";
import HeroSection from "./HeroSection";
import Overview from "./Overview";
import ProjectImages from "./ProjectImages";
import FloorPlan from "./FloorPlan";
import Amenities from "./Amenities";
import LocationMap from "./LocationMap";
import Specifications from "./Specifications";
import AboutProject from "./AboutProject";
import ContactSeller from "./ContactSeller";
import ProjectVideos from "./ProjectVideos";
import BrochurePreview from "./BrochurePreview";
import ProjectViewDurationTracker from "../../prime/[slug]/ProjectViewDurationTracker";
import ProjectViewTracker from "@/components/tracking/ProjectViewTracker";
import PublicViewTracker from "@/components/tracking/PublicViewTracker";
import { buildListingStructuredData } from "@/utilies/structuredData";
import { absoluteSiteUrl, DEFAULT_OG_IMAGE } from "@/utilies/siteUrl";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const project = await getFeaturedSlugProjects({ slug });

  if (!project) {
    return {
      title: "Project Not Found",
      description: "Project not found",
    };
  }

  return {
    title: project.metaTitle || project.title,
    description: project.metaDescription || project.heroDescription,
    keywords: project.metaKeywords,
    alternates: {
      canonical: absoluteSiteUrl(`/project/${slug}`),
    },
    openGraph: {
      title: project.metaTitle || project.title,
      description: project.metaDescription || project.heroDescription,
      url: absoluteSiteUrl(`/project/${slug}`),
      siteName: "Propenu",
      type: "website",
      images: [
        {
          url: absoluteSiteUrl(
            project.heroImage ||
              project.gallerySummary?.[0]?.url ||
              project.logo?.url ||
              DEFAULT_OG_IMAGE,
          ),
          width: 1200, 
          height: 630,
          alt: project.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: project.metaTitle || project.title,
      description: project.metaDescription || project.heroDescription,
      images: [
        absoluteSiteUrl(
          project.heroImage ||
            project.gallerySummary?.[0]?.url ||
            project.logo?.url ||
            DEFAULT_OG_IMAGE,
        ),
      ],
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  let project: FeaturedProject | null = null;

  try {
    project = await getFeaturedSlugProjects({ slug });
  } catch (error) {
    console.error("Error fetching project:", error);
  }

  if (!project) {
    notFound();
  }

  if (project._id) {
    incrementProjectClicks(project._id).catch((e) =>
      console.error("Failed to increment project clicks:", e)
    );
  }

  const structuredData = buildListingStructuredData(
    {
      title: project.title,
      description: project.metaDescription || project.heroDescription,
      path: `/project/${project.slug}`,
      image: project.heroImage || project.gallerySummary?.[0]?.url,
      category: project.categoryType || project.propertyType || "Project",
      price: project.priceFrom,
      currency: project.currency || "INR",
      address: project.address,
      city: project.city,
      state: project.state,
      locality: project.locality,
      publishedAt: project.createdAt,
      updatedAt: project.updatedAt,
      sellerName:
        typeof project.developer === "string" ? project.developer : undefined,
    },
    "Projects",
    "/highlight-projects",
  );

  return (
    <>
      <Script
        id="project-listing-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <main className="min-h-screen bg-white">
        <PublicViewTracker entityType="project" entityId={project._id} />
        <ProjectViewDurationTracker projectId={project._id} />
        <ProjectViewTracker projectId={project._id} title={project.title} slug={project.slug} locality={project.locality} city={project.city} state={project.state} promotionType={project.promotion?.type || "normal"} />
        <ProjectViewDurationTracker projectId={project._id} />
        <HeroSection project={project} />
        <section className="bg-emerald-50/60 py-5">
          <div className="mx-0 flex min-w-0 flex-col gap-5 sm:mx-4 lg:mx-5 lg:flex-row lg:items-start xl:mx-28 2xl:mx-34">
            <div className="w-full min-w-0 flex-1 space-y-4">
              <Overview project={project} />
              <FloorPlan project={project} />
              <Amenities project={project} />
              <LocationMap project={project} />
              <Specifications project={project} />
              <ProjectImages project={project} />
              <ProjectVideos project={project} />
              <AboutProject project={project} />
              <BrochurePreview project={project} />
            </div>

            <div className="w-full shrink-0 lg:sticky lg:top-38 lg:w-80 xl:w-[340px]">
              <ContactSeller project={project} />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}


