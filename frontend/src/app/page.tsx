import { HomeSign } from "@/components/HomeSign";
import { LogoMark } from "@/components/Logo";

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
      <section className="rounded-2xl bg-surface/90 p-6 shadow-sm ring-1 ring-line sm:p-8">
        <p className="flex items-center gap-1 text-[14px] font-extrabold text-[#c9483b]"><LogoMark size={18} />폭싹</p>
        <h1 className="mt-2 text-[28px] font-extrabold leading-[1.25] tracking-tight sm:text-[36px]">
          집에 관련된 정보
          <br />
          알아보기.
        </h1>
        <p className="mt-2 text-[15px] text-muted">부산 빈집, 그대로 팔지 철거하고 팔지 — 비용 빼고 얼마 남는지 비교해요.</p>
        <div className="mt-6 max-w-md">
          <HomeSign />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          {s ? (
            [["juso", "주소"], ["dataGoKr", "건축물·실거래"], ["vworld", "토지특성·이용계획"]].map(([k, t]) => (
              <span key={k} className={`rounded-full px-2.5 py-1 font-bold ${s[k] ? "bg-brand-soft text-brand-strong" : "bg-fill text-subtle"}`}>{s[k] ? "✓" : "–"} {t}</span>
            ))
          ) : (
            <span className="text-bad">백엔드 서버가 꺼져 있어요(README 실행 방법 참고)</span>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-[22px] font-extrabold">이렇게 진행돼요</h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <span className="text-[13px] font-extrabold text-brand-strong">0{i + 1}</span>
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
