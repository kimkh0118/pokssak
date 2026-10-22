// 사이트 공통 정보
export const SITE = {
  name: "폭싹",
  tagline: "부산 빈집 처리 비교",
  description: "부산 빈집을 그대로 팔지, 철거하고 토지로 팔지 — 비용을 뺀 예상 회수액과 철거비 손익분기점, 지원사업 후보를 함께 보여줍니다.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
};

export const NAV = [
  { href: "/analyze?mode=live", match: "/analyze", label: "분석하기" },
  { href: "/my", match: "/my", label: "관심자산" },
  { href: "/notifications", match: "/notifications", label: "알림함" },
  { href: "/about", match: "/about", label: "계산 방법" },
  { href: "/faq", match: "/faq", label: "자주 묻는 질문" },
];
