import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Become a Propenu Service Provider",
  description:
    "Learn about the service provider registration experience planned for Propenu.",
};

const planningSteps = [
  {
    number: "01",
    title: "Provider profile",
    description:
      "Decide what business details, service areas, and work samples customers should see.",
  },
  {
    number: "02",
    title: "Verification",
    description:
      "Define the documents and checks needed to build trust and keep the directory reliable.",
  },
  {
    number: "03",
    title: "Customer enquiries",
    description:
      "Plan how providers will receive, manage, and respond to relevant customer leads.",
  },
];

export default function ServiceProviderPage() {
  return (
    <main className="min-h-screen bg-[#fbfefc] text-[#183222]">
      <section className="border-b border-[#e5efe8] bg-white">
        <div className="mx-auto max-w-7xl px-5 pb-8 pt-8 sm:px-8 sm:pb-10 sm:pt-12 lg:px-10">
          <div className="grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
            <div className="py-2 lg:py-6">
              <p className="inline-flex rounded-full bg-[#eaf7ee] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#218c4c] sm:text-xs">
                Propenu partner network
              </p>
              <h1 className="mt-5 max-w-xl text-[34px] font-semibold leading-[1.12] tracking-tight text-[#153a28] sm:text-5xl lg:text-[56px]">
                Grow your home services business with Propenu
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-gray-600 sm:text-lg sm:leading-8">
                We are building a place for trusted home-service professionals to showcase their work and connect with homeowners.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link
                  href="#provider-plan"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#218c4c]"
                >
                  Become a provider
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none"><path d="M4 10h11m-4.5-4.5L15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
                <a
                  href="#provider-plan"
                  className="text-sm font-semibold text-[#218c4c] underline decoration-[#b9dec5] underline-offset-4 transition-colors hover:text-[#176d39]"
                >
                  See how it works
                </a>
              </div>
            </div>

            <div className="relative aspect-[1.45/1] min-h-[260px] overflow-hidden rounded-2xl bg-[#edf4ef] sm:rounded-3xl lg:aspect-[1.5/1]">
              <Image
                src="/service-provider-hero.png"
                alt="A home service professional reviewing customer work on a tablet"
                fill
                priority
                sizes="(min-width: 1024px) 54vw, 100vw"
                className="object-cover object-center"
              />
            </div>
          </div>

          <div className="mt-8 grid divide-y divide-[#dcebe1] rounded-2xl bg-[#f4faf6] px-4 sm:mt-10 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-2">
            {[
              { title: "Reach local homeowners", detail: "Connect with people looking for home services." },
              { title: "Showcase your work", detail: "Help customers understand what you do." },
              { title: "Manage enquiries", detail: "Keep customer conversations in one place." },
            ].map((benefit) => (
              <div key={benefit.title} className="px-3 py-4 sm:px-5 sm:py-4">
                <p className="text-sm font-semibold text-[#183222]">{benefit.title}</p>
                <p className="mt-1 text-xs leading-5 text-gray-600">{benefit.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="provider-plan" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#218c4c]">
            What we’ll plan next
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            A clear path from sign-up to customer enquiries
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
            This page is the starting point. Before building the full
            registration flow, we can agree on the information and checks that
            make sense for your service business.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {planningSteps.map((step) => (
            <article key={step.number} className="rounded-2xl border border-[#e4eee7] bg-white p-5 sm:p-6">
              <span className="text-xs font-bold tracking-[0.12em] text-[#27AE60]">{step.number}</span>
              <h3 className="mt-4 text-base font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
