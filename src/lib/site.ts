// 사이트 공통 정보
export const SITE = {
  name: "집 선택 비교",
  description: "단독·다가구주택을 팔지, 철거할지, 고칠지, 그대로 둘지 — 비용을 빼고 얼마가 남는지 같은 기준으로 비교합니다.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
};

export const NAV = [
  { href: "/analyze?mode=live", match: "/analyze", label: "분석하기" },
  { href: "/history", match: "/history", label: "내 분석" },
  { href: "/about", match: "/about", label: "계산 방법" },
  { href: "/faq", match: "/faq", label: "자주 묻는 질문" },
];
