"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, type Analysis, type Compare, type Reference, type User } from "@/lib/api";
import { formatWon } from "@/lib/format";
import { KIND_LABEL, MATCH_LABEL, OPTION_LABEL } from "@/lib/labels";
import { AnswersEditor } from "./AnswersEditor";
import { InputsPanel } from "./InputsPanel";
import { LEGAL_KEYS, Verdict } from "./Verdict";
import { BUSAN_GU_SITES } from "@/lib/site";
import { AddressPlate, plateTitle } from "./AddressSign";
import { PublicInfo } from "./PublicInfo";
import { Button, Card, Notice, Pill, ProvenanceBadge, SampleBanner } from "./ui";

const w = (v: number | null | undefined) => (v == null ? "미확인" : formatWon(v));
const pair = (p: [number, number] | null | undefined) => (!p ? "미확인" : p[0] === p[1] ? w(p[0]) : `${w(p[0])} ~ ${w(p[1])}`);

export function ResultView({ id }: { id: string }) {
  const params = useSearchParams();
  const [data, setData] = useState<Analysis | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withSupport, setWithSupport] = useState(false);
  const [detail, setDetail] = useState<"sell" | "demolish" | "hold">("sell");
  const [saveState, setSaveState] = useState<string | null>(params.get("saved"));

  useEffect(() => {
    api<Analysis>(`/api/analyses/${id}`).then(setData).catch((e) => setError(e.message));
    api<{ user: User | null }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => {});
  }, [id]);

  if (error) return <div className="mx-auto max-w-xl py-10 text-center"><p className="text-[20px] font-extrabold">결과를 열 수 없어요</p><p className="mt-2 text-muted">{error}</p></div>;
  if (!data) return <div className="mx-auto max-w-3xl space-y-3" aria-busy="true"><span className="sr-only">불러오는 중</span>{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-fill" />)}</div>;

  const r = data.result;
  const cmp: Compare | null = r.calc ? (withSupport && r.calc.withSupport ? r.calc.withSupport : r.calc.withoutSupport) : null;
  const blocked = data.eligibility.holdReasons.some((h) => LEGAL_KEYS.some((k) => h.includes(k)));

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      {data.mode === "sample" && <SampleBanner />}
      <SaveBanner state={saveState} user={user} analysisId={data.id} onChange={setSaveState} />

      <header>
        <p className="text-[13px] text-subtle">규칙 {r.ruleVersion} · {new Date(data.updatedAt).toLocaleString("ko-KR")}</p>
        <h1 className="sr-only">{data.address.roadAddr}</h1>
        <div className="mt-2"><AddressPlate title={plateTitle(data.address.jibunAddr, data.address.roadAddr)} sub={data.address.roadAddr} /></div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.values(data.eligibility.labels).filter(Boolean).map((t) => <Pill key={t}>{t}</Pill>)}
        </div>
      </header>

      <Verdict data={data} />

      <ActionBar data={data} withSupport={withSupport} setWithSupport={setWithSupport} />


      {!blocked && <section aria-labelledby="cmp">
        <div className="flex items-end justify-between gap-2">
          <h2 id="cmp" className="text-[20px] font-extrabold">두 판매 방식 비교</h2>
          <span className="text-[12px] text-subtle">{withSupport ? "확인된 지원 반영" : "지원금 미반영(기본)"}</span>
        </div>
        <p className="mt-1 text-[13px] text-subtle">{r.label}. 세금·비용 미확인 항목이 있으면 반영 범위를 밝힌 참고금액이에요.</p>
        {cmp ? <CompareTable data={data} cmp={cmp} /> : <Notice>비교할 가격 자료가 없어요. 아래에서 상담 가격을 입력하면 계산해요.</Notice>}
      </section>}

      {!blocked && cmp && <Breakeven cmp={cmp} known={!!r.calc?.demolitionKnown} costsComplete={!!r.calc?.costsComplete} />}
      {!blocked && cmp && r.calc?.demolitionKnown && <Sensitivity cmp={cmp} pct={r.sensitivityAssumption} />}

      <AnswersEditor key={`a-${data.updatedAt}`} data={data} onSaved={setData} />
      <InputsPanel data={data} onSaved={setData} />

      <section aria-labelledby="ref">
        <h2 id="ref" className="text-[20px] font-extrabold">공공 실거래 참고가격</h2>
        <p className="mt-1 text-[13px] text-subtle">같은 법정동 최근 12개월 거래 중 면적 70~130%, 건축연도 10년 이내 사례(개발 설정이며 감정평가 기준 아님). 추천에는 상담 가격이 필요해요.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <RefCard r={data.reference.house} />
          <RefCard r={data.reference.land} />
        </div>
      </section>

      <section aria-labelledby="detail">
        <h2 id="detail" className="text-[20px] font-extrabold">방식별 상세</h2>
        <div className="mt-3 flex gap-1.5" role="tablist">
          {([["sell", "현 상태 판매"], ["demolish", "철거 후 판매"], ["hold", "보유·리모델링"]] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={detail === k} onClick={() => setDetail(k)}
              className={`rounded-full px-4 py-2 text-[14px] font-bold ${detail === k ? "bg-ink text-white" : "bg-fill text-muted"}`}>{t}</button>
          ))}
        </div>
        <Card className="mt-3">
          {detail === "sell" && <SellDetail data={data} />}
          {detail === "demolish" && <DemolishDetail data={data} />}
          {detail === "hold" && <HoldDetail data={data} />}
        </Card>
      </section>

      <Programs data={data} />
      <Plan data={data} />

      <details className="rounded-2xl ring-1 ring-line p-5">
        <summary className="cursor-pointer font-bold">공공 기본정보·대상 점검·확인할 사항</summary>
        <div className="mt-4 space-y-5">
          <PublicInfo lookup={{ ...data.public, address: data.address, pnu: data.pnu, checks: data.checks, mode: data.mode,
            houseTrades: data.tradeStatus.houseTrades, landTrades: data.tradeStatus.landTrades } as never} />
          <div>
            <h3 className="font-bold">추가 확인사항</h3>
            <ul className="mt-1 list-disc pl-5 text-[14px] text-muted">{data.eligibility.confirmations.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="mt-2 text-[12px] text-subtle">{data.eligibility.notice}</p>
          </div>
        </div>
      </details>
    </div>
  );
}

