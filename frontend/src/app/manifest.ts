import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// 홈 화면에 설치하는 웹앱 정보
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${SITE.name} — 부산 빈집 처리 비교`,
    short_name: SITE.name,
    description: SITE.description,
    lang: "ko",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f1ec",
    theme_color: "#ffffff",
    categories: ["finance", "lifestyle", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "빈집 조회", url: "/analyze", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "관심 집", url: "/my", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "알림", url: "/notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
