import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/analyze", "/about", "/faq", "/terms", "/privacy"].map((p) => ({ url: `${SITE.url}${p}`, changeFrequency: "monthly" }));
}
