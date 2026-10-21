import Link from "next/link";

const TICKER = [
  ["공시지가 말고", "실거래 사례로"],
  ["세금은", "확인한 금액만"],
  ["모르면", "판단 보류로 솔직하게"],
  ["업체 수수료는", "순위에 반영 안 함"],
];

export const dynamic = "force-dynamic";

const OPTIONS = [
  { t: "현상태로 매각", d: "지금 그대로 팔면 남는 돈" },
  { t: "철거 후 토지 매각", d: "허물고 땅으로 팔면" },
  { t: "리모델링", d: "고쳐서 팔거나·세주거나·살거나" },
  { t: "현상태 유지", d: "그대로 두면 3년 뒤 내 자산" },
];

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** 백엔드에 인증키 설정 여부를 묻는다(키 값은 오지 않음). 백엔드가 꺼져 있으면 null */
async function keyStatus(): Promise<{ juso: boolean; dataGoKr: boolean; vworld: boolean } | null> {
  try {
    const r = await fetch(`${BACKEND_URL}/api/status`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export default async function Home() {
  const status = await keyStatus();
  const keys = [
    { name: "주소 검색", ok: !!status?.juso },
    { name: "건축물대장·실거래가", ok: !!status?.dataGoKr },
    { name: "토지특성·공시지가", ok: !!status?.vworld },
  ];
  const ready = keys.every((k) => k.ok);
  return (
    <div className="space-y-12">
      <div className="-mx-4 -mt-6 overflow-hidden bg-ink py-2.5 text-[14px] font-bold text-white" aria-label="서비스 원칙">
        <div className="ticker flex w-max gap-10 whitespace-nowrap">
          {[...TICKER, ...TICKER].map(([a, b], i) => (
            <span key={i} aria-hidden={i >= TICKER.length}>
              {a} <span className="text-brand-2">{b}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-3xl space-y-12">
      <section className="pt-2">
        <h1 className="text-[30px] font-extrabold leading-[1.25] tracking-tight sm:text-[38px]">
          우리 집, 팔까 고칠까?
          <br />
          <span className="text-brand">얼마 남는지</span> 비교해 드려요
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">주소 하나와 질문 2개면 충분해요. 단독·다가구주택만 지원합니다.</p>

        <Link
          href="/analyze?mode=live"
          className="mt-6 flex h-16 items-center gap-3 rounded-2xl bg-fill px-5 text-[17px] font-bold text-subtle transition hover:bg-fill-strong"
        >
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="text-ink">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          집 주소를 입력해 주세요
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          {keys.map((k) => (
            <span key={k.name} className={`rounded-full px-2.5 py-1 font-bold ${k.ok ? "bg-brand-soft text-brand" : "bg-fill text-subtle"}`}>
              {k.ok ? "✓" : "–"} {k.name}
            </span>
          ))}
          {!status && <span className="text-bad">백엔드 서버가 꺼져 있어요(README 실행 방법 참고)</span>}
          {status && !ready && <span className="text-subtle">인증키가 없는 항목은 조회 오류로 안내돼요</span>}
        </div>
      </section>

      <Link href="/analyze?mode=sample" className="flex items-center justify-between rounded-2xl bg-ink p-5 text-white transition hover:opacity-95">
        <span>
          <span className="text-[13px] font-bold text-brand-2">인증키 없이 1분 체험</span>
          <span className="mt-1 block text-[19px] font-extrabold">예시 집으로 먼저 해보기</span>
          <span className="mt-1 block text-[13px] text-white/60">가상의 &lsquo;예시시 예시구&rsquo; 주소와 거래 사례예요</span>
        </span>
        <span aria-hidden className="text-[26px]">›</span>
      </Link>

      <section>
        <h2 className="text-[22px] font-extrabold tracking-tight">4가지 선택을 같은 기준으로</h2>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {OPTIONS.map((o, i) => (
            <li key={o.t} className="rounded-2xl bg-fill p-4">
              <span className="text-[13px] font-extrabold text-brand">0{i + 1}</span>
              <p className="mt-1 text-[16px] font-extrabold">{o.t}</p>
              <p className="mt-0.5 text-[13px] text-subtle">{o.d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-[22px] font-extrabold tracking-tight">이렇게 계산해요</h2>
        <ol className="mt-4 space-y-3">
          {[
            ["비용 빼고 남는 돈", "공사비·중개보수·대출·보증금까지 빼고, 아직 안 판 집은 현금이 아닌 '보유 자산'으로 따로 보여드려요."],
            ["어디서부터 유리해지는지", "손익분기 매각가와 최대 허용 공사비를 알려드려요."],
            ["모르면 모른다고", "정보가 부족하면 '현상태 유지'가 아니라 '판단 보류'로 안내해요. 세금은 확인한 금액만 반영해요."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-extrabold text-white">{i + 1}</span>
              <span>
                <span className="block text-[16px] font-bold">{t}</span>
                <span className="block text-[14px] leading-relaxed text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      </div>
    </div>
  );
}
