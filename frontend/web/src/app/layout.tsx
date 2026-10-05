import type { Metadata } from "next";
import "./global.css";
import "leaflet/dist/leaflet.css";
import ClientProviders from "@/app/clientLayout"; // client component – used inside <body>
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next"
import UserJourneyTracker from "@/components/tracking/UserJourneyTracker";
import { absoluteSiteUrl, DEFAULT_OG_IMAGE, SITE_URL } from "@/utilies/siteUrl";


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Propenu",
  title: "Propenu | Smart, Trusted & Verified Real Estate Platform",
  description:
    "Post your property on Propenu and sell smarter. Verified listings, genuine buyers, and a completely spam-free experience.",
  keywords: [
    "Real Estate",
    "Property Management",
    "Tenant Portal",
    "Rental Management",
    "Lease Management",
    "Real Estate Dashboard",
  ],
  openGraph: {
    title: "Propenu | Smart, Trusted & Verified Real Estate Platform",
    description:
      "Post your property on Propenu and sell smarter. Verified listings, genuine buyers, and a completely spam-free experience.",
    url: absoluteSiteUrl("/"),
    siteName: "Propenu",
    type: "website",
    images: [
      {
        url: absoluteSiteUrl(DEFAULT_OG_IMAGE),
        width: 1200,
        height: 630,
        alt: "Propenu real estate platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Propenu | Smart, Trusted & Verified Real Estate Platform",
    description:
      "Post your property on Propenu and sell smarter. Verified listings, genuine buyers, and a completely spam-free experience.",
    images: [absoluteSiteUrl(DEFAULT_OG_IMAGE)],
  },
  appLinks: {
    ios: {
      url: "propenu://",
      app_name: "Propenu",
    },
    android: {
      package: "com.propenu.app",
      url: "propenu://",
      app_name: "Propenu",
    },
    web: {
      url: absoluteSiteUrl("/"),
      should_fallback: true,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="msvalidate.01"
          content="45124C07DE0224D7D653C8D2B5EDA257"
        />
        <meta
          name="p:domain_verify"
          content="f80dc643708108d5908cbac2e3da68d4"
        />

        <Script id="google-tag-manager" strategy="beforeInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-TJMKXQR5');`}
        </Script>
        <Script id="strip-extension-hydration-attrs" strategy="beforeInteractive">
          {`(() => {
  const attr = "bis_skin_checked";
  const strip = (root = document) => {
    root.querySelectorAll?.("[" + attr + "]").forEach((node) => node.removeAttribute(attr));
  };
  strip();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === attr) {
        mutation.target.removeAttribute(attr);
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          node.removeAttribute?.(attr);
          strip(node);
        }
      });
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [attr],
  });
  window.addEventListener("load", () => observer.disconnect(), { once: true });
})();`}
        </Script>

        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />
      </head>

      {/* Only head & body may be direct children of html */}
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-TJMKXQR5"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <ClientProviders><UserJourneyTracker />{children}</ClientProviders>
          <SpeedInsights />
      </body>
    </html>
  );
}