function SaveBanner({ state, user, analysisId, onChange }: { state: string | null; user: User | null; analysisId: string; onChange: (s: string | null) => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  if (!user) return <Notice>지금 결과는 이 브라우저 세션에서만 볼 수 있어요. <Link href={`/login?next=/analyses/${analysisId}`} className="font-bold text-brand-strong">로그인</Link>하면 관심자산으로 저장하고 지원사업 알림을 받을 수 있어요.</Notice>;
  if (!state) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#e8f8f0] p-4 text-[14px] text-good">
      <span>{msg ?? (state === "new" ? "관심자산에 자동 저장했어요." : "이미 저장된 관심자산이에요(중복 저장하지 않았어요).")}</span>
      {!msg && (
        <span className="flex gap-3">
          <button className="font-bold underline" onClick={async () => {
            try {
              const list = await api<{ assets: { id: string; analysis_id: string }[] }>("/api/assets");
              const it = list.assets.find((x) => x.analysis_id === analysisId);
              if (it) await api(`/api/assets/${it.id}`, { method: "DELETE" });
              setMsg("저장을 취소했어요.");
            } catch (e) { setMsg(`저장 취소 실패: ${(e as Error).message}`); }
          }}>저장 취소</button>
          <button className="font-bold underline" onClick={() => onChange(null)}>닫기</button>
        </span>
      )}
    </div>
  );
}

