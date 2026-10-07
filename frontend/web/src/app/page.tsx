export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { absoluteSiteUrl } from "@/utilies/siteUrl";

export const metadata: Metadata = {
  alternates: {
    canonical: absoluteSiteUrl("/"),
  },
};

export default function Home() {
  return <HomeClient />;
}
