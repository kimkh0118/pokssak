import Link from "next/link";
import { env } from "@/lib/providers/http";

export const dynamic = "force-dynamic";

export default function Home() {
  const keys = [
    { name: "주소 검색(주소기반산업지원서비스)", ok: !!env.jusoKey(), env: "JUSO_API_KEY" },
    { name: "건축물대장·실거래가(공공데이터포털)", ok: !!env.dataGoKrKey(), env: "DATA_GO_KR_SERVICE_KEY" },
    { name: "토지특성·공시지가(브이월드)", ok: !!env.vworldKey(), env: "VWORLD_API_KEY" },
  ];
  const allLive = keys.every((k) => k.ok);
  return (
    <div className="space-y-8">
      <section className="space-y-3 pt-4">
        <h1 className="text-2xl font-bold leading-snug sm:text-3xl">
          이 집, 팔까요? 고칠까요? 그대로 둘까요?
        </h1>
        <p className="max-w-2xl text-muted">
          주소와 질문 3개로 <strong className="text-ink">현상태 매각 · 철거 후 토지 매각 · 리모델링 · 현상태 유지</strong>를 같은 기준으로 비교합니다.
          비용을 빼고 얼마가 남는지, 어느 가격·공사비부터 다른 선택이 유리해지는지 근거와 함께 보여드립니다.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-bold">실제 공공데이터로 분석</h2>
          <p className="mt-1 text-sm text-muted">주소 검색, 건축물대장, 토지특성, 단독·다가구 실거래가를 조회합니다.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {keys.map((k) => (
              <li key={k.env} className="flex items-center justify-between gap-2">
                <span>{k.name}</span>
                <span className={k.ok ? "text-brand" : "text-bad"}>{k.ok ? "인증키 설정됨" : "인증키 없음"}</span>
              </li>
            ))}
          </ul>
          {!allLive && <p className="mt-3 text-xs text-bad">인증키가 없는 항목은 조회 시 &lsquo;인증키 미설정&rsquo; 오류로 표시됩니다(예시 데이터로 바꾸지 않음).</p>}
          <Link href="/analyze?mode=live" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-ink">
            실제 주소로 시작
          </Link>
        </div>
        <div className="rounded-xl border border-sample bg-sample-soft p-5">
          <h2 className="font-bold text-sample">예시 데이터로 체험</h2>
          <p className="mt-1 text-sm text-muted">인증키 없이 가상의 &lsquo;예시시 예시구&rsquo; 주소와 거래 사례로 전체 흐름을 확인합니다. 모든 화면에 예시 표시가 붙습니다.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>예시로 12 — 단독주택</li>
            <li>예시로 34 — 다가구주택(임차인 거주 예시에 적합)</li>
            <li>샘플길 7 — 한 지번에 건물 2개(분석 대상 확인)</li>
            <li>예시아파트 — 지원 범위 밖 안내</li>
          </ul>
          <Link href="/analyze?mode=sample" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-sample px-4 text-sm font-medium text-white">
            예시로 체험
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5 text-sm">
        <h2 className="font-bold">이 서비스가 하지 않는 것</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>공시지가를 시장 매각가로 쓰지 않습니다.</li>
          <li>개인별 세금을 임의로 계산하지 않습니다. 입력하지 않으면 &lsquo;세금 반영 전&rsquo;으로 표시합니다.</li>
          <li>노후도만으로 철거를 추천하지 않고, 정보가 부족하면 현상태 유지가 아니라 &lsquo;판단 보류&rsquo;로 안내합니다.</li>
          <li>분석만으로 연락처를 업체에 전달하지 않습니다. 직접 신청한 경우에만 확인한 항목을 저장합니다.</li>
        </ul>
      </section>
    </div>
  );
}
