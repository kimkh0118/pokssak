"use client";

import type { Analysis } from "@/lib/api";
import { formatWon } from "@/lib/format";
import { OPTION_LABEL, STATUS_LABEL } from "@/lib/labels";

// 결과 첫 카드: 추천이 나오면 추천을, 보류면 '왜 안 나오는지'를 쉬운 말로 + 지금 알 수 있는 참고 숫자를 먼저 보여준다.
// 숫자를 감추는 경우는 소유·점유·대상 범위 같은 권리·대상 문제로 막힌 경우뿐이다.

type Todo = { text: string; where: string; anchor: string };

// 금액을 낼 수 없는 경우: 권리(공동·법인·소유자 불일치), 점유자 거주, 대상 아님(부산 외·공동주택·용도), 건물·필지 범위 불명확
export const LEGAL_KEYS = ["소유 형태", "법인", "소유자가 다름", "임차인", "공동주택", "집합", "부산광역시", "주용도", "범위와 비용을 구분"];

/** 엔진의 부족 항목 문장을 '무엇을 / 어디서' 쉬운 말로 바꾼다. */
function toTodo(m: string): Todo {
  if (m.includes("짐·가구")) return { text: "짐 외에 실제로 집을 쓰는 사람이 없는지 답하기", where: "질문 답 수정", anchor: "#answers" };
  if (m.includes("사용 상태")) return { text: "집을 지금 쓰고 있는지(사용 상태) 답하기", where: "질문 답 수정", anchor: "#answers" };
  if (m.includes("건축물대장") || m.includes("일치")) return { text: m.replace(" 확인 필요:", ":"), where: "구청·등기부 확인", anchor: "#plan" };
  if (m.includes("현 상태 일괄 매각가격")) return { text: "지금 상태 그대로 팔 때 가격을 공인중개사에게 물어보기", where: "가격 상담", anchor: "#inputs" };
  if (m.includes("철거 후 토지 매각가격")) return { text: "철거하고 땅으로 팔 때 가격을 공인중개사에게 물어보기", where: "가격 상담", anchor: "#inputs" };
  if (m.includes("확인 시점")) return { text: "두 가격을 비슷한 시기에 다시 물어보기", where: "가격 상담", anchor: "#inputs" };
  if (m.includes("철거비") || m.includes("견적")) return { text: "철거업체 견적 받기(폐기물·장비·석면 포함 여부 확인)", where: "철거 견적", anchor: "#inputs" };
  if (m.includes("차량 진입 불가")) return { text: "차가 못 들어가도 철거할 수 있는지 업체에 확인", where: "철거 견적", anchor: "#inputs" };
  if (m.includes("기타비용")) return { text: `${m.startsWith("현 상태") ? "그대로 팔 때" : "철거 후 팔 때"} 드는 세금·관리비 등 적기(없으면 '적용 없음')`, where: "기타 비용", anchor: "#inputs" };
  if (m.includes("처리 기간")) return { text: `${m.startsWith("현 상태") ? "그대로 팔 때" : "철거 후 팔 때"} 걸리는 기간 적기`, where: "기간·자금", anchor: "#inputs" };
  if (m.includes("선지출")) return { text: "철거비를 먼저 낼 돈이 있는지 적기", where: "기간·자금", anchor: "#inputs" };
  if (m.includes("가격 자료")) return { text: "가격 상담값을 입력하기", where: "가격 상담", anchor: "#inputs" };
  return { text: m, where: "가격·견적", anchor: "#inputs" };
}

