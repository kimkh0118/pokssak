// 사이트 공통 정보
export const SITE = {
  name: "폭싹",
  tagline: "부산 빈집 처리 비교",
  description: "부산 빈집을 그대로 팔지, 철거하고 토지로 팔지 — 예상 집값·철거비로 얼마 더 남는지 보여주고, 관심 집의 가격 변동을 알려드려요.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
};

// 하단 탭(휴대폰)·상단 메뉴(넓은 화면) 공통
export const TABS = [
  { href: "/", label: "홈", icon: "home", match: (p: string) => p === "/" },
  { href: "/analyze", label: "조회", icon: "search", match: (p: string) => p.startsWith("/analyze") || p.startsWith("/analyses") },
  { href: "/my", label: "관심 집", icon: "heart", match: (p: string) => p.startsWith("/my") },
  { href: "/notifications", label: "알림", icon: "bell", match: (p: string) => p.startsWith("/notifications") },
  { href: "/more", label: "더보기", icon: "more", match: (p: string) => ["/more", "/about", "/faq", "/terms", "/privacy", "/login"].some((x) => p.startsWith(x)) },
] as const;
