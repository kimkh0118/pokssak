"use client";

import type { Analysis } from "@/lib/api";
import { formatWon } from "@/lib/format";
import { OPTION_LABEL, STATUS_LABEL } from "@/lib/labels";

// 결과 첫 카드: 추천이 나오면 추천을, 보류면 '왜 안 나오는지'를 쉬운 말로 + 지금 알 수 있는 참고 숫자를 먼저 보여준다.
// 숫자를 감추는 경우는 소유·점유·대상 범위 같은 권리·대상 문제로 막힌 경우뿐이다.

// 금액을 낼 수 없는 경우: 권리(공동·법인·소유자 불일치), 점유자 거주, 대상 아님(부산 외·공동주택·용도), 건물·필지 범위 불명확
export const LEGAL_KEYS = ["소유 형태", "법인", "소유자가 다름", "임차인", "공동주택", "집합", "부산광역시", "주용도", "범위와 비용을 구분"];

export function Verdict({ data }: { data: Analysis }) {
  const r = data.result;
  const elig = data.eligibility;
  const legal = elig.holdReasons.filter((h) => LEGAL_KEYS.some((k) => h.includes(k)));
  const b = r.calc?.withoutSupport.base;

  if (r.status !== "hold") {
    return (
      <section className={`rounded-3xl p-6 text-white ${r.status === "conditional" ? "bg-brand" : "bg-ink"}`} aria-labelledby="status">
        <p className="text-[13px] font-bold"><span className="rounded-full bg-white/15 px-2.5 py-1">{STATUS_LABEL[r.status]}</span></p>
        <h2 id="status" className="mt-3 text-[24px] font-extrabold leading-snug">
          {r.status === "conditional" ? `${OPTION_LABEL[r.executionRecommendation!]}이 더 남아요` : "두 방법의 차이가 작아서 아직 한쪽을 고르기 어려워요"}
        </h2>
        {b && <Numbers b={b} demolitionKnown={!!r.calc?.demolitionKnown} />}
        <p className="mt-3 text-[15px] text-white/90">{data.explanation.summary}</p>
        <p className="mt-4 text-[12px] text-white/60">예상값으로 계산한 비교 결과이며 실제 판매가격·거래 성사·지원금 수령을 보장하지 않아요.</p>
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

  // 예상 가격(중개사 방식) · 예상 철거비로 계산한 결과
  const better = b ? (b.delta > 0 ? "demolish" : b.delta < 0 ? "sell_as_is" : "tie") : null;
  return (
    <section className="rounded-3xl bg-ink p-6 text-white" aria-labelledby="status">
      <p className="text-[13px] font-bold"><span className="rounded-full bg-white/15 px-2.5 py-1">예상 결과</span></p>
      {b ? (
        <>
          <h2 id="status" className="mt-3 text-[22px] font-extrabold leading-snug">
            {!r.calc?.demolitionKnown
              ? `철거비가 ${formatWon(Math.max(0, b.D_star))}보다 적게 나오면 철거 후 판매가 더 남아요`
              : better === "tie" ? "두 방법의 남는 돈이 거의 같아요"
              : `${OPTION_LABEL[better!]}가 약 ${formatWon(Math.abs(b.delta))} 더 남을 것으로 보여요`}
          </h2>
          <Numbers b={b} demolitionKnown={!!r.calc?.demolitionKnown} />
          <p className="mt-3 text-[13px] text-white/70">예상 집값·땅값(중개사 방식)과 예상 철거비(가운데 값)로 계산했어요. 중개보수는 빼고, 세금·관리비는 빠져 있어요.</p>
        </>
      ) : (
        <h2 id="status" className="mt-3 text-[22px] font-extrabold leading-snug">주변 거래가 없어서 아직 금액을 계산할 수 없어요</h2>
      )}
      <div className="mt-5 border-t border-white/20 pt-4 text-[14px]">
        <p className="font-bold">실제로 팔기 전에</p>
        <ul className="mt-1.5 space-y-1 text-white/85">
          <li>· 공인중개사 1~2곳에 &lsquo;그대로 팔 때&rsquo;와 &lsquo;철거 후 땅으로 팔 때&rsquo; 가격을 물어보세요.</li>
          <li>· 철거업체 2~3곳에서 견적을 받아 예상 철거비와 비교하세요.</li>
        </ul>
      </div>
      <p className="mt-4 text-[12px] text-white/60">예상값으로 계산한 참고 결과예요. 실제 판매가격·거래 성사·지원금 수령을 보장하지 않아요.</p>
    </section>
  );
}

function Numbers({ b, demolitionKnown }: { b: NonNullable<Analysis["result"]["calc"]>["withoutSupport"]["base"]; demolitionKnown: boolean }) {
  const beforeDemolition = b.L - b.M_L - b.C_L + b.G;
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <div className="rounded-2xl bg-white/10 p-4">
        <p className="text-[13px] text-white/70">그대로 팔면 남는 돈</p>
        <p className="num-in tabular mt-1 text-[24px] font-extrabold">약 {formatWon(b.N_H)}</p>
      </div>
      <div className="rounded-2xl bg-white/10 p-4">
        <p className="text-[13px] text-white/70">철거하고 땅으로 팔면 남는 돈</p>
        {demolitionKnown ? (
          <p className="num-in tabular mt-1 text-[24px] font-extrabold">약 {formatWon(b.N_L)}</p>
        ) : (
          <>
            <p className="num-in tabular mt-1 text-[24px] font-extrabold">약 {formatWon(beforeDemolition)} − 철거비</p>
            <p className="text-[12px] text-white/60">건물 면적을 몰라 예상 철거비를 계산하지 못했어요</p>
          </>
        )}
      </div>
    </div>
  );
}
