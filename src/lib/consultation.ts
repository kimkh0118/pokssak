// 전문가 연결 규칙(클라이언트·서버 공용). 실제 업체 연동은 없다 → 신청 저장까지만 하고 "신청 접수"로 표시.
// 업체 정보는 모두 예시이며, 경제성 계산·추천 순위에는 전혀 쓰이지 않는다.
import type { OptionId } from "./domain/types";

export type PartnerType = "broker" | "demolition" | "remodeling";

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  broker: "공인중개사",
  demolition: "철거업체",
  remodeling: "리모델링 회사",
};

export interface Partner {
  id: string;
  type: PartnerType;
  name: string;
  isSample: true;
  region: string;
}

export const SAMPLE_PARTNERS: Partner[] = [
  { id: "sample-broker-1", type: "broker", name: "예시공인중개사사무소", isSample: true, region: "예시 지역" },
  { id: "sample-demolition-1", type: "demolition", name: "예시해체공사", isSample: true, region: "예시 지역" },
  { id: "sample-remodeling-1", type: "remodeling", name: "예시리모델링", isSample: true, region: "예시 지역" },
];

/** 선택지별 연결 대상. 현상태 유지는 연결 없이 종료 */
export const PARTNERS_FOR_OPTION: Record<OptionId, PartnerType[]> = {
  sell_as_is: ["broker"],
  demolish_sell_land: ["demolition", "broker"],
  remodel: ["remodeling"],
  keep: [],
};

/** 사용자가 체크해야 전달되는 항목 */
export const SHAREABLE_FIELDS = {
  name: "이름",
  phone: "연락처",
  address: "물건 주소",
  summary: "분석 요약(선택지별 추정 금액·조건)",
  property: "토지·건축물 기본 정보",
} as const;
export type ShareableField = keyof typeof SHAREABLE_FIELDS;
