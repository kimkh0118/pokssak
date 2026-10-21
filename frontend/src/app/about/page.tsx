import type { Metadata } from "next";
import Link from "next/link";
import { Formula, PageHead, Section } from "@/components/Prose";

export const metadata: Metadata = { title: "계산 방법", description: "선택지별 남는 돈, 비교가치, 손익분기점, 추천 규칙을 어떻게 계산하는지 설명합니다." };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <PageHead
        eyebrow="계산 방법"
        title={<>추천은 AI가 아니라<br />정해진 공식으로 계산해요</>}
        lead="같은 입력이면 언제나 같은 결과가 나옵니다. 계산에 쓴 출처와 가정은 결과 화면에서 모두 확인할 수 있어요."
      />

      <Section title="1. 현금과 자산을 나눠서 봐요">
        <p>
          집을 팔면 실제로 돈이 들어오지만, 팔지 않은 집은 <strong>통장에 있는 돈이 아니에요.</strong> 그래서 결과를 두 가지로 나눠 보여드려요.
        </p>
        <ul>
          <li><strong>순현금 수지</strong> — 비교 기간 동안 실제로 들어오고 나가는 돈</li>
          <li><strong>보유 순자산</strong> — 기간이 끝났을 때 갖고 있는 집의 추정 가치 − 처분비용 − 남은 대출 − 돌려줄 보증금</li>
        </ul>
      </Section>

      <Section title="2. 매각하면 얼마 남나요">
        <Formula>
          예상 순수령액 = 매각대금 − 철거·리모델링 비용 − 실행 기간 보유비·이자 − 중개·거래비용 − 확인된 세금 − 대출 잔액 − 임차보증금
        </Formula>
        <p>대출과 보증금은 한 번만 빼요. 세금·대출·보증금을 모르면 &lsquo;최종 실수령액&rsquo;이라고 하지 않고 &lsquo;세금 반영 전&rsquo;처럼 무엇이 빠졌는지 표시해요.</p>
        <p className="text-[13px]">중개보수: 공인중개사법 시행규칙 별표1 주택 매매 중개보수 상한요율(2021.10.19 시행), 주택 외(토지) 상한 0.9% — 상한 기준 추정, 부가세 별도</p>
      </Section>

      <Section title="3. 기간이 다른 선택을 공평하게 비교해요">
        <p>바로 파는 것과 1년 뒤 파는 것은 같은 금액이라도 가치가 달라요. 그래서 공통 비교 기간(기본 36개월)과 연 할인율(기본 3.5%)로 모두 현재 가치로 바꿔요.</p>
        <Formula>
          비교가치 = 각 월 순현금흐름의 현재가치 합계 + 기간 말 보유 순자산의 현재가치
          <span className="mt-1 block text-[13px] font-medium text-muted">월 t의 현재가치 = 금액 ÷ (1 + 할인율)^(t/12)</span>
        </Formula>
        <p>비교 기간, 할인율, 가격변동률은 결과 화면의 &lsquo;계산 조건 수정&rsquo;에서 바꿀 수 있어요.</p>
      </Section>

      <Section title="4. 가격은 이렇게 추정해요">
        <ul>
          <li><strong>현상태 매각가</strong> — 같은 시군구 단독·다가구 실거래 중 해제·직거래를 빼고, 대지·연면적이 비슷하고(0.5~2배) 건축년도가 가까운(±15년) 사례만 골라 대지㎡당 가격의 25%·50%·75% 값을 써요. 사례가 3건 미만이면 계산하지 않아요.</li>
          <li><strong>철거 후 토지 가격</strong> — 토지 거래 사례나 전문가 의견이 있을 때만 계산해요. 주택 가격에 임의의 비율을 곱하지 않아요.</li>
          <li><strong>리모델링 후 가치</strong> — &lsquo;공사비만큼 집값이 오른다&rsquo;고 보지 않아요. 근거가 없으면 직접 입력한 가정으로만 계산해요.</li>
          <li><strong>공시지가</strong>는 참고로만 보여주고 매각가로 쓰지 않아요.</li>
        </ul>
      </Section>

      <Section title="5. 어디서부터 유리해지나요">
        <ul>
          <li><strong>손익분기 매각가</strong> — 철거·리모델링 후 매각의 비교가치가 현상태 매각과 같아지는 매각가</li>
          <li><strong>최대 허용 공사비</strong> — 대안의 비교가치가 기준안과 같아지는 공사비 상한</li>
          <li><strong>임대 회수기간</strong> — 지금보다 늘어나는 <em>순</em>임대수입으로 추가 공사비를 회수하는 기간(늘지 않으면 &lsquo;회수 불가&rsquo;)</li>
          <li><strong>최대 선투입 필요액</strong> — 공사비·보증금 반환 등으로 돈이 가장 많이 묶이는 시점의 부족액. 투입 가능 현금보다 크면 추천하지 않아요.</li>
        </ul>
      </Section>

      <Section title="6. 추천은 이 순서로 정해요">
        <ol className="space-y-1 [&>li]:ml-5 [&>li]:list-decimal">
          <li>원하시는 활용 목적에 맞는지</li>
          <li>예산과 희망 시점 안에 가능한지</li>
          <li>실행할 수 있는지, 확인이 필요한 조건은 없는지</li>
          <li>같은 기준으로 계산한 비교가치</li>
          <li>추정 범위를 고려한 추천 강도</li>
        </ol>
        <p>1·2위 차이가 추정 범위보다 작으면 &lsquo;추가 견적·확인 필요&rsquo;, 정보가 부족하면 &lsquo;판단 보류&rsquo;로 알려드려요. 판단 보류는 &lsquo;그냥 두세요&rsquo;라는 뜻이 아니에요. 노후도만으로 철거를 권하지 않고, 업체 수수료나 제휴 여부는 순위에 쓰지 않아요.</p>
      </Section>

      <div className="border-t border-line pt-8">
        <Link href="/analyze?mode=live" className="inline-flex h-14 items-center rounded-xl bg-brand px-6 text-[17px] font-bold text-white hover:bg-brand-strong">
          우리 집 계산해 보기
        </Link>
      </div>
    </article>
  );
}
