"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { StoredAnalysis } from "@/lib/server/analyses";
import type { Overrides } from "@/lib/analysis/buildInput";
import type { OptionAnalysis } from "@/lib/engine/analyze";
import { SCENARIO_LABEL, type ScenarioKey } from "@/lib/engine/analyze";
import { FLOW_CATEGORY_LABEL, type FlowCategory } from "@/lib/engine/cashflow";
import { VERDICT_LABEL } from "@/lib/engine/recommend";
import { PURPOSE_LABEL, TIMING_LABEL, OCCUPANCY_LABEL, CONDITION_LABEL } from "@/lib/domain/types";
import { formatArea, formatMonths, formatWon } from "@/lib/domain/units";
import { Card, Notice, ProvenanceBadge, SampleBanner, Stat } from "./ui";
import { ConditionEditor } from "./ConditionEditor";
import { ConsultPanel } from "./ConsultPanel";

type Loaded = StoredAnalysis & { consultations: { id: string; option_id: string; partner_type: string; status: string; created_at: string }[] };

const solvedText = (s: OptionAnalysis["breakevenPrice"]) => (!s ? "해당 없음" : s.ok ? formatWon(s.value) : `산정 불가 — ${s.reason}`);

export function ResultView({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/analyses/${id}`)
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : setData(b)))
      .catch(() => setError("서버에 연결하지 못했습니다."));
  }, [id]);

  const recalc = useCallback(
    async (overrides: Overrides) => {
      setSaving(true);
      setError(null);
      try {
        const r = await fetch(`/api/analyses/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overrides }) });
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

  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <p className="text-sm text-muted" aria-live="polite">결과를 불러오는 중…</p>;

  const { result, built, lookup, answers } = data;
  const rec = result.recommendation;
  const sell = result.options.find((o) => o.id === "sell_as_is")!;
  const verdictTone = rec.verdict === "recommend" ? "border-brand bg-brand-soft" : rec.verdict === "needs_quotes" ? "border-warn bg-warn-soft" : "border-bad bg-bad-soft";

  return (
    <div className="space-y-6">
      {data.mode === "sample" && <SampleBanner />}
      <div>
        <p className="text-xs text-muted">분석 결과 · {new Date(data.updatedAt).toLocaleString("ko-KR")}</p>
        <h1 className="text-xl font-bold">{lookup.address.roadAddr}</h1>
        <p className="text-sm text-muted">
          {PURPOSE_LABEL[answers.purpose]} · {TIMING_LABEL[answers.timing]} · {OCCUPANCY_LABEL[answers.occupancy]} · 상태 {CONDITION_LABEL[answers.condition]}
        </p>
      </div>

      <section className={`rounded-xl border-2 p-5 ${verdictTone}`} aria-labelledby="verdict">
        <p className="text-xs font-bold uppercase tracking-wide">{VERDICT_LABEL[rec.verdict]}{rec.strength ? ` · 추천 강도 ${rec.strength === "strong" ? "높음" : rec.strength === "moderate" ? "보통" : "낮음"}` : ""}</p>
        <h2 id="verdict" className="mt-1 text-lg font-bold text-ink">{rec.headline}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">{rec.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        {rec.cautions.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-muted">{rec.cautions.map((c) => <li key={c}>· {c}</li>)}</ul>
        )}
      </section>

      {result.globalPending.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="반영하지 못한 항목">
          {result.globalPending.map((p) => (
            <span key={p} className="rounded-full border border-warn bg-warn-soft px-3 py-1 text-xs text-warn">{p}</span>
          ))}
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <div className="p-5 pb-2">
          <h2 className="font-bold">선택지 비교</h2>
          <p className="text-xs text-muted">기준 시나리오. 비교가치 = 기간 내 월 순현금흐름 현재가치 + 기간 말 보유 순자산 현재가치({built.engineInput.horizonMonths}개월, 할인율 {(built.engineInput.discountRateAnnual * 100).toFixed(1)}%)</p>
        </div>
        <table className="tabular w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-y border-line bg-bg text-left text-xs text-muted">
              <th scope="col" className="p-3">항목</th>
              {result.options.map((o) => (
                <th key={o.id} scope="col" className={`p-3 ${rec.optionId === o.id ? "text-brand" : ""}`}>
                  {o.label}
                  {rec.optionId === o.id && <span className="ml-1 rounded bg-brand px-1 text-[10px] text-brand-ink">{rec.verdict === "recommend" ? "추천" : "선두"}</span>}
                  <span className="block font-normal">{o.variantLabel}</span>
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
        <p className="p-3 text-xs text-muted">보수적·낙관적 범위는 매각가·공사비·기간을 함께 바꾼 가정의 폭이며, 통계적으로 검증된 확률이 아닙니다. 업체 수수료·제휴 여부는 계산에 쓰이지 않습니다.</p>
      </Card>

      {error && <Notice tone="bad">{error}</Notice>}
      <ConditionEditor data={data} saving={saving} onApply={recalc} />

      <section className="space-y-3">
        <h2 className="font-bold">선택지별 계산 근거</h2>
        {result.options.map((o) => (
          <OptionDetail key={o.id} o={o} built={built} sellBase={sell} />
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

function TRow({ label, hint, cells }: { label: string; hint?: string; cells: React.ReactNode[] }) {
  return (
    <tr className="border-b border-line align-top">
      <th scope="row" className="p-3 text-left font-medium">
        {label}
        {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
      </th>
      {cells.map((c, i) => <td key={i} className="p-3">{c}</td>)}
    </tr>
  );
}

function rangeCell(o: OptionAnalysis) {
  const c = o.scenarios.conservative;
  const p = o.scenarios.optimistic;
  if (!c.computable || !p.computable) return o.computable ? <small className="text-muted">일부 시나리오 계산 불가</small> : "—";
  return <small>{formatWon(c.comparisonValue)} ~ {formatWon(p.comparisonValue)}</small>;
}

function checksCell(o: OptionAnalysis) {
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

function OptionDetail({ o, built }: { o: OptionAnalysis; built: StoredAnalysis["built"]; sellBase: OptionAnalysis }) {
  const b = o.scenarios.base;
  const byCat = new Map<FlowCategory, number>();
  for (const f of b.flows) byCat.set(f.category, (byCat.get(f.category) ?? 0) + f.amount);
  const costLines = o.id === "demolish_sell_land" ? built.demolition : o.id === "remodel" ? built.remodel : null;
  return (
    <details className="rounded-xl border border-line bg-surface p-4 open:pb-5">
      <summary className="cursor-pointer list-none">
        <span className="font-bold">{o.label}</span> <span className="text-sm text-muted">· {o.variantLabel}</span>
        <span className="float-right text-sm">{o.computable ? formatWon(b.comparisonValue) : <span className="text-bad">계산 보류</span>}</span>
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
              {(["conservative", "base", "optimistic"] as ScenarioKey[]).map((k) => (
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
                  <li key={k} className="flex justify-between gap-2 border-b border-line py-1"><span>{FLOW_CATEGORY_LABEL[k]}</span><span>{formatWon(v, { signed: true })}</span></li>
                ))}
              </ul>
            </div>
            {o.rentalPayback && (
              <p>임대 목적 회수기간(현상태 임대 대비 추가 순임대수입 기준): <strong>{o.rentalPayback.ok ? `${formatMonths(Math.ceil(o.rentalPayback.value))}` : `회수 불가 — ${o.rentalPayback.reason}`}</strong>
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

function SourcesPanel({ data }: { data: Loaded }) {
  const { built } = data;
  const groups = [...new Set(built.assumptions.map((a) => a.group))];
  return (
    <Card className="space-y-5">
      <h2 className="font-bold">출처 · 가정 · 비교 사례</h2>
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
    </Card>
  );
}

function CompsTable({ title, est, subjectArea }: { title: string; est: StoredAnalysis["built"]["comps"]; subjectArea: number | null }) {
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
