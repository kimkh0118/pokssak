// 실행 중인 서버에 HTTP로 주소 입력 → 결과 확인 → 조건 수정 → 상담 신청까지 전체 흐름을 검사한다.
// 사용: BASE_URL=http://localhost:3000 node scripts/e2e.mjs
const BASE = process.env.BASE_URL || "http://localhost:3000";
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};
const j = async (path, init) => {
  const r = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json" } });
  return { status: r.status, body: await r.json() };
};

// 1) 실제 모드: 인증키가 없으면 오류를 그대로 돌려주고 예시 데이터로 대체하지 않는다
const live = await j(`/api/address?mode=live&q=${encodeURIComponent("세종대로 110")}`);
if (live.body.ok === false) {
  check("실제 모드 실패는 오류로 반환", ["not_configured", "auth", "network", "rate_limit", "upstream"].includes(live.body.error.kind), live.body.error.kind);
  check("실제 모드 실패 시 예시 데이터 미포함", !JSON.stringify(live.body).includes("예시시"));
} else {
  check("실제 모드 주소 검색 성공(인증키 설정됨)", Array.isArray(live.body.data), `${live.body.data.length}건`);
}

// 2) 예시 모드 전체 흐름
const s = await j(`/api/address?mode=sample&q=${encodeURIComponent("예시로 34")}`);
check("예시 주소 검색", s.body.ok && s.body.data[0].provenance === "sample");
const addr = s.body.data.find((a) => a.id === "sample-multi");
const lk = await j("/api/property", { method: "POST", body: JSON.stringify({ mode: "sample", address: addr }) });
check("토지·건축물·거래 사례 조회", lk.body.land.ok && lk.body.buildings.ok && lk.body.trades.ok);
check("지원 범위 판정", lk.body.scope.status === "supported");

const answers = {
  purpose: "best_price",
  timing: "flexible",
  occupancy: "tenant",
  condition: "partial_repair",
  tenant: { deposit: { status: "known", won: 200_000_000 }, monthlyRent: { status: "known", won: 1_500_000 }, leaseEnd: { status: "unknown" } },
  availableCash: { status: "known", won: 0 },
  loanBalance: { status: "unknown" },
  loanRatePct: { status: "unanswered" },
};
const cr = await j("/api/analyses", { method: "POST", body: JSON.stringify({ lookupId: lk.body.id, answers, target: { buildingPk: "S-2001" } }) });
check("분석 생성", typeof cr.body.id === "string");
const a = await j(`/api/analyses/${cr.body.id}`);
const r = a.body.result;
check("4개 선택지 계산", r.options.length === 4);
check("대출 모름 → '대출 잔액 반영 전' 표시", r.globalPending.some((p) => p.includes("대출 잔액 반영 전")));
check("세금 미입력 → '세금 반영 전' 표시", r.globalPending.includes("세금 반영 전"));
check("투입 가능 현금 0원은 0원으로 저장(모름 아님)", a.body.answers.availableCash.status === "known" && a.body.answers.availableCash.won === 0);
const demo = r.options.find((o) => o.id === "demolish_sell_land");
check("현금 0원 + 보증금 반환 필요 → 철거안 예산 초과", demo.checks.budget === "exceeds", `선투입 ${demo.scenarios.base.maxUpfront}`);
check("예산 초과 선택지는 추천하지 않음", r.recommendation.optionId !== "demolish_sell_land" && r.recommendation.optionId !== "remodel");
const keep = r.options.find((o) => o.id === "keep");
check("보유 시 집값은 현금 수지에 없음", !keep.scenarios.base.flows.some((f) => f.category === "sale") && keep.scenarios.base.terminal !== null);

// 3) 계산 조건 수정 → 재계산
const up = await j(`/api/analyses/${cr.body.id}`, { method: "PUT", body: JSON.stringify({ overrides: { taxes: { asIsSale: 30_000_000 }, horizonMonths: 48 } }) });
check("조건 수정 재계산", up.body.built.engineInput.horizonMonths === 48 && up.body.built.engineInput.taxes.asIsSale === 30_000_000);
const sell = up.body.result.options.find((o) => o.id === "sell_as_is");
check("입력한 세금이 매각 정산에 반영", sell.scenarios.base.saleSettlement.tax === 30_000_000);
const bad = await j(`/api/analyses/${cr.body.id}`, { method: "PUT", body: JSON.stringify({ overrides: { asIsPrice: { low: 3, base: 2, high: 1 } } }) });
check("잘못된 조건은 400", bad.status === 400);

// 4) 지원 범위 밖
const apt = (await j(`/api/address?mode=sample&q=${encodeURIComponent("예시아파트")}`)).body.data[0];
const lkApt = await j("/api/property", { method: "POST", body: JSON.stringify({ mode: "sample", address: apt }) });
const crApt = await j("/api/analyses", { method: "POST", body: JSON.stringify({ lookupId: lkApt.body.id, answers, target: {} }) });
check("공동주택 호실은 분석 거부(422)", crApt.status === 422);

// 5) 상담 신청: 동의 없으면 거부, 동의하면 '신청 접수'
const noConsent = await j("/api/consultations", { method: "POST", body: JSON.stringify({ analysisId: cr.body.id, optionId: "sell_as_is", partnerId: "sample-broker-1", sharedFields: ["name", "phone"], contactName: "테스트", contactPhone: "010-0000-0000", consent: false }) });
check("동의 없는 상담 신청 거부", noConsent.status === 400);
const wrong = await j("/api/consultations", { method: "POST", body: JSON.stringify({ analysisId: cr.body.id, optionId: "keep", partnerId: "sample-broker-1", sharedFields: ["name", "phone"], contactName: "테스트", contactPhone: "010-0000-0000", consent: true }) });
check("현상태 유지는 업체 연결 없음", wrong.status === 400);
const ok = await j("/api/consultations", { method: "POST", body: JSON.stringify({ analysisId: cr.body.id, optionId: "demolish_sell_land", partnerId: "sample-demolition-1", sharedFields: ["name", "phone"], contactName: "테스트", contactPhone: "010-0000-0000", consent: true }) });
check("상담 신청은 '신청 접수' 상태로 저장", ok.body.status === "received" && ok.body.partner.isSample === true);

console.log(failures ? `\n${failures}건 실패` : "\n모든 E2E 검사 통과");
process.exit(failures ? 1 : 0);