function ActionBar({ data, withSupport, setWithSupport }: { data: Analysis; withSupport: boolean; setWithSupport: (v: boolean) => void }) {
  return (
    <nav aria-label="결과 화면 동작" className="flex flex-wrap gap-2">
      <a href="#answers" className="rounded-full bg-ink px-4 py-2 text-[14px] font-bold text-white">질문 답 수정</a>
      <a href="#inputs" className="rounded-full bg-ink px-4 py-2 text-[14px] font-bold text-white">가격·견적 입력</a>
      <button disabled={!data.result.calc?.withSupport} onClick={() => setWithSupport(!withSupport)}
        className="rounded-full bg-fill px-4 py-2 text-[14px] font-bold text-ink disabled:text-subtle">
        다른 경우 보기: {withSupport ? "지원금 미반영" : "확인된 지원 반영"}
      </button>
      <a href="#plan" className="rounded-full bg-fill px-4 py-2 text-[14px] font-bold text-ink">상담·플랜</a>
      <Link href="/" className="rounded-full bg-fill px-4 py-2 text-[14px] font-bold text-ink">종료</Link>
    </nav>
  );
}

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
  const rows: [string, React.ReactNode, React.ReactNode][] = [
    ["판매가격", <>{w(b.H)} <ProvenanceBadge p={r.calc!.priceBasis.H ?? "unknown"} /></>, <>{w(b.L)} <ProvenanceBadge p={r.calc!.priceBasis.L ?? "unknown"} /></>],
    ["철거비", "—", r.calc!.demolitionKnown ? <>{w(b.D)} <ProvenanceBadge p={r.demolition.basis === "quote" ? "consult" : "assumption"} /></> : <span className="text-bad">미확인</span>],
    ["중개보수", w(b.M_H), w(b.M_L)],
    ["기타 처리비용", <>{r.costs.C_H.missing.length === 5 ? <span className="text-bad">미확인</span> : w(b.C_H)}{r.costs.C_H.missing.length > 0 && <span className="block text-[11px] text-warn">미반영: {r.costs.C_H.missing.join(", ")}</span>}</>,
      <>{r.costs.C_L.missing.length === 5 ? <span className="text-bad">미확인</span> : w(b.C_L)}{r.costs.C_L.missing.length > 0 && <span className="block text-[11px] text-warn">미반영: {r.costs.C_L.missing.join(", ")}</span>}</>],
    ["확인된 지원", "—", b.G ? w(b.G) : "0원(미반영)"],
  ];
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-line">
      <table className="tabular w-full min-w-[520px] text-[14px]">
        <caption className="sr-only">현 상태 판매와 철거 후 토지 판매 비교</caption>
        <thead><tr className="bg-fill text-left text-[13px]"><th className="p-3">항목</th><th className="p-3">현 상태 판매</th><th className="p-3">철거 후 토지 판매</th></tr></thead>
        <tbody>
          {rows.map(([k, a, c]) => <tr key={k} className="border-t border-line"><th scope="row" className="p-3 text-left font-semibold">{k}</th><td className="p-3">{a}</td><td className="p-3">{c}</td></tr>)}
          <tr className="border-t-2 border-ink/20 bg-brand-soft/50 font-extrabold">
            <th scope="row" className="p-3 text-left">비용 차감 예상 회수액</th>
            <td className="p-3">{w(b.N_H)}<span className="block text-[11px] font-normal text-subtle">범위 {pair(cmp.ranges.N_H)}</span></td>
            <td className="p-3">{r.calc!.demolitionKnown ? <>{w(b.N_L)}<span className="block text-[11px] font-normal text-subtle">범위 {pair(cmp.ranges.N_L)}</span></> : <span className="text-bad">철거비 미확인</span>}</td>
          </tr>
          {r.calc!.demolitionKnown && <tr className="border-t border-line"><th scope="row" className="p-3 text-left">차이(철거 후 − 현 상태)</th><td colSpan={2} className="p-3 font-bold">{formatWon(b.delta, { signed: true })}{cmp.overlap && <span className="ml-2 text-[12px] font-normal text-warn">두 범위가 겹쳐요</span>}</td></tr>}
        </tbody>
      </table>
      <div className="p-3">
        <Explain title="계산식·출처·제외 비용">
          <p>현 상태 회수액 = 판매가격 − 중개보수 − 기타 처리비용</p>
          <p>철거 후 회수액 = 토지 판매가격 − 철거비 − 중개보수 − 기타 처리비용 + 확인된 지원</p>
          <p>중개보수: {r.brokerageRule.name}({r.brokerageRule.effective} 시행, 버전 {r.brokerageRule.version}). {r.brokerageRule.note}</p>
          <p>제외: 과거 취득비용, 대출·보증금 정산, 개인별 세금(입력하지 않은 경우). 대출 정산 후 최종 실수령액이 아니에요.</p>
          {r.support.excluded.map((x) => <p key={x}>지원 제외: {x}</p>)}
        </Explain>
      </div>
    </div>
  );
}

