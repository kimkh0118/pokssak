import type { Metadata } from "next";
import Link from "next/link";
import { Formula, PageHead, Section } from "@/components/Prose";

export const metadata: Metadata = { title: "계산 방법", description: "예상 회수액, 추가비용 기준, 철거비 손익분기점, 추천 규칙" };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <PageHead eyebrow="계산 방법" title={<>추천은 AI가 아니라<br />정해진 규칙으로 계산해요</>}
        lead="같은 자료와 같은 규칙 버전이면 같은 결과가 나와요. AI는 결과를 쉬운 말로 설명만 하고 금액·추천 유형을 바꾸지 못해요." />
      <Section title="1. 비용을 뺀 예상 회수액">
        <Formula>현 상태 판매 = 판매가격(H) − 중개보수(M_H) − 기타 처리비용(C_H)</Formula>
        <Formula>철거 후 판매 = 토지 판매가격(L) − 철거비(D) − 중개보수(M_L) − 기타 처리비용(C_L) + 확인된 지원(G)</Formula>
        <p>과거 취득비용을 반영한 순이익이나 대출·보증금 정산 후 실수령액이 아니에요. 세금·관리비 등이 빠지면 반영 범위를 밝힌 참고금액이에요.</p>
      </Section>
      <Section title="2. 추가비용 기준과 철거비 손익분기점">
        <Formula>추가비용 기준 K = L − H − (M_L − M_H)</Formula>
        <Formula>철거비 손익분기점 D* = K − (C_L − C_H) + G <span className="block text-[13px] font-medium text-muted">검증: 차이(Δ) = D* − D</span></Formula>
        <p>D*가 음수면 그 가정에서는 철거비가 0원이어도 철거 후 판매가 우세하지 않아요. 기본 비교는 지원금 미반영(G=0)이에요. 미확인 비용을 0원으로 보는 것과는 달라요.</p>
      </Section>
      <Section title="3. 참고가격(공공 실거래)">
        <ul>
          <li>현 상태 주택: 유사 주택의 건물+토지 일괄 거래금액 ÷ 대지면적의 중앙값 × 대상 대지면적(토지가격을 다시 더하지 않음)</li>
          <li>철거 후 토지: 유사 토지 거래금액 ÷ 거래면적의 중앙값 × 대상 토지면적</li>
          <li>같은 법정동 최근 12개월 · 면적 70~130% · 건축연도 10년 이내(개발 설정, 감정평가 기준 아님). 0건이면 보류, 1건이면 단일 사례, 여러 건이면 중앙값과 관측 범위(예측구간 아님)</li>
        </ul>
      </Section>
      <Section title="4. 예상 결과">
        <ul>
          <li>집값·땅값은 중개사 방식 예상값, 철거비는 건축물대장으로 계산한 개략 범위를 써요.</li>
          <li>소유·점유·대상 범위에 문제가 있으면 금액을 계산하지 않고 먼저 확인할 사항을 알려요.</li>
          <li>예상값이라 실제 판매가격·견적과 다를 수 있어요. 팔기 전에는 공인중개사·철거업체에 확인하세요.</li>
        </ul>
      </Section>
      <div className="border-t border-line pt-8"><Link href="/analyze?mode=live" className="inline-flex h-14 items-center rounded-xl bg-brand px-6 text-[17px] font-bold text-white">빈집 비교 시작</Link></div>
    </article>
  );
}