export function Verdict({ data }: { data: Analysis }) {
  const r = data.result;
  const elig = data.eligibility;
  const legal = elig.holdReasons.filter((h) => LEGAL_KEYS.some((k) => h.includes(k)));
  const dataTodos = r.missing.filter((m) => !legal.includes(m)).map(toTodo);
  const uniqueTodos = dataTodos.filter((t, i) => dataTodos.findIndex((x) => x.text === t.text) === i);
  const b = r.calc?.withoutSupport.base;

  if (r.status !== "hold") {
    return (
      <section className={`rounded-3xl p-6 text-white ${r.status === "conditional" ? "bg-brand" : "bg-ink"}`} aria-labelledby="status">
        <p className="text-[13px] font-bold"><span className="rounded-full bg-white/15 px-2.5 py-1">{STATUS_LABEL[r.status]}</span></p>
        <h2 id="status" className="mt-3 text-[24px] font-extrabold leading-snug">
          {r.status === "conditional" ? `입력한 조건에서는 ${OPTION_LABEL[r.executionRecommendation!]}이 더 남아요` : "두 방법의 차이가 작아서 아직 한쪽을 고르기 어려워요"}
        </h2>
        {b && <Numbers b={b} demolitionKnown={!!r.calc?.demolitionKnown} />}
        <p className="mt-3 text-[15px] text-white/90">{data.explanation.summary}</p>
        <p className="mt-4 text-[12px] text-white/60">입력한 조건에서의 비교 결과이며 실제 판매가격·거래 성사·지원금 수령을 보장하지 않아요.</p>
      </section>
    );
  }

  // 권리·대상 문제: 숫자로 판단할 수 없는 경우
  if (legal.length > 0) {
    return (
      <section className="rounded-3xl bg-[#2b2f3a] p-6 text-white" aria-labelledby="status">
        <p className="text-[13px] font-bold"><span className="rounded-full bg-white/15 px-2.5 py-1">금액 비교 불가</span></p>
        <h2 id="status" className="mt-3 text-[24px] font-extrabold leading-snug">이 집은 먼저 권리·대상 문제를 정리해야 해요</h2>
        <p className="mt-2 text-[15px] text-white/85">아래 문제가 있으면 누가 얼마를 받을지 정할 수 없어서 금액을 계산하지 않아요. 답을 잘못 고른 거라면 &lsquo;질문 답 수정&rsquo;에서 바꾸면 바로 계산돼요.</p>
        <ul className="mt-4 space-y-2 border-t border-white/20 pt-4 text-[15px]">
          {legal.map((h) => <li key={h}>· {h.replace(" — 자동 금액 추천을 보류합니다.", "").replace(" — 자동 금액 추천 대상이 아닙니다.", "")}</li>)}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#answers" className="rounded-full bg-white px-4 py-2 text-[14px] font-bold text-ink">질문 답 수정</a>
          <a href="#plan" className="rounded-full bg-white/15 px-4 py-2 text-[14px] font-bold">어디에 상담하나요</a>
        </div>
      </section>
    );
  }

  // 자료 부족: 지금 알 수 있는 참고 결과를 먼저
  return (
    <section className="rounded-3xl bg-ink p-6 text-white" aria-labelledby="status">
      <p className="text-[13px] font-bold"><span className="rounded-full bg-white/15 px-2.5 py-1">참고 결과 · 추천 전 단계</span></p>
      {b ? (
        <>
          <h2 id="status" className="mt-3 text-[22px] font-extrabold leading-snug">
            {r.calc?.demolitionKnown
              ? `지금 입력 기준으로는 ${OPTION_LABEL[b.delta > 0 ? "demolish" : b.delta < 0 ? "sell_as_is" : "tie"]} 쪽이 더 남아요`
              : `철거비가 ${formatWon(Math.max(0, b.D_star))}보다 적게 나오면 철거 후 판매가 더 남아요`}
          </h2>
          {b.D_star < 0 && !r.calc?.demolitionKnown && <p className="mt-1 text-[14px] text-white/80">이 가격대에서는 철거비가 0원이어도 그대로 파는 쪽이 더 남아요.</p>}
          <Numbers b={b} demolitionKnown={!!r.calc?.demolitionKnown} />
          <p className="mt-3 text-[13px] text-white/70">
            가격 근거: 그대로 팔 때 {basis(r.calc?.priceBasis.H)}, 땅으로 팔 때 {basis(r.calc?.priceBasis.L)}
            {!r.calc?.costsComplete && " · 세금·관리비 등은 아직 빠진 금액이에요"}
          </p>
        </>
      ) : (
        <h2 id="status" className="mt-3 text-[22px] font-extrabold leading-snug">주변 거래가 없어서 아직 금액을 계산할 수 없어요</h2>
      )}
      <div className="mt-5 border-t border-white/20 pt-4">
        <p className="text-[15px] font-bold">확정된 추천을 받으려면 ({uniqueTodos.length}가지)</p>
        <ol className="mt-2 space-y-2 text-[14px]">
          {uniqueTodos.map((t, i) => (
            <li key={t.text} className="flex items-start justify-between gap-3">
              <span>{i + 1}. {t.text}</span>
              <a href={t.anchor} className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-bold">{t.where}</a>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-4 text-[12px] text-white/60">참고 결과는 공공 실거래·입력값으로 계산한 것이며 추천이 아니에요. 정보가 부족하다고 &lsquo;그대로 두는 게 최선&rsquo;이라는 뜻은 아니에요.</p>
    </section>
  );
}

function basis(k?: string | null) {
  return k === "consult" ? "상담 가격" : k === "assumption" ? "내 가정" : k === "public" ? "중개사 방식 추정가(실거래·공시가격)" : "미확인";
}

function Numbers({ b, demolitionKnown }: { b: NonNullable<Analysis["result"]["calc"]>["withoutSupport"]["base"]; demolitionKnown: boolean }) {
  const beforeDemolition = b.L - b.M_L - b.C_L + b.G;
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <div className="rounded-2xl bg-white/10 p-4">
        <p className="text-[13px] text-white/70">그대로 팔면 남는 돈</p>
        <p className="tabular mt-1 text-[24px] font-extrabold">약 {formatWon(b.N_H)}</p>
      </div>
      <div className="rounded-2xl bg-white/10 p-4">
        <p className="text-[13px] text-white/70">철거하고 땅으로 팔면 남는 돈</p>
        {demolitionKnown ? (
          <p className="tabular mt-1 text-[24px] font-extrabold">약 {formatWon(b.N_L)}</p>
        ) : (
          <>
            <p className="tabular mt-1 text-[24px] font-extrabold">약 {formatWon(beforeDemolition)} − 철거비</p>
            <p className="text-[12px] text-white/60">철거비 견적을 넣으면 정확히 계산돼요</p>
          </>
        )}
      </div>
    </div>
  );
}
