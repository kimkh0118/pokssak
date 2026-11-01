import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/Prose";

export const metadata: Metadata = { title: "자주 묻는 질문", description: "지원 대상, 데이터 출처, 세금, 개인정보 등 자주 묻는 질문" };

const QA: { q: string; a: React.ReactNode }[] = [
  { q: "어떤 집을 분석할 수 있나요?", a: "부산 단독·다가구주택 중 건물과 매각할 토지를 같은 개인이 단독소유하고, 집 전체가 비어 있으며, 건물·필지 범위가 명확한 경우 맞춤 금액 비교를 해요. 공동·법인 소유, 소유자 불일치, 점유자 거주, 공동주택은 금액 추천을 보류하지만 공개 정보와 확인 경로는 보여드려요. 상속받은 집도 단독소유라면 분석할 수 있어요." },
  { q: "집값은 어떻게 계산하나요?", a: "공인중개사가 쓰는 세 가지 방법(비슷한 거래 비교, 땅값+남은 건물값, 공시가격 비율)을 함께 계산한 예상값이에요. 감정평가가 아니라서 실제로 팔기 전에는 공인중개사에게 확인하세요." },
  { q: "철거비는 어떻게 정하나요?", a: "건축물대장의 면적·구조·층수·지붕과 차량 진입·건물 상태 답으로 개략 범위를 계산해요. 업체 견적이 아니라서 2~3곳 견적을 받아 비교하세요." },
  { q: "철거 지원은 어디서 신청하나요?", a: "국토교통부·농림축산식품부의 빈집 철거 지원은 '빈집애'(www.binzibe.kr)에서 온라인으로 신청하거나 관할 구·군청에 신청해요. 금액·조건은 구·군마다 달라요. 결과 화면의 '철거 지원'에서 빈집애로 바로 갈 수 있어요." },
  { q: "내 정보가 업체에 전달되나요?", a: "아니요. 주소·응답·금액은 업체에 전송되지 않아요. 제휴 업체도 없어요." },
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
