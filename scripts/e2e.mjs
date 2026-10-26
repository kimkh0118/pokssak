// 실행 중인 서버(화면 :3000 → /api 는 백엔드로 전달)에 HTTP로 전체 흐름을 점검한다.
// 사용: node scripts/e2e.mjs   (BASE_URL 로 변경 가능)
const BASE = process.env.BASE_URL || "http://localhost:3000";
let cookie = "", failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`); if (!ok) failures++; };
async function j(path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", cookie }, body: init.body && JSON.stringify(init.body) });
  const set = r.headers.get("set-cookie"); if (set) cookie = [cookie, ...set.split(/,(?=\s*\w+=)/).map((c) => c.split(";")[0])].filter(Boolean).join("; ");
  return { status: r.status, body: await r.json() };
}

const live = await j(`/api/address?mode=live&q=${encodeURIComponent("장대골로31번길 19")}`);
check("실제 모드 주소 검색(키 있으면 성공, 없으면 오류로 반환)", live.body.ok === true || ["not_configured", "auth", "network", "upstream"].includes(live.body.error?.kind),
  live.body.ok ? `${live.body.data.length}건` : live.body.error.kind);

const found = (await j(`/api/address?mode=sample&q=${encodeURIComponent("바다로 12")}`)).body.data[0];
const lk = (await j("/api/lookup", { method: "POST", body: { mode: "sample", address: found } })).body;
check("공공자료 6종(예시) 조회", ["buildings", "land", "landUse", "houseTrades", "landTrades"].every((k) => lk[k].ok));
const answers = { ownership: "single", usage: "vacant", direction: "recovery", condition: "old", access: "narrow", vacancyMonths: 24 };
const { id } = (await j("/api/analyses", { method: "POST", body: { lookupId: lk.id, answers } })).body;
let a = (await j(`/api/analyses/${id}`)).body;
check("참고 비교만으로는 추천 보류", a.result.status === "hold" && a.result.calc?.withoutSupport.base.K != null);
const items = Object.fromEntries(["demolition", "waste", "equipment", "asbestos", "admin", "vat", "cleanup"].map((k) => [k, "included"]));
const cost = Object.fromEntries(["tax", "holding", "finance", "cleanup", "other"].map((k) => [k, { kind: "consult", value: 500000 }]));
const c = (v, t) => ({ kind: "consult", value: v, priceType: t, scopeMatches: true, siteConditionShared: true, source: "예시공인중개사", checkedOn: "2026-10-10" });
a = (await j(`/api/analyses/${id}`, { method: "PUT", body: { inputs: { H: c(240000000, "as_is"), L: c(330000000, "land"),
  D: { quote: { kind: "consult", value: 25000000, source: "예시철거", checkedOn: "2026-10-12", items } }, C_H: cost, C_L: cost,
  period_H: { kind: "consult", value: 3 }, period_L: { kind: "consult", value: 8 }, funding: { prefund: "yes", available: 40000000 } } } })).body;
check("상담·견적 보완 후 재계산", ["conditional", "uncertain"].includes(a.result.status), `${a.result.status} / ${a.result.executionRecommendation}`);
check("철거 플랜", a.plan.length === 6);
console.log(failures ? `\n${failures}건 실패` : "\n모든 E2E 검사 통과");
process.exit(failures ? 1 : 0);
