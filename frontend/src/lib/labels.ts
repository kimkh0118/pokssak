// 화면 표시용 한국어 이름
export const KIND_LABEL: Record<string, string> = {
  consult: "상담·견적 입력",
  public: "공공자료",
  assumption: "사용자 가정",
  unknown: "미확인",
  none: "적용 없음 확인",
  rule: "공식 요율",
  public_api: "공공자료",
  sample: "예시 데이터",
};
export const STATUS_LABEL = { conditional: "조건부 추천", uncertain: "우열 불확실", hold: "추천 보류" } as const;
export const OPTION_LABEL: Record<string, string> = { sell_as_is: "현 상태 판매", demolish: "철거 후 토지 판매", tie: "동률", mixed: "점검마다 다름" };
export const MATCH_LABEL = { partial_match: "조건 일부 일치 후보", needs_check: "추가 확인 필요", mismatch: "조건 불일치", closed: "마감·비활성" } as const;
export const ERROR_LABEL: Record<string, string> = {
  not_configured: "인증키 미설정", auth: "인증 오류", rate_limit: "호출 제한 초과", no_result: "조회 결과 없음",
  invalid_request: "요청값 오류", upstream: "기관 서버 일시 오류", network: "네트워크 오류", parse: "응답 해석 오류",
};
export const COST_PARTS = { tax: "세금", holding: "보유·관리비", finance: "금융비", cleanup: "정리비", other: "기타" } as const;
export const QUOTE_ITEMS = {
  demolition: "철거 공사", waste: "폐기물 처리", equipment: "장비·운반", asbestos: "석면 관련",
  admin: "부대 업무(멸실신고 등)", vat: "부가세", cleanup: "별도 정리 비용",
} as const;

export const QUESTIONS = {
  ownership: {
    title: "해당 주택과 토지는 어떤 소유 형태인가요?",
    hint: "건물과 매각할 토지 모두에 대한 질문이에요.",
    options: { single: "동일 개인의 단독소유", joint: "공동소유", other: "기타·잘 모르겠음" },
  },
  usage: { title: "현재 집의 사용 상태", options: { vacant: "전체 미사용", storage: "짐·가구 보관 중", occupied: "임차인·점유자 거주 중", unknown: "모름" } },
  direction: { title: "우선하는 방향", options: { recovery: "회수금액 우선", fast: "빠른 매각 우선", undecided: "아직 모르겠음" } },
  condition: { title: "건물의 실제 상태는 어떤가요?", options: { usable: "양호·수리 가능", old: "노후·대공사 필요", severe: "심각한 노후·폐가", unknown: "모름" } },
  access: { title: "집 앞까지 공사차량이 진입할 수 있나요?", options: { good: "차량 진입 원활", narrow: "진입은 가능하나 좁음", none: "차량 진입 불가", unknown: "모름" } },
} as const;
