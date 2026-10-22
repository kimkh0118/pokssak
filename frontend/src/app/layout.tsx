import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE } from "@/lib/site";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — 그대로 팔까, 철거하고 팔까`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE.name,
    title: `${SITE.name} — 비용 빼고 얼마 남는지 비교`,
    description: SITE.description,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="brick-wall flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
          본문으로 건너뛰기
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
