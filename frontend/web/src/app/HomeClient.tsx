"use client";

import TestomianalHome from "./(pages)/reviews/TestomianalHome";
import ExploreMorePropertiesPage from "./(pages)/explore-properties/Explore-properties";
import ExploreOurServices from "@/app/(pages)/explore-properties/ExploreOurServices";
import FeaturedProjectsClient from "./(pages)/prime/FeaturedProjectsClient";
import HighlightProjectsClient from "./(pages)/highlight-projects/HighlightProjectsClient";
import AgentsList from "./(pages)/agent-connect/AgentCard";
import PopularOwnerPropertiesClient from "./(pages)/owner-listed/PopularOwnerPropertiesClient";
import Banner from "@/components/Banner";

import DiscoverRealestate from "@/components/discoverRealestate/DiscoverRealestate";
import ResidentialLinks from "@/components/quickLinks/ResidentialLinks";
import CommercialLinks from "@/components/quickLinks/CommercialLinks";
import LandLinks from "@/components/quickLinks/LandLinks";
import AgriculturalLinks from "@/components/quickLinks/AgriculturalLinks";
import BlogsClient from "./(pages)/blogs/BlogsClient";

export default function HomeClient() {
  return (
    <div>
      <Banner />
      <div className="container mx-auto space-y-10">
        <FeaturedProjectsClient />
        <HighlightProjectsClient />
        <PopularOwnerPropertiesClient />
        <AgentsList />
        <ExploreOurServices />
        <ExploreMorePropertiesPage />
        <TestomianalHome />
        <DiscoverRealestate />
        <BlogsClient />
        <ResidentialLinks />
        <CommercialLinks />
        <LandLinks />
        <AgriculturalLinks />
      </div>
    </div>
  );
}
