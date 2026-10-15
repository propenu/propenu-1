import type { NextConfig } from "next";

const API_PROXY_TARGET = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {

  reactCompiler: true,

  // Invite email links that wrongly hit the web app (/api/properties/public/...)
  // are proxied to the API gateway so click → project preview still works.
  async redirects() {
    return [
      {
        source: "/search/filter",
        destination: "/properties?focus=filters",
        permanent: false,
      },
      {
        source: "/services",
        destination: "/explore-properties",
        permanent: false,
      },
      {
        source: "/support/ticket/:ticketId",
        destination: "/support?ticketId=:ticketId",
        permanent: false,
      },
      {
        source: "/builder/leads/:projectId",
        destination: "/builder/leads?projectId=:projectId",
        permanent: false,
      },
      {
        source: "/builder/user-shortlists",
        destination: "/builder/my-shortlists",
        permanent: false,
      },
      {
        source: "/properties/landploat/:slug",
        destination: "/properties/land/:slug",
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/api/properties/public/:path*",
        destination: `${API_PROXY_TARGET}/api/properties/public/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "propenu-uploads.s3.ap-south-1.amazonaws.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "propenu-uploads-data.s3.ap-south-1.amazonaws.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "randomuser.me",
        port: "",
        pathname: "/**",
      },
    ],
    unoptimized: true,
  },
};

export default nextConfig;
