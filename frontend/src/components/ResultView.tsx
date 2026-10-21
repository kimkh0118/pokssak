"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Analysis, Answers, CompEstimate, OptionResult, Overrides } from "@/lib/api";
import { CONDITION_LABEL, DELAY_REASON_LABEL, FLOW_LABEL, OCCUPANCY_LABEL, PURPOSE_LABEL, SCENARIO_LABEL, TIMING_LABEL, VERDICT_LABEL } from "@/lib/labels";
import { formatArea, formatMonths, formatWon } from "@/lib/format";
import { Card, Notice, Pill, ProvenanceBadge, SampleBanner, Stat } from "./ui";
import { ConditionEditor } from "./ConditionEditor";
import { ConsultPanel } from "./ConsultPanel";
import { ShareButton } from "./ShareButton";
import { addHistory } from "@/lib/history";


const solvedText = (s: OptionResult["breakevenPrice"]) => (!s ? "해당 없음" : s.ok ? formatWon(s.value) : `산정 불가 — ${s.reason}`);

export function ResultView({ id }: { id: string }) {
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/analyses/${id}`)
      .then((r) => r.json())
      .then((b) => {
        if (b.error) return setError(b.error);
        setData(b);
        addHistory({ id: b.id, address: b.property.address.roadAddr, mode: b.mode });
      })
      .catch(() => setError("서버에 연결하지 못했습니다."));
  }, [id]);

  const recalc = useCallback(
    async (overrides: Overrides, answers?: Answers) => {
      setSaving(true);
      setError(null);
      try {
        const r = await fetch(`/api/analyses/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overrides, answers }) });
        const b = await r.json();
        if (b.error) setError(b.error);
        else setData(b);
      } catch {
        setError("서버에 연결하지 못했습니다.");
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  if (error && !data)
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <p className="text-[20px] font-extrabold">결과를 열 수 없어요</p>
        <p className="mt-2 text-[15px] text-muted">{error}</p>
        <Link href="/history" className="mt-6 inline-flex h-12 items-center rounded-xl bg-brand px-5 text-[15px] font-bold text-white">내 분석으로</Link>
      </div>
    );
  if (!data)
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">결과를 불러오는 중</span>
        <div className="h-6 w-40 animate-pulse rounded bg-fill" />
        <div className="h-8 w-3/4 animate-pulse rounded bg-fill" />
        <div className="h-64 animate-pulse rounded-3xl bg-fill" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-fill" />)}
        </div>
      </div>
    );

  const { result, current, property, answers } = data;
  const rec = result.recommendation;
  const top = result.options.find((o) => o.id === rec.optionId) ?? null;
  const heroTone = rec.verdict === "recommend" ? "bg-brand" : rec.verdict === "needs_quotes" ? "bg-ink" : "bg-[#2b2f3a]";
  const strength = rec.strength === "strong" ? "추천 강도 높음" : rec.strength === "moderate" ? "추천 강도 보통" : rec.strength === "weak" ? "추천 강도 낮음" : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {data.mode === "sample" && <SampleBanner />}
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-subtle">{new Date(data.updatedAt).toLocaleString("ko-KR")} 기준 분석</p>
          <ShareButton />
        </div>
        <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight">{property.address.roadAddr}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill>{PURPOSE_LABEL[answers.purpose]}</Pill>
          <Pill>상태: {CONDITION_LABEL[answers.condition]}</Pill>
          {answers.delayReason && <Pill>미룬 이유: {DELAY_REASON_LABEL[answers.delayReason]}</Pill>}
          <Pill>{TIMING_LABEL[answers.timing]}</Pill>
          <Pill>{answers.occupancy === "unknown" ? "사용 상황 미입력" : OCCUPANCY_LABEL[answers.occupancy]}</Pill>
        </div>
      </div>

      <section className={`rounded-3xl p-6 text-white ${heroTone}`} aria-labelledby="verdict">
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold">
          <span className="rounded-full bg-white/15 px-2.5 py-1">{VERDICT_LABEL[rec.verdict]}</span>
          {strength && <span className="text-white/70">{strength}</span>}
        </div>
        {top && top.computable ? (
          <>
            <p className="mt-4 text-[15px] font-semibold text-white/75">{rec.verdict === "recommend" ? "가장 유리한 선택" : "근소하게 앞선 선택"}</p>
            <h2 id="verdict" className="text-[28px] font-extrabold leading-tight tracking-tight">{top.variantLabel}</h2>
            <p className="tabular mt-3 text-[34px] font-extrabold leading-none tracking-tight">{formatWon(top.scenarios.base.comparisonValue)}</p>
            <p className="mt-1 text-[13px] text-white/70">비교가치 · {current.horizonMonths}개월 기준 현재가치</p>
          </>
        ) : (
          <h2 id="verdict" className="mt-4 text-[22px] font-extrabold leading-snug">{rec.headline}</h2>
        )}
        {top && top.computable && rec.verdict !== "recommend" && <p className="mt-4 text-[15px] font-semibold leading-relaxed">{rec.headline}</p>}
        <ul className="mt-4 space-y-1.5 border-t border-white/20 pt-4 text-[14px] leading-relaxed text-white/90">
          {rec.reasons.map((r) => (
            <li key={r} className="flex gap-2"><span aria-hidden>·</span><span>{r}</span></li>
          ))}
        </ul>
      </section>

      {(rec.cautions.length > 0 || result.globalPending.length > 0) && (
        <section className="space-y-3">
          {result.globalPending.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="반영하지 못한 항목">
              {result.globalPending.map((p) => <Pill key={p} tone="orange">{p}</Pill>)}
            </div>
          )}
          {rec.cautions.length > 0 && (
            <ul className="space-y-1.5 rounded-2xl bg-fill p-4 text-[14px] text-muted">
              {rec.cautions.map((c) => <li key={c}>· {c}</li>)}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="text-[20px] font-extrabold tracking-tight">선택지별로 보면</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {result.options.map((o) => <OptionCard key={o.id} o={o} isTop={rec.optionId === o.id} isRecommend={rec.verdict === "recommend"} />)}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl ring-1 ring-line">
        <div className="p-5 pb-3">
          <h2 className="text-[18px] font-extrabold">한눈에 표로 비교</h2>
          <p className="mt-1 text-[13px] text-subtle">기준 시나리오 · 비교가치 = 기간 내 월 순현금흐름 현재가치 + 기간 말 보유 순자산 현재가치 ({current.horizonMonths}개월, 할인율 {current.discountRatePct.toFixed(1)}%)</p>
        </div>
        <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[860px] text-[14px]">
          <thead>
            <tr className="bg-fill text-left text-[13px] text-subtle">
              <th scope="col" className="p-3 font-bold">항목</th>
              {result.options.map((o) => (
                <th key={o.id} scope="col" className={`p-3 font-bold ${rec.optionId === o.id ? "text-brand" : "text-ink"}`}>
                  {o.label}
                  {rec.optionId === o.id && <span className="ml-1 rounded bg-brand px-1.5 py-0.5 text-[10px] text-white">{rec.verdict === "recommend" ? "추천" : "선두"}</span>}
                  <span className="block font-normal text-subtle">{o.variantLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TRow label="비교가치(기준)" cells={result.options.map((o) => (o.computable ? <strong key={o.id}>{formatWon(o.scenarios.base.comparisonValue)}</strong> : <span key={o.id} className="text-bad">계산 보류</span>))} />
            <TRow label="추정 범위(보수~낙관)" cells={result.options.map((o) => rangeCell(o))} />
            <TRow label="기간 내 순현금 수지" hint="실제로 들어오고 나가는 돈(명목)" cells={result.options.map((o) => (o.computable ? formatWon(o.scenarios.base.netCash, { signed: true }) : "—"))} />
            <TRow label="기간 말 보유 순자산" hint="팔지 않은 집의 추정 가치 − 처분비용 − 대출 − 보증금. 현금 아님" cells={result.options.map((o) => (o.computable ? (o.scenarios.base.terminal ? formatWon(o.scenarios.base.terminal.net) : "없음(매각)") : "—"))} />
            <TRow label="현상태 매각 대비" cells={result.options.map((o) => (o.id === "sell_as_is" ? "기준" : o.vsSellAsIs === null ? "—" : <span key={o.id} className={o.vsSellAsIs >= 0 ? "text-brand" : "text-bad"}>{formatWon(o.vsSellAsIs, { signed: true })}</span>))} />
            <TRow label="최대 선투입 필요액" hint="누적 현금흐름의 가장 큰 부족액" cells={result.options.map((o) => (o.computable ? formatWon(o.scenarios.base.maxUpfront) : "—"))} />
            <TRow label="예상 소요 기간" cells={result.options.map((o) => (o.computable ? (o.id === "keep" ? "실행 없음" : formatMonths(o.scenarios.base.completionMonth)) : "—"))} />
            <TRow label="손익분기 매각가" hint="대안 비교가치 = 기준안" cells={result.options.map((o) => (o.breakevenPrice ? <small key={o.id}>{solvedText(o.breakevenPrice)}<br />{o.baselineLabel ? <span className="text-muted">기준안: {o.baselineLabel}</span> : null}</small> : "—"))} />
            <TRow label="최대 허용 공사비" cells={result.options.map((o) => (o.maxAllowableCost ? <small key={o.id}>{solvedText(o.maxAllowableCost)}</small> : "—"))} />
            <TRow label="목적·기간·예산" cells={result.options.map((o) => checksCell(o))} />
          </tbody>
        </table>
        </div>
        <p className="p-4 text-[12px] text-subtle">보수적·낙관적 범위는 매각가·공사비·기간을 함께 바꾼 가정의 폭이며, 통계적으로 검증된 확률이 아니에요. 업체 수수료·제휴 여부는 계산에 쓰이지 않아요.</p>
      </section>

      {error && <Notice tone="bad">{error}</Notice>}
      <ConditionEditor data={data} saving={saving} onApply={recalc} />

      <section className="space-y-3">
        <h2 className="text-[20px] font-extrabold tracking-tight">계산 근거 자세히 보기</h2>
        {result.options.map((o) => (
          <OptionDetail key={o.id} o={o} costs={data.costs} />
        ))}
      </section>

      <SourcesPanel data={data} />

      <ConsultPanel data={data} />

      <div className="flex gap-3 text-sm">
        <Link href={`/analyze?mode=${data.mode}`} className="text-brand hover:underline">다른 주소 분석하기</Link>
      </div>
    </div>
  );
}

function OptionCard({ o, isTop, isRecommend }: { o: OptionResult; isTop: boolean; isRecommend: boolean }) {
  const b = o.scenarios.base;
  return (
    <article className={`rounded-2xl p-5 ${isTop ? "bg-brand-soft ring-2 ring-brand" : "bg-fill"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[17px] font-extrabold">{o.label}</h3>
          <p className="text-[13px] text-subtle">{o.variantLabel}</p>
        </div>
        {isTop && <Pill tone="blue">{isRecommend ? "추천" : "선두"}</Pill>}
        {!isTop && o.checks.excludedReason && o.computable && <Pill tone="red">제외</Pill>}
      </div>
      {o.computable ? (
        <>
          <p className={`tabular mt-3 text-[24px] font-extrabold tracking-tight ${isTop ? "text-brand" : "text-ink"}`}>{formatWon(b.comparisonValue)}</p>
          <p className="text-[12px] text-subtle">
            {o.vsSellAsIs === null || o.id === "sell_as_is" ? "비교 기준" : <>현상태 매각 대비 <span className={o.vsSellAsIs >= 0 ? "font-bold text-brand" : "font-bold text-bad"}>{formatWon(o.vsSellAsIs, { signed: true })}</span></>}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-subtle">순현금 수지</dt><dd className="tabular text-right font-bold">{formatWon(b.netCash, { signed: true })}</dd>
            <dt className="text-subtle">보유 순자산</dt><dd className="tabular text-right font-bold">{b.terminal ? formatWon(b.terminal.net) : "없음(매각)"}</dd>
            <dt className="text-subtle">최대 선투입</dt><dd className={`tabular text-right font-bold ${o.checks.budget === "exceeds" ? "text-bad" : ""}`}>{formatWon(b.maxUpfront)}</dd>
            <dt className="text-subtle">소요 기간</dt><dd className="text-right font-bold">{o.id === "keep" ? "실행 없음" : formatMonths(b.completionMonth)}</dd>
          </dl>
          {o.checks.excludedReason && <p className="mt-3 text-[12px] font-semibold text-bad">{o.checks.excludedReason}</p>}
        </>
      ) : (
        <p className="mt-3 text-[14px] font-semibold text-warn">계산 보류 · {o.missing.join(" / ")}</p>
      )}
    </article>
  );
}

function TRow({ label, hint, cells }: { label: string; hint?: string; cells: React.ReactNode[] }) {
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="p-3 text-left font-bold">
        {label}
        {hint && <span className="block text-[12px] font-normal text-subtle">{hint}</span>}
      </th>
      {cells.map((c, i) => <td key={i} className="p-3">{c}</td>)}
    </tr>
  );
}

function rangeCell(o: OptionResult) {
  const c = o.scenarios.conservative;
  const p = o.scenarios.optimistic;
  if (!c.computable || !p.computable) return o.computable ? <small className="text-muted">일부 시나리오 계산 불가</small> : "—";
  return <small>{formatWon(c.comparisonValue)} ~ {formatWon(p.comparisonValue)}</small>;
}

function checksCell(o: OptionResult) {
  if (!o.computable) return <small className="text-bad">{o.missing.join(" / ")}</small>;
  const c = o.checks;
  const items = [
    c.purposeFit === "mismatch" ? ["목적 불일치", "text-bad"] : c.purposeFit === "partial" ? ["목적 부분 부합", "text-warn"] : ["목적 부합", "text-brand"],
    c.timing === "exceeds" ? ["희망 시점 초과", "text-bad"] : c.timing === "ok" ? ["기간 충족", "text-brand"] : null,
    c.budget === "exceeds" ? ["예산 초과", "text-bad"] : c.budget === "unknown" ? ["예산 확인 필요", "text-warn"] : ["예산 이내", "text-brand"],
  ].filter(Boolean) as string[][];
  return (
    <small className="space-y-0.5">
      {items.map(([t, cls]) => <span key={t} className={`block ${cls}`}>{t}</span>)}
    </small>
  );
}

function OptionDetail({ o, costs }: { o: OptionResult; costs: Analysis["costs"] }) {
  const b = o.scenarios.base;
  const byCat = new Map<string, number>();
  for (const f of b.flows) byCat.set(f.category, (byCat.get(f.category) ?? 0) + f.amount);
  const costLines = o.id === "demolish_sell_land" ? costs.demolition : o.id === "remodel" ? costs.remodel : null;
  return (
    <details className="rounded-2xl bg-fill/60 p-5 ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span><span className="text-[16px] font-extrabold">{o.label}</span> <span className="text-[13px] text-subtle">· {o.variantLabel}</span></span>
        <span className="tabular text-[15px] font-bold">{o.computable ? formatWon(b.comparisonValue) : <span className="text-bad">계산 보류</span>}</span>
      </summary>
      <div className="mt-4 space-y-4 text-sm">
        {!o.computable && <Notice tone="warn">{o.missing.join(" / ")}</Notice>}
        {o.remodelAlternatives && (
          <div>
            <h4 className="mb-1 font-medium">리모델링 활용 방식별</h4>
            <ul className="space-y-1">
              {o.remodelAlternatives.map((r) => (
                <li key={r.variant} className={r.variant === o.variant ? "font-medium" : "text-muted"}>
                  {r.label}: {r.computable ? formatWon(r.comparisonValue) : `계산 보류(${r.missing.join(", ")})`}{r.variant === o.variant ? " ← 표에 표시" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {o.computable && (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["conservative", "base", "optimistic"] as const).map((k) => (
                <Stat key={k} label={`${SCENARIO_LABEL[k]} 시나리오`} value={o.scenarios[k].computable ? formatWon(o.scenarios[k].comparisonValue) : "계산 불가"} sub={o.scenarios[k].computable ? `순현금 ${formatWon(o.scenarios[k].netCash, { signed: true })} · ${o.id === "keep" ? "실행 없음" : formatMonths(o.scenarios[k].completionMonth)}` : o.scenarios[k].missing.join(", ")} />
              ))}
            </div>
            {b.saleSettlement && (
              <div>
                <h4 className="mb-1 font-medium">{b.pending.length ? "예상 순수령액(아래 미반영 항목 반영 전)" : "예상 순수령액"}</h4>
                <dl className="tabular grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  <dt>매각대금({b.saleSettlement.month}개월 차)</dt><dd className="text-right">{formatWon(b.saleSettlement.price)}</dd>
                  <dt>− 철거·리모델링 실행비용</dt><dd className="text-right">{formatWon(-b.saleSettlement.executionCost)}</dd>
                  <dt>− 실행 기간 보유비·유지비·대출이자</dt><dd className="text-right">{formatWon(-b.saleSettlement.holdingAndFinance)}</dd>
                  <dt>− 중개·거래비용</dt><dd className="text-right">{formatWon(-b.saleSettlement.transaction)}</dd>
                  <dt>− 세금</dt><dd className="text-right">{b.saleSettlement.tax === null ? "세금 반영 전" : formatWon(-b.saleSettlement.tax)}</dd>
                  <dt>− 대출 잔액 정산</dt><dd className="text-right">{formatWon(-b.saleSettlement.loan)}</dd>
                  <dt>− 임차보증금 반환·정산</dt><dd className="text-right">{formatWon(-b.saleSettlement.deposit)}</dd>
                  <dt className="border-t border-line pt-1 font-bold">= 순수령액</dt><dd className="border-t border-line pt-1 text-right font-bold">{formatWon(b.saleSettlement.netProceeds)}</dd>
                </dl>
                <p className="mt-1 text-xs text-muted">기간 내 전체 순현금 수지(임대수입·대체 주거비 포함)는 {formatWon(b.netCash, { signed: true })}입니다.</p>
              </div>
            )}
            {b.terminal && (
              <div>
                <h4 className="mb-1 font-medium">기간 말 보유 순자산(현금 아님)</h4>
                <dl className="tabular grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  <dt>보유 부동산 추정 가치</dt><dd className="text-right">{formatWon(b.terminal.propertyValue)}</dd>
                  <dt>− 가정한 처분비용</dt><dd className="text-right">{formatWon(-b.terminal.disposalCost)}</dd>
                  <dt>− 세금</dt><dd className="text-right">{b.terminal.tax === null ? "세금 반영 전" : formatWon(-b.terminal.tax)}</dd>
                  <dt>− 남은 대출</dt><dd className="text-right">{formatWon(-b.terminal.loan)}</dd>
                  <dt>− 보증금 반환의무</dt><dd className="text-right">{formatWon(-b.terminal.deposit)}</dd>
                  <dt className="border-t border-line pt-1 font-bold">= 보유 순자산</dt><dd className="border-t border-line pt-1 text-right font-bold">{formatWon(b.terminal.net)}</dd>
                </dl>
              </div>
            )}
            <div>
              <h4 className="mb-1 font-medium">기간 내 현금흐름 항목별 합계</h4>
              <ul className="tabular grid gap-1 sm:grid-cols-2">
                {[...byCat.entries()].map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2 border-b border-line py-1"><span>{FLOW_LABEL[k] ?? k}</span><span>{formatWon(v, { signed: true })}</span></li>
                ))}
              </ul>
            </div>
            {o.rentalPayback && (
              <p>임대 목적 회수기간(현상태 임대 대비 추가 순임대수입 기준): <strong>{o.rentalPayback.ok ? `${formatMonths(Math.ceil(o.rentalPayback.value ?? 0))}` : `회수 불가 — ${o.rentalPayback.reason}`}</strong>
                {o.rentalPayback.extraMonthly !== undefined && <span className="text-muted"> (월 추가 순수입 {formatWon(o.rentalPayback.extraMonthly)})</span>}</p>
            )}
          </>
        )}
        {costLines && (
          <div>
            <h4 className="mb-1 font-medium">실행비용 내역(가정 단가 · 견적으로 대체 필요)</h4>
            {costLines.withheldReason && <Notice tone="warn">{costLines.withheldReason}</Notice>}
            <table className="tabular w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1">항목</th><th>근거</th><th className="text-right">기준(범위)</th></tr></thead>
              <tbody>
                {costLines.lines.map((l) => (
                  <tr key={l.key} className="border-t border-line align-top">
                    <td className="py-1 pr-2">{l.label}</td>
                    <td className="pr-2 text-muted">{l.basis}<br />{l.region} · {l.asOf}</td>
                    <td className="text-right">{formatWon(l.amount.base)}<br /><span className="text-muted">{formatWon(l.amount.low)}~{formatWon(l.amount.high)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-muted">공사 중 보유비·금융비용, 이주·임시거주비는 월별 현금흐름에서 따로 계산합니다.</p>
          </div>
        )}
        {o.pending.length > 0 && <p className="text-xs text-warn">반영하지 못한 항목: {o.pending.join(", ")}</p>}
        <div>
          <h4 className="mb-1 font-medium">확인 필요</h4>
          <ul className="list-disc pl-5 text-muted">{o.needsConfirmation.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      </div>
    </details>
  );
}

function SourcesPanel({ data: built }: { data: Analysis }) {
  const groups = [...new Set(built.assumptions.map((a) => a.group))];
  return (
    <Card className="space-y-5">
      <h2 className="text-[20px] font-extrabold tracking-tight">출처 · 가정 · 비교 사례</h2>
      <div>
        <h3 className="mb-1 text-sm font-medium">물건 기본 정보</h3>
        <table className="w-full text-sm">
          <tbody>
            {built.facts.map((f) => (
              <tr key={f.key} className="border-t border-line align-top">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-muted">{f.label}</th>
                <td className="py-1.5">
                  {f.value === null ? <span className="text-bad">정보 없음</span> : typeof f.value === "number" ? `${f.value.toLocaleString("ko-KR")}${f.unit ? ` ${f.unit}` : ""}` : f.value}{" "}
                  <ProvenanceBadge p={f.provenance} />
                  <span className="block text-xs text-muted">{f.source}{f.asOf ? ` · 기준일 ${f.asOf}` : ""}{f.fetchedAt ? ` · 조회 ${new Date(f.fetchedAt).toLocaleString("ko-KR")}` : ""}{f.note ? ` · ${f.note}` : ""}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groups.map((g) => (
        <div key={g}>
          <h3 className="mb-1 text-sm font-medium">{g}</h3>
          <table className="w-full text-sm">
            <tbody>
              {built.assumptions.filter((a) => a.group === g).map((a) => (
                <tr key={a.key} className="border-t border-line align-top">
                  <th scope="row" className="w-48 py-1.5 pr-2 text-left font-normal text-muted">{a.label}</th>
                  <td className="py-1.5">
                    {a.display} <ProvenanceBadge p={a.provenance} />
                    <span className="block text-xs text-muted">{a.source}{a.asOf ? ` · ${a.asOf}` : ""}{a.note ? ` · ${a.note}` : ""}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <CompsTable title="현상태 매각가 비교 사례" est={built.comps} subjectArea={built.subject.landArea} />
      <CompsTable title="토지 매각가 비교 사례" est={built.landComps} subjectArea={built.subject.landArea} />
      <CompsTable title="리모델링 후 가치 참고 사례(주변 신축급)" est={built.remodelComps} subjectArea={built.subject.landArea} />
    </Card>
  );
}

function CompsTable({ title, est, subjectArea }: { title: string; est: CompEstimate; subjectArea: number | null }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">{title} — {est.withheldReason ? "산정 보류" : `${est.sampleSize}건 사용`}</summary>
      <div className="mt-2 space-y-2 text-sm">
        {est.withheldReason && <Notice tone="warn">{est.withheldReason}</Notice>}
        <p className="text-xs text-muted">대상 토지 {formatArea(subjectArea)} · 지역·계약년월 단위 공개 자료로, 지번이 일부만 공개되어 대상 주소의 거래 이력과 연결하지 않습니다.</p>
        <ul className="list-disc pl-5 text-xs text-muted">{est.criteria.map((c) => <li key={c}>{c}</li>)}</ul>
        {est.pricePerLandSqm && <p className="text-xs">대지㎡당 가격: 25% {formatWon(est.pricePerLandSqm.low)} · 중앙값 {formatWon(est.pricePerLandSqm.base)} · 75% {formatWon(est.pricePerLandSqm.high)}</p>}
        {est.decisions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1">계약일</th><th>법정동·지번</th><th>대지/연면적(㎡)</th><th>건축년도</th><th className="text-right">거래금액</th><th className="pl-3">판단</th></tr></thead>
              <tbody>
                {est.decisions.map((d, i) => (
                  <tr key={i} className={`border-t border-line ${d.included ? "" : "text-muted"}`}>
                    <td className="py-1">{d.trade.dealDate}</td>
                    <td>{d.trade.umdNm} {d.trade.jibunPartial}</td>
                    <td>{d.trade.landArea ?? "-"} / {d.trade.floorArea ?? "-"}</td>
                    <td>{d.trade.buildYear ?? "-"}</td>
                    <td className="text-right">{formatWon(d.trade.amountWon)}</td>
                    <td className="pl-3">{d.included ? "✓ 사용" : `제외: ${d.reason}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
