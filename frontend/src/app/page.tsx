import { HomeSign } from "@/components/HomeSign";
import { HomeWatchlist } from "@/components/HomeWatchlist";

export const dynamic = "force-dynamic";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

async function backendUp(): Promise<boolean> {
  try {
    return (await fetch(`${BACKEND_URL}/api/status`, { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

// 폭싹이 알려주는 것(순서가 아니라 기능 목록)
const FEATURES = [
  ["₩", "예상 집값·땅값", "공인중개사가 쓰는 세 가지 방법으로 계산해요"],
  ["⛏", "예상 철거비", "건축물대장의 면적·구조·지붕으로 항목별 범위를 내요"],
  ["🔔", "가격 알림", "내 자산의 예상 가격이 바뀌면 휴대폰으로 알려요"],
];

export default async function Home() {
  const up = await backendUp();
  return (
    <div className="mx-auto max-w-md space-y-7">
      <section className="pt-2">
        <p className="text-[13px] font-bold text-subtle">부산 빈집 소유자를 위한</p>
        <h1 className="mt-1 text-[30px] font-extrabold leading-[1.2] tracking-tight">
          그대로 팔까,
          <br />
          철거하고 팔까?
        </h1>
        <p className="mt-2 text-[15px] text-muted">주소만 넣으면 예상 집값과 철거비로 어느 쪽이 얼마 더 남는지 알려드려요.</p>
        <div className="mt-5"><HomeSign /></div>
        {!up && <p className="mt-2 text-[13px] font-bold text-bad">서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
      </section>

      <HomeWatchlist />

      <section aria-labelledby="features">
        <h2 id="features" className="text-[17px] font-extrabold">폭싹이 알려주는 것</h2>
        <ul className="mt-3 space-y-2">
          {FEATURES.map(([icon, t, d]) => (
            <li key={t} className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-[18px] font-extrabold text-brand-strong">{icon}</span>
              <span><b className="block text-[15px]">{t}</b><span className="text-[13px] text-subtle">{d}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-3 px-1 text-[12px] leading-relaxed text-subtle">부산 단독·다가구주택 기준이에요. 결과는 공개 자료로 계산한 예상값이라 실제 거래가·견적과 다를 수 있어요.</p>
      </section>
    </div>
  );
}