function Breakeven({ cmp, known, costsComplete }: { cmp: Compare; known: boolean; costsComplete: boolean }) {
  const b = cmp.base;
  return (
    <section className="grid gap-3 sm:grid-cols-2" aria-label="손익분기점">
      <Card>
        <p className="text-[13px] font-bold text-subtle">추가비용 기준</p>
        <p className="tabular mt-1 text-[24px] font-extrabold">{formatWon(b.K)}</p>
        <p className="text-[13px] text-muted">토지 가격이 현 상태 가격보다 이만큼 높아요(중개보수 차이 반영). 다른 비용과 지원금을 확인하기 전 기준이며 철거비만의 상한은 아니에요.</p>
        <Explain title="K 상세"><p>K = L − H − (M_L − M_H)</p><p>= {formatWon(b.L)} − {formatWon(b.H)} − ({formatWon(b.M_L)} − {formatWon(b.M_H)})</p></Explain>
      </Card>
      <Card>
        <p className="text-[13px] font-bold text-subtle">철거비 손익분기점</p>
        <p className={`tabular mt-1 text-[24px] font-extrabold ${b.D_star < 0 ? "text-bad" : ""}`}>{formatWon(b.D_star)}</p>
        <p className="text-[13px] text-muted">
          {b.D_star < 0 ? "음수예요. 이 가정에서는 철거비가 0원이어도 철거 후 판매가 우세하지 않아요."
            : `철거 총비용이 이 금액보다 적으면 철거 후 판매가 유리해요(다른 입력이 고정된 경우).`}
          {known && ` 지금 철거비는 ${formatWon(b.D)}이에요.`}
        </p>
        {!costsComplete && <p className="mt-1 text-[12px] text-warn">기타 처리비용(세금·보유관리비 등)에 미확인 항목이 있어 그 항목을 빼고 계산한 참고값이에요.</p>}
        <Explain title="D* 상세"><p>D* = K − (C_L − C_H) + G</p><p>= {formatWon(b.K)} − ({formatWon(b.C_L)} − {formatWon(b.C_H)}) + {formatWon(b.G)}</p><p>검증: 차이 = D* − D</p></Explain>
      </Card>
    </section>
  );
}

