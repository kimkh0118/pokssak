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

// 부산 구·군청 홈페이지(빈집 지원 공고는 대부분 구·군청 고시공고·새소식에 올라온다)
export const BUSAN_GU_SITES: Record<string, string> = {
  중구: "https://www.bsjunggu.go.kr", 서구: "https://www.bsseogu.go.kr", 동구: "https://www.bsdonggu.go.kr",
  영도구: "https://www.yeongdo.go.kr", 부산진구: "https://www.busanjin.go.kr", 동래구: "https://www.dongnae.go.kr",
  남구: "https://www.bsnamgu.go.kr", 북구: "https://www.bsbukgu.go.kr", 해운대구: "https://www.haeundae.go.kr",
  사하구: "https://www.saha.go.kr", 금정구: "https://www.geumjeong.go.kr", 강서구: "https://www.bsgangseo.go.kr",
  연제구: "https://www.yeonje.go.kr", 수영구: "https://www.suyeong.go.kr", 사상구: "https://www.sasang.go.kr",
  기장군: "https://www.gijang.go.kr",
};
