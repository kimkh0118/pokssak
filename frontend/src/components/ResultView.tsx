"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ConditionAssessment } from "@/lib/api";
import { api, type Analysis, type Compare, type Reference, type User } from "@/lib/api";
import { formatWon } from "@/lib/format";
import { AnswersEditor } from "./AnswersEditor";
import { LEGAL_KEYS, Verdict } from "./Verdict";
import { LineChart } from "./LineChart";
import { AddressPlate, plateTitle } from "./AddressSign";
import { PublicInfo } from "./PublicInfo";
import { Button, Card, Notice, Pill, SampleBanner } from "./ui";

const w = (v: number | null | undefined) => (v == null ? "미확인" : formatWon(v));
const pair = (p: [number, number] | null | undefined) => (!p ? "미확인" : p[0] === p[1] ? w(p[0]) : `${w(p[0])} ~ ${w(p[1])}`);

export function ResultView({ id }: { id: string }) {
  const params = useSearchParams();
  const [data, setData] = useState<Analysis | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<string | null>(params.get("saved"));
  const [tab, setTab] = useState<Tab>("summary");

  useEffect(() => {
    api<Analysis>(`/api/analyses/${id}`).then(setData).catch((e) => setError(e.message));
    api<{ user: User | null }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => {});
  }, [id]);

  if (error) return <div className="mx-auto max-w-xl py-10 text-center"><p className="text-[20px] font-extrabold">결과를 열 수 없어요</p><p className="mt-2 text-muted">{error}</p></div>;
  if (!data) return <div className="mx-auto max-w-3xl space-y-3" aria-busy="true"><span className="sr-only">불러오는 중</span>{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-fill" />)}</div>;

  const r = data.result;
  const cmp: Compare | null = r.calc ? r.calc.withoutSupport : null;
  const blocked = data.eligibility.holdReasons.some((h) => LEGAL_KEYS.some((k) => h.includes(k)));

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-6">
      {data.mode === "sample" && <SampleBanner />}

      <header className="space-y-2">
        <h1 className="sr-only">{data.address.roadAddr}</h1>
        <AddressPlate title={plateTitle(data.address.jibunAddr, data.address.roadAddr)} sub={data.address.roadAddr} />
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {Object.values(data.eligibility.labels).filter(Boolean).map((t) => <span key={t} className="shrink-0"><Pill>{t}</Pill></span>)}
        </div>
      </header>

      <Verdict data={data} />
      <WatchCta data={data} user={user} saved={saveState} onSaved={() => setSaveState("new")} />

      <ResultTabs tab={tab} setTab={setTab} blocked={blocked} />

      {tab === "summary" && (
        <div className="space-y-4">
          {!blocked && <section aria-labelledby="cmp" className="panel">
            <h2 id="cmp" className="text-[18px] font-extrabold">두 판매 방식 비교</h2>
            <p className="mt-1 text-[13px] text-subtle">예상값으로 계산했어요. 세금·관리비 등은 빠져 있어요.</p>
            {cmp ? <CompareTable data={data} cmp={cmp} /> : <Notice>주변 거래 자료가 없어 비교할 수 없어요.</Notice>}
          </section>}
          {!blocked && cmp && <Breakeven cmp={cmp} known={!!r.calc?.demolitionKnown} costsComplete={!!r.calc?.costsComplete} />}
          {(data.answers as { draft?: boolean }).draft && (
            <Notice tone="warn">아직 질문 4개에 답하지 않아 모르는 값으로 계산했어요. 아래에서 답하면 결과가 더 정확해져요.</Notice>
          )}
          <details className="panel group" open={(data.answers as { draft?: boolean }).draft || undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-[16px] font-extrabold">
              질문 답 바꾸기<span aria-hidden className="text-subtle transition group-open:rotate-90">›</span>
            </summary>
            <div className="mt-3"><AnswersEditor key={`a-${data.updatedAt}`} data={data} onSaved={setData} /></div>
          </details>
        </div>
      )}

      {tab === "price" && (
        <div className="space-y-4">
          <section aria-labelledby="ref" className="panel">
            <h2 id="ref" className="text-[18px] font-extrabold">예상 집값·땅값</h2>
            <p className="mt-1 text-[13px] text-subtle">공인중개사가 쓰는 세 가지 방법(비슷한 거래 비교 · 땅값+남은 건물값 · 공시가격 비율)을 함께 계산했어요. 감정평가가 아니에요.</p>
            <div className="mt-3 space-y-3">
              <RefCard r={data.reference.house} />
              <RefCard r={data.reference.land} />
            </div>
          </section>
          <PriceTrend data={data} />
        </div>
      )}

      {tab === "demolish" && (
        <div className="space-y-4">
          {blocked ? <Notice>권리·대상 문제를 먼저 정리해야 해서 철거비를 계산하지 않았어요.</Notice> : <DemolitionEstimate data={data} />}
          <Programs />
        </div>
      )}

      {tab === "broker" && <BrokerConnect data={data} user={user} />}

      {tab === "info" && (
        <section className="panel space-y-5">
          <PublicInfo lookup={{ ...data.public, address: data.address, pnu: data.pnu, checks: data.checks, mode: data.mode,
            houseTrades: data.tradeStatus.houseTrades, landTrades: data.tradeStatus.landTrades } as never} />
          <div>
            <h3 className="font-bold">추가 확인사항</h3>
            <ul className="mt-1 list-disc pl-5 text-[14px] text-muted">{data.eligibility.confirmations.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="mt-2 text-[12px] text-subtle">{data.eligibility.notice} · 규칙 {r.ruleVersion} · {new Date(data.updatedAt).toLocaleString("ko-KR")}</p>
          </div>
        </section>
      )}
    </div>
  );
}

const TAB_LIST = [["summary", "요약"], ["price", "가격"], ["demolish", "철거"], ["broker", "중개사"], ["info", "정보"]] as const;
type Tab = (typeof TAB_LIST)[number][0];

// 결과 화면 탭(위에 붙어 따라옴). 한 번에 한 구역만 보여 화면을 가볍게.
function ResultTabs({ tab, setTab, blocked }: { tab: Tab; setTab: (t: Tab) => void; blocked: boolean }) {
  const list = blocked ? TAB_LIST.filter(([k]) => k !== "price") : TAB_LIST;
  return (
    <div role="tablist" aria-label="결과 보기" className="sticky top-[calc(64px+env(safe-area-inset-top))] z-20 -mx-4 bg-[#f4f1ec]/95 px-4 py-2 backdrop-blur">
      <div className="grid rounded-xl bg-fill-strong p-1" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); window.scrollTo({ top: Math.min(window.scrollY, 380), behavior: "smooth" }); }}
            className={`h-9 rounded-lg text-[14px] font-bold transition ${tab === k ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// 내 자산 저장 + 이 기기 알림. 로그인 전에는 로그인 유도.
function WatchCta({ data, user, saved, onSaved }: { data: Analysis; user: User | null; saved: string | null; onSaved: () => void }) {
  const [isSaved, setIsSaved] = useState<boolean | null>(saved ? true : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user || saved) return;
    fetch("/api/assets").then((r) => (r.ok ? r.json() : null)).then((d) => setIsSaved(!!d?.assets?.some((a: { pnu: string }) => a.pnu === data.pnu))).catch(() => {});
  }, [user, saved, data.pnu]);
  if (!user) {
    return (
      <Link href={`/login?next=/analyses/${data.id}`} className="flex items-center justify-between rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
        <span><b className="block text-[15px]">가격이 바뀌면 알려드릴까요?</b><span className="text-[13px] text-subtle">로그인하면 내 자산으로 저장하고 알림을 받아요</span></span>
        <span className="shrink-0 rounded-lg bg-brand px-3 py-2 text-[14px] font-bold text-white">로그인</span>
      </Link>
    );
  }
  if (isSaved === false) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
        <span><b className="block text-[15px]">내 자산으로 저장할까요?</b><span className="text-[13px] text-subtle">저장하면 예상 가격이 바뀔 때 알려드려요</span></span>
        <Button disabled={busy} onClick={async () => { setBusy(true); try { await api(`/api/analyses/${data.id}/save`, { method: "POST" }); setIsSaved(true); onSaved(); } finally { setBusy(false); } }}>저장</Button>
      </div>
    );
  }
  if (!isSaved) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
      <span className="min-w-0"><b className="block text-[15px]">✓ 내 자산으로 저장됐어요</b><span className="text-[13px] text-subtle">예상 가격이 3% 넘게 바뀌면 알림</span></span>
      <Link href={`/notify?next=/analyses/${data.id}`} className="shrink-0 rounded-lg bg-fill px-3 py-2 text-[13px] font-bold">알림 설정</Link>
    </div>
  );
}

// 위에 붙어 따라오는 구역 이동 탭. 지금 보이는 구역을 표시한다.
function Explain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group mt-2 text-[13px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-fill px-2.5 py-1 font-bold text-muted">ⓘ {title}</summary>
      <div className="mt-2 space-y-1 rounded-xl bg-fill p-3 text-muted">{children}</div>
    </details>
  );
}

function CompareTable({ data, cmp }: { data: Analysis; cmp: Compare }) {
  const b = cmp.base, r = data.result;
  const known = !!r.calc?.demolitionKnown;
  const rows: [string, string, string][] = [
    ["예상 판매가", w(b.H), w(b.L)],
    ["철거비", "—", known ? `− ${w(b.D)}` : "미확인"],
    ["중개보수", `− ${w(b.M_H)}`, `− ${w(b.M_L)}`],
  ];
  const better = known ? (b.delta > 0 ? "L" : b.delta < 0 ? "H" : null) : null;
  return (
    <div className="mt-3">
      <table className="tabular w-full table-fixed text-[13px] sm:text-[14px]">
        <caption className="sr-only">그대로 팔 때와 철거 후 땅으로 팔 때 비교</caption>
        <colgroup><col className="w-[30%]" /><col /><col /></colgroup>
        <thead>
          <tr className="text-left text-[12px] text-subtle">
            <th className="pb-2 font-semibold"></th>
            <th className="pb-2 font-bold">그대로 팔 때</th>
            <th className="pb-2 font-bold">철거 후 땅</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, h, l]) => (
            <tr key={k} className="border-t border-line">
              <th scope="row" className="py-2.5 pr-2 text-left font-semibold text-muted">{k}</th>
              <td className="py-2.5 pr-2">{h}</td>
              <td className={`py-2.5 ${l === "미확인" ? "text-bad" : ""}`}>{l}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink/15 text-[14px] sm:text-[15px]">
            <th scope="row" className="py-3 pr-2 text-left font-extrabold">남는 돈</th>
            <td className={`py-3 pr-2 font-extrabold ${better === "H" ? "text-brand-strong" : ""}`}>{w(b.N_H)}</td>
            <td className={`py-3 font-extrabold ${better === "L" ? "text-brand-strong" : ""}`}>{known ? w(b.N_L) : "—"}</td>
          </tr>
        </tbody>
      </table>
      {known && (
        <p className="mt-1 rounded-xl bg-fill px-3 py-2.5 text-[14px]">
          {better === "H" ? "그대로 팔 때" : better === "L" ? "철거 후 땅으로 팔 때" : "두 방법이"} <b className="tabular">{better ? `${w(Math.abs(b.delta))} 더 남아요` : "비슷해요"}</b>
          {cmp.overlap && <span className="block text-[12px] text-warn">예상 범위가 겹쳐서 실제로는 반대가 될 수도 있어요.</span>}
        </p>
      )}
      <div className="mt-2">
        <Explain title="계산식·범위·빠진 비용">
          <p>그대로 팔 때 = 예상 판매가 − 중개보수 (범위 {pair(cmp.ranges.N_H)})</p>
          {known && <p>철거 후 = 예상 땅값 − 예상 철거비 − 중개보수 (범위 {pair(cmp.ranges.N_L)})</p>}
          <p>중개보수: {r.brokerageRule.name}({r.brokerageRule.effective} 시행) 상한요율.</p>
          <p>빠진 비용: 세금, 보유·관리비, 금융비, 짐 정리비, 과거 취득비용, 대출·보증금 정산. 최종 실수령액이 아니에요.</p>
        </Explain>
      </div>
    </div>
  );
}

// 철거비 손익분기점 하나만: 철거비가 이 금액보다 적으면 철거 후 판매가 유리
function Breakeven({ cmp, known }: { cmp: Compare; known: boolean; costsComplete?: boolean }) {
  const b = cmp.base;
  return (
    <section className="panel" aria-labelledby="be">
      <p id="be" className="text-[13px] font-bold text-subtle">철거비 손익분기점</p>
      {b.D_star <= 0 ? (
        <p className="mt-1 text-[15px] font-bold">이 가격대에서는 철거비가 0원이어도 그대로 파는 쪽이 더 남아요.</p>
      ) : (
        <>
          <p className="num-in tabular mt-1 text-[24px] font-extrabold">{formatWon(b.D_star)}</p>
          <p className="text-[14px] text-muted">철거비가 이보다 적게 나오면 철거 후 땅으로 파는 게 더 남아요.{known && ` 예상 철거비는 ${formatWon(b.D)}이에요.`}</p>
        </>
      )}
      <Explain title="계산식">
        <p>손익분기점 = 예상 땅값 − 예상 판매가 − (땅 중개보수 − 집 중개보수)</p>
        <p>= {formatWon(b.L)} − {formatWon(b.H)} − ({formatWon(b.M_L)} − {formatWon(b.M_H)})</p>
      </Explain>
    </section>
  );
}

const AGREE = { good: "세 방법이 비슷해요", check: "방법별 차이가 커요 — 중개사 확인 필요", single: "한 가지 방법으로만 계산했어요" } as const;

const SOURCE = { ai: "AI가 설명을 읽고 매긴 점수", rules: "설명 속 키워드로 매긴 점수", choices: "질문 답으로 매긴 점수" } as const;

/** 상태 점수: 기본 예상가 → 항목별 +/− → 최종 예상가 */
function ConditionBreakdown({ base, final, c }: { base: number; final: number; c: ConditionAssessment }) {
  return (
    <div className="mt-3 rounded-xl bg-fill p-3.5">
      <p className="flex items-center justify-between text-[12px] font-bold text-subtle">
        <span>집 상태 반영</span><span>{SOURCE[c.source]}</span>
      </p>
      <div className="mt-2 flex items-baseline justify-between text-[13px]">
        <span className="text-muted">공공자료 기본 예상가</span><span className="tabular font-semibold">{formatWon(base)}</span>
      </div>
      <ul className="stagger mt-1 space-y-1">
        {c.items.map((i) => (
          <li key={i.key} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0"><span className="font-semibold">{i.label}</span> <span className="text-[12px] text-subtle">{i.evidence}</span></span>
            <span className={`tabular shrink-0 font-bold ${i.pct > 0 ? "text-good" : "text-bad"}`}>{i.pct > 0 ? "+" : ""}{i.pct}%</span>
          </li>
        ))}
        {c.items.length === 0 && <li className="text-[12px] text-subtle">가격에 영향을 줄 상태가 없었어요.</li>}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2 text-[14px]">
        <b>최종 예상가 <span className={`tabular text-[12px] ${c.pct > 0 ? "text-good" : c.pct < 0 ? "text-bad" : "text-subtle"}`}>{c.pct > 0 ? "+" : ""}{c.pct}%{c.capped ? " (한도)" : ""}</span></b>
        <b className="tabular">{formatWon(final)}</b>
      </div>
      {!c.notes && <p className="mt-2 text-[12px] text-subtle">아래 ‘질문 답 바꾸기’에서 집 상태를 글로 적으면 더 정확해져요.</p>}
    </div>
  );
}

function RefCard({ r }: { r: Reference }) {
  const v = r.valuation;
  const est = r.estimated && v?.value != null;
  return (
    <Card>
      <p className="text-[13px] font-bold text-subtle">{r.label} {est ? "추정가(중개사 방식)" : "참고가격"}</p>
      <p className="num-in tabular mt-1 text-[22px] font-extrabold">{r.value == null ? "산정 보류" : formatWon(r.value)}</p>
      {r.condition && r.baseValue != null && <ConditionBreakdown base={r.baseValue} final={r.value!} c={r.condition} />}
      {r.condition && r.range ? (
        <p className="text-[12px] text-subtle">상태 반영 범위 {formatWon(r.range.min)} ~ {formatWon(r.range.max)}</p>
      ) : est && v?.range ? (
        <p className="text-[12px] text-subtle">추정 범위 {formatWon(v.range.min)} ~ {formatWon(v.range.max)}
          {v.agreement && <span className={v.agreement === "check" ? " font-bold text-warn" : ""}> · {AGREE[v.agreement]}</span>}</p>
      ) : (
        <p className="text-[12px] text-subtle">{r.status === "median" ? `${r.sampleSize}건 단가 중앙값` : r.status === "single" ? "단일 사례 환산값" : "자료 부족"}
          {r.range && ` · 관측 범위 ${formatWon(r.range.min)} ~ ${formatWon(r.range.max)}`}</p>
      )}
      {est && v && (
        <div className="mt-3 space-y-2">
          <ul className="space-y-1.5 text-[13px]">
            {v.methods.filter((m) => m.value).map((m) => (
              <li key={m.key} className="rounded-lg bg-fill px-3 py-2">
                <span className="flex items-baseline justify-between gap-2">
                  <b>{m.name}</b>
                  <span className="tabular font-bold">{formatWon(m.value!)}{m.share != null && <span className="ml-1 text-[11px] font-normal text-subtle">반영 {Math.round(m.share * 100)}%</span>}</span>
                </span>
                <span className="block text-[12px] text-muted">{m.detail}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted">이 땅의 보정: {v.factors.map((f) => `${f.label} ${f.factor === 1 ? "±0%" : `${f.factor > 1 ? "+" : ""}${Math.round((f.factor - 1) * 100)}%`}`).join(", ")}</p>
          <p className="text-[12px] text-subtle">{r.condition ? "알려 주신 집 상태까지 반영했어요." : "집 내부 상태는 반영하지 못했어요."} 실제로 팔기 전에는 공인중개사에게 시세를 확인하세요.</p>
        </div>
      )}
      {r.notes.map((n) => <p key={n} className="mt-1 text-[12px] text-warn">{n}</p>)}
      {r.extended && <p className="mt-1 text-[12px] text-muted">{r.extended.note}: {r.extended.sampleSize}건 · {formatWon(r.extended.value)}</p>}
      {r.decisions.length > 0 && (
        <Explain title={`실거래 사례 ${r.decisions.length}건 선정·제외 사유`}>
          <ul className="space-y-1">{r.decisions.map((d, i) => (
            <li key={i} className={d.included ? "text-ink" : ""}>{d.trade.dealDate} {d.trade.umdNm} {d.trade.jibunMasked} · {d.trade.landArea}㎡ · {formatWon(d.trade.amountWon)} — {d.included ? "사용" : `제외: ${d.reason}`}</li>
          ))}</ul>
          <p>공개 지번이 일부 가려져 있어 대상 필지와 연결하지 않아요.</p>
        </Explain>
      )}
    </Card>
  );
}

// 철거 지원은 국가 빈집 누리집(빈집애)에서 신청 — 이 서비스는 연결만 한다
function Programs() {
  return (
    <section aria-labelledby="prog" className="panel">
      <h2 id="prog" className="text-[18px] font-extrabold">철거 지원 신청</h2>
      <p className="mt-1 text-[13px] text-subtle">빈집 철거비 지원은 구·군마다 금액과 조건이 달라요. 빈집애에서 신청하거나 구청 담당 부서에 올해 지원 여부를 물어보세요.</p>
      <BinzibeLink />
    </section>
  );
}

function BinzibeLink() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
      <span className="min-w-0">
        <span className="block text-[15px] font-extrabold">빈집 철거 지원은 &lsquo;빈집애&rsquo;에서 온라인 신청할 수 있어요</span>
        <span className="block text-[13px] text-muted">국토교통부·농림축산식품부 빈집철거지원사업 통합 창구예요. 심사·지원은 관할 구·군청이 해요.</span>
      </span>
      <span className="flex shrink-0 flex-wrap gap-2">
        <a href="https://www.binzibe.kr/main/" target="_blank" rel="noopener noreferrer"
          className="rounded-lg bg-brand px-4 py-2 text-[14px] font-bold text-white hover:bg-brand-strong">빈집애 바로가기</a>
        <a href="https://www.binzibe.kr/main/html/maintenance5.html" target="_blank" rel="noopener noreferrer"
          className="rounded-lg bg-fill px-4 py-2 text-[14px] font-bold hover:bg-fill-strong">구청 담당 부서 찾기</a>
      </span>
    </div>
  );
}

// 지금까지의 가격 변동(예측 아님). 단위가 다른 두 가지는 그래프를 나눈다.
const SERIES_COLOR = { house: "#c4733f", land: "#4f54b5" };
const won1 = (v: number) => (v >= 100_000_000 ? `${(v / 100_000_000).toFixed(1)}억` : `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`);
const pctText = (c: { from: number; to: number; pct: number } | null) => (c ? `${c.from}→${c.to}년 ${c.pct > 0 ? "+" : ""}${c.pct}%` : null);

function PriceTrend({ data }: { data: Analysis }) {
  const t = data.trend;
  const off = t?.official.points ?? [];
  const trAll = t?.trades.points ?? [];
  const tr = trAll.some((p) => p.houseUnit != null || p.landUnit != null) ? trAll : [];
  if (!off.length && !tr.length) {
    return (
      <section aria-labelledby="trend" className="panel">
        <h2 id="trend" className="text-[18px] font-extrabold">가격 변동</h2>
        <p className="mt-2 text-[14px] text-muted">이 분석에는 가격 기록이 없어요. 주소를 다시 조회하면 연도별 공식 가격과 동네 거래 흐름을 볼 수 있어요.</p>
      </section>
    );
  }
  const ch = t!.official.change;
  const summary = [pctText(ch.house5) && `집 공시가격 ${pctText(ch.house5)}`, pctText(ch.land5) && `땅 공시가격 ${pctText(ch.land5)}`].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby="trend" className="panel space-y-6">
      <div>
        <h2 id="trend" className="text-[18px] font-extrabold">가격 변동</h2>
        <p className="mt-1 text-[13px] text-subtle">지금까지의 기록이에요. 앞으로의 가격을 예측한 값이 아니에요.{summary && <> 최근 5년: <b className="text-ink">{summary}</b></>}</p>
      </div>
      {off.length > 0 && (
        <LineChart title="공식 가격(연도별)" labels={off.map((p) => String(p.year))}
          series={[
            ...(off.some((p) => p.house) ? [{ key: "house", label: "집(공시가격)", short: "집", color: SERIES_COLOR.house, values: off.map((p) => p.house) }] : []),
            ...(off.some((p) => p.land) ? [{ key: "land", label: "땅(공시지가×면적)", short: "땅", color: SERIES_COLOR.land, values: off.map((p) => p.land) }] : []),
          ]}
          format={formatWon} formatShort={won1}
          note="정부가 매년 정하는 공시가격이라 실제 거래가보다 보통 낮아요. 집 공시가격은 단독·다가구 주택만 있어요." />
      )}
      {tr.length > 0 && (
        <LineChart title={`${t!.trades.umdNm} 실거래 ㎡당 가격(분기별 중앙값)`} labels={tr.map((p) => p.quarter.replace("-Q", "년 ") + "분기")}
          series={[
            ...(tr.some((p) => p.houseUnit) ? [{ key: "house", label: "단독·다가구", short: "단독", color: SERIES_COLOR.house, values: tr.map((p) => p.houseUnit) }] : []),
            ...(tr.some((p) => p.landUnit) ? [{ key: "land", label: "토지", short: "토지", color: SERIES_COLOR.land, values: tr.map((p) => p.landUnit) }] : []),
          ]}
          format={(v) => `${Math.round(v).toLocaleString("ko-KR")}원/㎡`} formatShort={(v) => `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`}
          note={`대지 면적 기준. 분기별 거래 수: ${tr.map((p) => `${p.quarter.slice(2).replace("-Q", ".")}분기 ${p.houseN + p.landN}건`).join(", ")} — 거래가 적은 분기는 크게 흔들리고, 0건인 분기는 값이 없어요.`} />
      )}
    </section>
  );
}

// 예상 철거비(개략). 결과 비교는 이 범위의 가정값으로 계산한다.
function DemolitionEstimate({ data }: { data: Analysis }) {
  const e = data.demolitionEstimate;
  if (!e) return null;
  return (
    <section aria-labelledby="demo-est" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="demo-est" className="text-[18px] font-extrabold">예상 철거비</h2>
        <span className="text-[12px] font-bold text-subtle">견적 아님 · 개략 범위</span>
      </div>
      <p className="num-in tabular mt-1 text-[24px] font-extrabold">{formatWon(e.min)} ~ {formatWon(e.max)}</p>
      <p className="mt-1 text-[13px] text-muted">위 결과는 이 범위로 계산했어요(가운데 값 {formatWon(e.mid)}).</p>
      <ul className="mt-3 space-y-1 text-[13px]">
        {e.items.map((i) => (
          <li key={i.label} className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-1.5 first:border-t-0">
            <span><b>{i.label}</b> <span className="text-subtle">{i.note}</span></span>
            <span className="tabular shrink-0">{formatWon(i.min)} ~ {formatWon(i.max)}</span>
          </li>
        ))}
      </ul>
      {e.notes.map((n) => <p key={n} className="mt-2 text-[12px] text-subtle">{n}</p>)}
    </section>
  );
}

// 매물을 내놓을 동네 공인중개사무소(국토부 등록 정보). 로그인 + 내 자산 등록 후에만 보여준다.
type Office = { name: string; regNo: string; jibunAddr: string; roadAddr: string; registeredOn: string;
  phone?: string | null; placeUrl?: string | null; distanceM?: number | null };
type Brokers = { dong: string; sgg: string; sameDong: Office[]; nearby: Office[]; total: number; source: string;
  sortedBy: "distance" | "registry"; localNote: string | null };
const distText = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);

function BrokerConnect({ data, user }: { data: Analysis; user: User | null }) {
  const [state, setState] = useState<"loading" | "login" | "save" | "ok" | "error">(user ? "loading" : "login");
  const [list, setList] = useState<Brokers | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    if (!user) { setState("login"); return; }
    const r = await fetch(`/api/analyses/${data.id}/brokers`);
    if (r.status === 401) setState("login");
    else if (r.status === 403) setState("save");
    else if (r.ok) { setList(await r.json()); setState("ok"); }
    else { setMsg((await r.json()).error ?? "중개사무소 정보를 불러오지 못했어요."); setState("error"); }
  }, [data.id, user]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function save() {
    try { await api(`/api/analyses/${data.id}/save`, { method: "POST" }); await load(); }
    catch (e) { setMsg((e as Error).message); setState("error"); }
  }
  const house = data.reference.house.value;
  const inquiry = `안녕하세요. ${data.address.roadAddr}(지번 ${data.address.jibunAddr}) 단독주택 소유자입니다. `
    + `집을 내놓으려고 하는데, 지금 상태 그대로 팔 때와 철거 후 땅으로 팔 때 가격을 각각 알 수 있을까요?`
    + (house ? ` (참고로 온라인 예상가는 약 ${formatWon(house)}이었어요.)` : "");
  async function copy() {
    try { await navigator.clipboard.writeText(inquiry); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  // 지도 검색: 이름+전체 주소는 너무 길어 결과가 안 나와서 '사무소 이름 + 구'로, 안 나오면 주소로 찾기
  const mapLinks = (o: Office) => {
    const byName = encodeURIComponent(`${o.name} ${list?.sgg ?? ""}`.trim());
    const byAddr = encodeURIComponent(o.roadAddr || o.jibunAddr || "");
    return [["네이버 지도", `https://map.naver.com/p/search/${byName}`], ["카카오맵", o.placeUrl || `https://map.kakao.com/?q=${byName}`],
      ...(byAddr ? [["주소로 찾기", `https://map.naver.com/p/search/${byAddr}`]] : [])];
  };
  const Row = ({ o }: { o: Office }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2.5 first:border-t-0">
      <span className="min-w-0">
        <b className="text-[15px]">{o.name}</b>
        {o.phone && <a href={`tel:${o.phone.replace(/[^0-9]/g, "")}`} className="tabular ml-2 text-[12px] text-muted underline-offset-2 hover:underline">{o.phone}</a>}
        <span className="block text-[12px] text-subtle">
          {o.distanceM != null && <span className="font-bold text-ink">집에서 {distText(o.distanceM)} · </span>}
          {o.roadAddr || o.jibunAddr} · 등록번호 {o.regNo}
        </span>
      </span>
      <span className="flex shrink-0 gap-1.5">
        {mapLinks(o).map(([label, href]) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-fill px-3 py-1.5 text-[13px] font-bold hover:bg-fill-strong">{label}</a>
        ))}
      </span>
    </li>
  );
  return (
    <section aria-labelledby="broker" className="panel">
      <h2 id="broker" className="text-[18px] font-extrabold">공인중개사 연결</h2>
      <p className="mt-1 text-[13px] text-subtle">매물을 내놓을 동네 공인중개사무소를 찾아 드려요. 국토교통부에 등록된 영업 중인 사무소예요. 이 서비스는 연결만 하고, 주소·연락처를 업체에 보내지 않아요.</p>
      {state === "login" && (
        <div className="mt-3 rounded-xl bg-fill p-4">
          <p className="text-[14px] font-bold">로그인하고 이 집을 내 자산으로 저장하면 동네 공인중개사를 보여 드려요.</p>
          <Link href={`/login?next=/analyses/${data.id}%23broker`} className="mt-2 inline-flex rounded-lg bg-brand px-4 py-2 text-[14px] font-bold text-white">로그인</Link>
        </div>
      )}
      {state === "save" && (
        <div className="mt-3 rounded-xl bg-fill p-4">
          <p className="text-[14px] font-bold">이 집을 내 자산으로 저장하면 동네 공인중개사를 보여 드려요.</p>
          <Button className="mt-2" onClick={() => void save()}>내 자산에 저장하기</Button>
        </div>
      )}
      {state === "loading" && <div className="mt-3 h-24 animate-pulse rounded-xl bg-fill" />}
      {state === "error" && msg && <Notice tone="bad">{msg}</Notice>}
      {state === "ok" && list && (
        <div className="mt-3 space-y-4">
          <div className="rounded-xl bg-fill p-4 text-[14px]">
            <p className="font-bold">이렇게 문의해 보세요</p>
            <p className="mt-1 text-muted">{inquiry}</p>
            <Button variant="secondary" className="mt-2" onClick={() => void copy()}>{copied ? "복사했어요" : "문의 내용 복사"}</Button>
          </div>
          {list.sameDong.length > 0 && (
            <div>
              <p className="text-[14px] font-extrabold">{list.dong} 사무소 {list.sameDong.length}곳{list.sortedBy === "distance" && <span className="ml-1 text-[12px] font-bold text-subtle">가까운 순</span>}</p>
              <ul className="mt-1">{list.sameDong.map((o) => <Row key={o.regNo + o.name} o={o} />)}</ul>
            </div>
          )}
          {list.nearby.length > 0 && (
            <details open={list.sameDong.length === 0}>
              <summary className="cursor-pointer text-[14px] font-extrabold">{list.sgg}의 다른 사무소 보기</summary>
              <ul className="mt-1">{list.nearby.map((o) => <Row key={o.regNo + o.name} o={o} />)}</ul>
            </details>
          )}
          {list.total === 0 && <Notice>이 지역에 등록된 영업 중인 중개사무소 정보가 없어요.</Notice>}
          <p className="text-[12px] text-subtle">
            자료: {list.source}{list.sortedBy === "distance" ? " · 전화번호·위치: 카카오 로컬. 집에서 가까운 순이에요" : ""}. 특정 사무소를 추천하는 것이 아니에요.
            {list.localNote && <span className="block text-warn">{list.localNote}</span>}
          </p>
        </div>
      )}
    </section>
  );
}
