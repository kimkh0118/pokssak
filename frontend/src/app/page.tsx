import Link from "next/link";
import { HomeSign } from "@/components/HomeSign";

export const dynamic = "force-dynamic";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

async function keyStatus(): Promise<Record<string, boolean> | null> {
  try {
    const r = await fetch(`${BACKEND_URL}/api/status`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const STEPS = [
  ["공공자료 6종 조회", "주소·건축물대장·토지특성·토지이용계획·주택/토지 실거래"],
  ["네 가지 질문", "소유 형태·사용 상태·건물 상태·차량 진입"],
  ["두 판매 방식 비교", "현 상태 판매 vs 철거 후 토지 판매, 철거비 손익분기점"],
  ["지원사업·철거 플랜", "주간 수집한 공고 후보와 확인 순서"],
];

export default async function Home() {
  const s = await keyStatus();
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section className="pt-4">
        <p className="text-[14px] font-extrabold text-brand">부산 빈집 소유자를 위한</p>
        <h1 className="mt-2 text-[30px] font-extrabold leading-[1.25] tracking-tight sm:text-[38px]">
          그대로 팔까, 철거하고 팔까?
          <br />
          <span className="text-brand">비용 빼고 얼마 남는지</span> 비교해요
        </h1>
        <div className="mt-6">
          <HomeSign />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
          {s ? (
            [["juso", "주소"], ["dataGoKr", "건축물·실거래"], ["vworld", "토지특성·이용계획"]].map(([k, t]) => (
              <span key={k} className={`rounded-full px-2.5 py-1 font-bold ${s[k] ? "bg-brand-soft text-brand" : "bg-fill text-subtle"}`}>{s[k] ? "✓" : "–"} {t}</span>
            ))
          ) : (
            <span className="text-bad">백엔드 서버가 꺼져 있어요(README 실행 방법 참고)</span>
          )}
        </div>
      </section>

      <Link href="/analyze?mode=sample" className="flex items-center justify-between rounded-2xl bg-ink p-5 text-white">
        <span>
          <span className="text-[13px] font-bold text-brand-2">인증키 없이 체험</span>
          <span className="mt-1 block text-[19px] font-extrabold">예시 빈집으로 전체 흐름 보기</span>
          <span className="mt-1 block text-[13px] text-white/60">가상의 &lsquo;부산광역시(예시) 예시구&rsquo; 주소·거래·지원사업이에요</span>
        </span>
        <span aria-hidden className="text-[26px]">›</span>
      </Link>

      <section>
        <h2 className="text-[22px] font-extrabold">이렇게 진행돼요</h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="rounded-2xl bg-fill p-4">
              <span className="text-[13px] font-extrabold text-brand">0{i + 1}</span>
              <p className="mt-1 font-extrabold">{t}</p>
              <p className="text-[13px] text-subtle">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[13px] text-subtle">
          맞춤 분석 대상: 부산 단독·다가구주택 · 건물과 매각할 토지를 같은 개인이 단독소유 · 전체 미사용 · 범위가 명확한 경우.
          그 밖의 경우에도 공개 정보와 확인 경로는 볼 수 있어요. 추천은 입력 조건에서의 비교이며 가격·거래·지원금을 보장하지 않아요.
        </p>
      </section>
    </div>
  );
}
