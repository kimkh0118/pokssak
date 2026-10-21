import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // 개인별 분석 결과와 API는 검색에 노출하지 않음
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/analyses/", "/history"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
