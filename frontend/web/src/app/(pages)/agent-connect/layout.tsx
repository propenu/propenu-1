import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
    noimageindex: true,
  },
};

export default function AgentConnectLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