function Sensitivity({ cmp, pct }: { cmp: Compare; pct: number }) {
  return (
    <details className="rounded-2xl ring-1 ring-line p-5">
      <summary className="cursor-pointer font-bold">±{pct * 100}% 점검 8가지 — {cmp.consistentWinner && cmp.consistentWinner !== "mixed" ? `모두 ${OPTION_LABEL[cmp.consistentWinner]} 우세` : "점검마다 결과가 달라요"}</summary>
      <p className="mt-2 text-[12px] text-subtle">가격·철거비를 ±{pct * 100}% 바꿔 본 개발 점검 가정이에요. 실제 가격 오차 확률이 아니에요.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="tabular w-full min-w-[480px] text-[13px]">
          <thead><tr className="text-left text-subtle"><th className="py-1">현 상태 가격</th><th>토지 가격</th><th>철거비</th><th>차이 범위</th><th>우세</th></tr></thead>
          <tbody>{cmp.sensitivity.map((s, i) => (
            <tr key={i} className="border-t border-line"><td className="py-1">×{s.H}</td><td>×{s.L}</td><td>×{s.D}</td><td>{formatWon(s.deltaMin, { signed: true })} ~ {formatWon(s.deltaMax, { signed: true })}</td><td>{OPTION_LABEL[s.winner] ?? s.winner}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

function RefCard({ r }: { r: Reference }) {
  return (
    <Card>
      <p className="text-[13px] font-bold text-subtle">{r.label} 참고가격</p>
      <p className="tabular mt-1 text-[22px] font-extrabold">{r.value == null ? "산정 보류" : formatWon(r.value)}</p>
      <p className="text-[12px] text-subtle">{r.status === "median" ? `${r.sampleSize}건 단가 중앙값` : r.status === "single" ? "단일 사례 환산값" : "자료 부족"}
        {r.range && ` · 관측 범위 ${formatWon(r.range.min)} ~ ${formatWon(r.range.max)}`}</p>
      {r.notes.map((n) => <p key={n} className="mt-1 text-[12px] text-warn">{n}</p>)}
      {r.extended && <p className="mt-1 text-[12px] text-muted">{r.extended.note}: {r.extended.sampleSize}건 · {formatWon(r.extended.value)}</p>}
      {r.decisions.length > 0 && (
        <Explain title={`사례 ${r.decisions.length}건 선정·제외 사유`}>
          <ul className="space-y-1">{r.decisions.map((d, i) => (
            <li key={i} className={d.included ? "text-ink" : ""}>{d.trade.dealDate} {d.trade.umdNm} {d.trade.jibunMasked} · {d.trade.landArea}㎡ · {formatWon(d.trade.amountWon)} — {d.included ? "사용" : `제외: ${d.reason}`}</li>
          ))}</ul>
          <p>공개 지번이 일부 가려져 있어 대상 필지와 연결하지 않아요.</p>
        </Explain>
      )}
    </Card>
  );
}

function SellDetail({ data }: { data: Analysis }) {
  const H = data.inputs.H as { kind?: string; source?: string; checkedOn?: string } | undefined;
  return (
    <div className="space-y-2 text-[14px]">
      <p className="font-bold">현 상태 그대로 건물과 토지를 함께 파는 방법</p>
      <p>가격 근거: {H?.kind ? `${KIND_LABEL[H.kind]}${H.source ? ` · ${H.source}` : ""}${H.checkedOn ? ` · ${H.checkedOn}` : ""}` : "미입력"}</p>
      <p className="text-muted">철거 자금 확인이 필요 없어요. 공인중개사에게 현 상태 일괄 매각가격과 예상 기간을 물어보세요.</p>
      <p className="text-muted">상담: 인근 공인중개사(공개 연락처). 링크를 눌러도 주소·응답·금액은 전송되지 않아요.</p>
    </div>
  );
}

function DemolishDetail({ data }: { data: Analysis }) {
  const d = data.result.demolition;
  return (
    <div className="space-y-2 text-[14px]">
      <p className="font-bold">철거한 뒤 토지만 파는 방법</p>
      <p>철거비 근거: {d.basis === "quote" ? "실제 견적" : d.basis === "assumption" ? "사용자 가정 시뮬레이션" : "미확인"} {d.note && `· ${d.note}`}</p>
      {d.problems.map((p) => <p key={p} className="text-warn">· {p}</p>)}
      <p className="text-muted">철거비를 먼저 내야 해요. 사후 지급 지원금은 철거 전에 쓸 수 없어요.</p>
      {data.answers.access === "none" && <Notice tone="warn">차량 진입 불가: 현장 작업 가능 여부와 대안(소형 장비·인력 철거)을 먼저 확인해야 해요.</Notice>}
    </div>
  );
}

function HoldDetail({ data }: { data: Analysis }) {
  const h = data.holding, rm = data.remodel;
  return (
    <div className="space-y-3 text-[14px]">
      <p className="font-bold">보유하는 경우 비용</p>
      {h.totals ? (
        <ul>{Object.entries(h.totals).map(([y, p]) => <li key={y}>{y}년 보유 시 입력 비용 합계: {pair(p)}</li>)}</ul>
      ) : <p className="text-muted">보유 비용을 입력하면 기간별 합계를 보여줘요.</p>}
      {h.unreflected.length > 0 && <p className="text-warn">미반영: {h.unreflected.join(", ")}</p>}
      <p className="text-[12px] text-subtle">{h.note}</p>
      <p className="pt-2 font-bold">리모델링 후 매각(확장 옵션)</p>
      {rm.enabled ? <p>비용 차감 예상 회수액 {w(rm.N_R)} (범위 {pair(rm.range)})</p> : <p className="text-muted">계산하려면: {rm.need?.join(", ")}. {rm.note}</p>}
    </div>
  );
}

function Programs({ data }: { data: Analysis }) {
  return (
    <section aria-labelledby="prog">
      <h2 id="prog" className="text-[20px] font-extrabold">지원사업 후보</h2>
      <p className="mt-1 text-[13px] text-subtle">공식 공고를 주 1회 정리한 자료예요(실시간 아님). 후보는 지원 확정이 아니며, 확인된 금액만 &lsquo;확인된 지원 반영&rsquo;에 들어가요.</p>
      {data.programs.length === 0 && <NoPrograms sgg={data.address.sggNm} />}
      <div className="mt-3 space-y-3">
        {data.programs.map((p) => (
          <Card key={p.programId}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-extrabold">{p.title}{p.isSample && <span className="ml-1 rounded bg-sample-soft px-1.5 text-[11px] text-sample">예시</span>}</p>
                <p className="text-[13px] text-subtle">{p.agency} · 신청 {p.status}{p.reviewState === "changing" && " · 변경 확인 중"}</p>
              </div>
              <Pill tone={p.result === "partial_match" ? "blue" : p.result === "needs_check" ? "orange" : "gray"}>{MATCH_LABEL[p.result]}</Pill>
            </div>
            <ul className="mt-2 space-y-1 text-[13px]">
              {p.items.map((i) => <li key={i.label} className={i.status === "fail" ? "text-bad" : i.status === "pass" ? "text-good" : "text-muted"}>· {i.label}: {i.detail}</li>)}
            </ul>
            <p className="mt-2 text-[13px] text-muted">
              {p.benefitType === "cash" ? "현금 보조" : p.benefitType === "direct" ? "지자체 직접 수행" : p.benefitType === "tax" ? "세제 혜택" : "지원 방식 미확인"}
              {p.benefitCap != null && ` · 공고상 최대 ${formatWon(p.benefitCap)}(개인 확정액 아님)`}
              {p.paymentTiming === "post" && " · 사후 지급"}{p.saleCompatible === false && " · 즉시 매각과 양립 안 됨"}
            </p>
            <p className="mt-1 text-[12px] text-subtle">마지막 정상 수집 {p.lastSuccessFetchAt ? new Date(p.lastSuccessFetchAt).toLocaleDateString("ko-KR") : "미상"}{p.contact && ` · 문의 ${p.contact}`}</p>
            {!p.isSample && <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] font-bold text-brand-strong">공고 원문 보기 ↗</a>}
          </Card>
        ))}
      </div>
    </section>
  );
}

function Plan({ data }: { data: Analysis }) {
  const tone = { done: "bg-good text-white", todo: "bg-fill text-muted", blocked: "bg-bad text-white" };
  return (
    <section id="plan" aria-labelledby="plan-h">
      <h2 className="text-[24px] font-extrabold leading-tight">어떤 업체가<br />필요하세요?</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          ["중개 업체", "공인중개사 가격 상담", "#inputs"],
          ["철거 진행하기", "철거 맞춤 플랜", "#plan-h"],
          ["리모델링 업체", "보유·리모델링 비용", "#inputs"],
        ].map(([k, t, href]) => (
          <li key={t}>
            <a href={href} className="block rounded-lg bg-surface px-4 py-3 shadow-sm ring-1 ring-ink/70 transition hover:ring-2 hover:ring-brand">
              <span className="block text-[11px] text-subtle">{k}</span>
              <span className="block text-[15px] font-extrabold">{t}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-subtle">제휴 업체는 없어요. 어디에 무엇을 물어볼지 정리해 드려요.</p>
      <h2 id="plan-h" className="mt-8 text-[20px] font-extrabold">맞춤형 철거 플랜</h2>
      <p className="mt-1 text-[13px] text-subtle">업체에 연락하기 전에 이 순서로 확인하세요. 최종 선택과 실행은 직접 결정해요. 제휴 업체는 없어요.</p>
      <ol className="mt-3 space-y-2">
        {data.plan.map((s) => (
          <li key={s.no} className="flex gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${tone[s.status]}`}>{s.status === "done" ? "✓" : s.no}</span>
            <span><span className="block font-bold">{s.title}</span><span className="block text-[13px] text-muted">{s.detail}</span>
              {s.contact && <span className="block text-[12px] text-subtle">상담: {s.contact}</span>}</span>
          </li>
        ))}
      </ol>
      {data.eligibility.contacts.length > 0 && <p className="mt-2 text-[13px] text-muted">먼저 필요한 상담: {data.eligibility.contacts.join(", ")}</p>}
      <div className="mt-4 flex gap-2"><Link href="/"><Button variant="secondary">분석 종료</Button></Link></div>
    </section>
  );
}

function NoPrograms({ sgg }: { sgg?: string | null }) {
  const site = sgg ? BUSAN_GU_SITES[sgg] : undefined;
  return (
    <div className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line">
      <p className="text-[16px] font-extrabold">아직 확인된 지원사업 공고가 없어요</p>
      <p className="mt-1 text-[14px] text-muted">
        부산시·정부24는 매주 자동으로 확인하고 있어요. 빈집 철거·정비 지원은 보통 <b>구·군청</b>이 해마다 따로 공고해서, 직접 확인하는 게 가장 빨라요.
      </p>
      <ol className="mt-3 space-y-1.5 text-[14px]">
        <li>1. {sgg ?? "해당 구·군"}청 홈페이지 &lsquo;고시공고&rsquo;나 &lsquo;새소식&rsquo;에서 <b>빈집</b>으로 검색</li>
        <li>2. 없으면 구청 <b>건축과(빈집 담당)</b>에 올해 빈집 정비 지원 계획을 문의</li>
        <li>3. 번호를 모르면 부산시 120 바로콜센터(051-120)로 담당 부서 연결 요청</li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        {site && <a href={site} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand px-4 py-2 text-[14px] font-bold text-white">{sgg}청 홈페이지 열기</a>}
        <a href="tel:051120" className="rounded-lg bg-fill px-4 py-2 text-[14px] font-bold">051-120 전화</a>
      </div>
      <p className="mt-3 text-[12px] text-subtle">공고를 찾으면 &lsquo;지원금&rsquo; 칸에 확인된 금액을 넣어 &lsquo;확인된 지원 반영&rsquo; 결과를 볼 수 있어요.</p>
    </div>
  );
}
