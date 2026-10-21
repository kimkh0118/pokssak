import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/Prose";

export const metadata: Metadata = { title: "자주 묻는 질문", description: "지원 대상, 데이터 출처, 세금, 개인정보 등 자주 묻는 질문" };

const QA: { q: string; a: React.ReactNode }[] = [
  { q: "어떤 집을 분석할 수 있나요?", a: "현재는 건물 전체를 소유한 단독주택·다가구주택만 지원해요. 아파트·연립·다세대 같은 공동주택의 호실이나 상가 건물은 지원 범위 밖으로 안내해요. 호실을 건물 전체처럼 보고 철거를 판단할 수 없기 때문이에요." },
  { q: "데이터는 어디서 가져오나요?", a: "주소는 행정안전부 도로명주소 API, 건물 정보는 국토교통부 건축물대장, 거래 사례는 국토교통부 단독/다가구 매매 실거래가, 토지 정보와 공시지가는 브이월드에서 조회해요. 각 값 옆에 출처와 기준일을 표시해요." },
  { q: "우리 집의 실제 거래 기록이 나오나요?", a: "아니요. 실거래가 자료는 지역·계약월 단위로 공개되고 지번이 일부만 나와서, 특정 주소의 거래 이력으로 연결하지 않아요. 비슷한 주변 거래를 비교 사례로만 사용해요." },
  { q: "세금도 계산해 주나요?", a: "양도소득세 등 개인별 세금은 보유 기간·다주택 여부 등 많은 정보가 필요해서 자동으로 계산하지 않아요. 결과에는 '세금 반영 전'으로 표시하고, 세무사 등에게 확인한 금액을 '계산 조건 수정'에 넣으면 반영해요." },
  { q: "철거비·공사비는 정확한가요?", a: "기본값은 화면 흐름을 위한 가정 단가예요. 지역·구조·현장 조건에 따라 크게 달라지니 견적을 받아 '계산 조건 수정'에 입력해 주세요. 그러면 손익분기점도 함께 다시 계산돼요." },
  { q: "'판단 보류'는 그냥 두라는 뜻인가요?", a: "아니에요. 비교에 필요한 정보가 부족하다는 뜻이에요. 어떤 정보가 필요한지 함께 알려드려요. '현상태 유지 추천'과는 다른 결과예요." },
  { q: "입력한 정보가 업체에 전달되나요?", a: "분석만으로는 어떤 정보도 전달되지 않아요. 결과 화면에서 직접 상담을 신청하고, 전달할 항목을 확인·동의한 경우에만 신청 내용이 저장돼요. 현재는 실제 업체와 연결되어 있지 않아 '신청 접수' 상태로만 남아요." },
  { q: "예시 모드는 뭔가요?", a: "가상의 '예시시 예시구' 주소와 거래 사례로 전체 흐름을 먼저 체험하는 모드예요. 실제 데이터가 아니라는 표시가 모든 화면에 붙어요. 실제 조회가 실패해도 예시 데이터로 몰래 바꾸지 않아요." },
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
        계산 방식이 궁금하다면 <Link href="/about" className="font-bold text-brand hover:underline">계산 방법</Link>을 확인해 주세요.
      </p>
    </div>
  );
}
