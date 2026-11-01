import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE } from "@/lib/site";
import { SiteHeader } from "@/components/SiteHeader";
import { AppTabBar } from "@/components/AppTabBar";
import { SWRegister } from "@/components/SWRegister";
import { Splash, SPLASH_SCRIPT } from "@/components/Splash";

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
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="app-bg flex min-h-full flex-col">
        <Splash />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
          본문으로 건너뛰기
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5">
          {children}
        </main>
        <AppTabBar />
        <SWRegister />
      </body>
    </html>
  );
}
