import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/Prose";

export const metadata: Metadata = { title: "자주 묻는 질문", description: "지원 대상, 데이터 출처, 세금, 개인정보 등 자주 묻는 질문" };

const QA: { q: string; a: React.ReactNode }[] = [
  { q: "어떤 집을 분석할 수 있나요?", a: "부산 단독·다가구주택 중 건물과 매각할 토지를 같은 개인이 단독소유하고, 집 전체가 비어 있으며, 건물·필지 범위가 명확한 경우 맞춤 금액 비교를 해요. 공동·법인 소유, 소유자 불일치, 점유자 거주, 공동주택은 금액 추천을 보류하지만 공개 정보와 확인 경로는 보여드려요. 상속받은 집도 단독소유라면 분석할 수 있어요." },
  { q: "공시지가나 실거래 참고가격으로 추천하나요?", a: "아니요. 공공 실거래 참고가격은 비교용이에요. 조건부 추천에는 이 대상에 대한 상담 가격(현 상태 일괄 가격과 철거 후 토지 가격을 구분)과 철거 견적이 필요해요." },
  { q: "철거비는 어떻게 정하나요?", a: "실제 견적을 우선해요. 견적 전에는 평당 단가·할증을 직접 넣는 가정 시뮬레이션만 제공하고, 이는 추천 근거로 쓰지 않아요." },
  { q: "지원금은 확정인가요?", a: "아니요. 공고의 최대 지원액은 개인 확정액이 아니에요. 기관에서 확인받은 금액만 '확인된 지원 반영' 비교에 넣고, 공공활용 의무 등으로 즉시 매각과 맞지 않는 지원은 빼요." },
  { q: "철거 지원은 어디서 신청하나요?", a: "국토교통부·농림축산식품부의 빈집 철거 지원은 '빈집애'(www.binzibe.kr)에서 온라인으로 신청하거나 관할 구·군청에 신청해요. 금액·조건은 구·군마다 달라요. 결과 화면의 '철거 지원'에서 빈집애로 바로 갈 수 있어요." },
  { q: "입력한 정보가 업체에 전달되나요?", a: "아니요. 상담 링크를 눌러도 주소·응답·금액은 전송되지 않아요. 제휴 업체도 없어요." },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead eyebrow="자주 묻는 질문" title="궁금한 점을 모았어요" />
      <div className="divide-y divide-line border-y border-line">
        {QA.map(({ q, a }) => (
          <details key={q} className="group py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-bold">
              {q}
              <span aria-hidden className="text-[20px] text-subtle transition group-open:rotate-90">›</span>
            </summary>
            <p className="pb-5 text-[15px] leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-[15px] text-muted">
        계산 방식이 궁금하다면 <Link href="/about" className="font-bold text-brand-strong hover:underline">계산 방법</Link>을 확인해 주세요.
      </p>
    </div>
  );
}
