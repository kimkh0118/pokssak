"use client";

import { useState } from "react";
import { api, type Analysis, type Evidence } from "@/lib/api";
import { COST_PARTS, QUOTE_ITEMS } from "@/lib/labels";
import { AmountInput, Check, KindSelect, SimpleEvidence, SourceFields } from "./EvidenceInput";
import { Button, Card, Notice } from "./ui";

type Inputs = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const SECTIONS = ["가격 상담", "철거 견적", "기타 비용", "기간·자금", "지원금", "보유·리모델링"] as const;

export function InputsPanel({ data, onSaved }: { data: Analysis; onSaved: (a: Analysis) => void }) {
  const [inp, setInp] = useState<Inputs>(() => structuredClone(data.inputs) as Inputs);
  const [tab, setTab] = useState<(typeof SECTIONS)[number]>("가격 상담");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setInp((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api<Analysis>(`/api/analyses/${data.id}`, { method: "PUT", body: { inputs: inp } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4" >
      <div id="inputs">
        <h2 className="text-[20px] font-extrabold">상담·견적 정보 보완</h2>
        <p className="mt-1 text-[13px] text-subtle">입력한 상담 경로·금액은 기록일 뿐 전문가 검증이나 공적 인증이 아니에요. 금액은 만원 단위로 입력해요.</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold ${tab === s ? "bg-ink text-white" : "bg-fill text-muted"}`}>{s}</button>
        ))}
      </div>

      {tab === "가격 상담" && (
        <div className="space-y-5">
          <PriceForm title="현 상태 일괄 매각가격 (건물+토지)" kind="as_is" ev={inp.H} onChange={(e) => set("H", e)} />
          <PriceForm title="철거 완료 후 토지 매각가격" kind="land" ev={inp.L} onChange={(e) => set("L", e)} />
          <div className="rounded-xl bg-fill p-3 text-[13px] text-muted">
            중개보수는 공식 상한요율로 자동 계산해요. 실제 협의한 금액이 있으면 입력하세요.
            <SimpleEvidence id="mh" label="현 상태" ev={inp.M_H} onChange={(e) => set("M_H", e)} allowNone={false} />
            <SimpleEvidence id="ml" label="철거 후" ev={inp.M_L} onChange={(e) => set("M_L", e)} allowNone={false} />
          </div>
        </div>
      )}

      {tab === "철거 견적" && <DemolitionForm d={inp.D ?? {}} access={data.answers.access} onChange={(d) => set("D", d)} />}

      {tab === "기타 비용" && (
        <div className="grid gap-5 md:grid-cols-2">
          {(["C_H", "C_L"] as const).map((k) => (
            <fieldset key={k} className="rounded-xl ring-1 ring-line p-3">
              <legend className="px-1 font-bold">{k === "C_H" ? "현 상태 판매" : "철거 후 판매"} 기타 처리비용</legend>
              {Object.entries(COST_PARTS).map(([p, label]) => (
                <SimpleEvidence key={p} id={`${k}-${p}`} label={label} ev={inp[k]?.[p]} onChange={(e) => set(k, { ...(inp[k] ?? {}), [p]: e })} />
              ))}
              <p className="mt-1 text-[12px] text-subtle">철거비·중개보수와 겹치는 비용은 넣지 마세요. 해당 없는 항목은 &lsquo;적용 없음 확인&rsquo;을 고르세요(미확인과 달라요).</p>
            </fieldset>
          ))}
        </div>
      )}

      {tab === "기간·자금" && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <MonthField label="현 상태 판매 예상 처리 기간" ev={inp.period_H} onChange={(e) => set("period_H", e)} />
            <MonthField label="철거 후 판매 예상 처리 기간" ev={inp.period_L} onChange={(e) => set("period_L", e)} />
          </div>
          <fieldset className="rounded-xl ring-1 ring-line p-3">
            <legend className="px-1 font-bold">철거 선지출 자금</legend>
            <p className="text-[13px] text-subtle">철거 후 판매를 추천하려면 철거비를 먼저 낼 수 있는지 확인해야 해요. 현 상태 판매에는 필요 없어요.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[["yes", "마련 가능"], ["no", "어려움"], ["unknown", "모름"]].map(([v, t]) => (
                <button key={v} type="button" aria-pressed={inp.funding?.prefund === v} onClick={() => set("funding", { ...(inp.funding ?? {}), prefund: v })}
                  className={`rounded-full px-4 py-2 text-[14px] font-bold ${inp.funding?.prefund === v ? "bg-ink text-white" : "bg-fill text-muted"}`}>{t}</button>
              ))}
            </div>
            <label className="mt-3 block text-[14px]">선지출 가능 금액
              <AmountInput idPrefix="fund" ev={{ kind: "consult", value: inp.funding?.available ?? undefined }}
                onChange={(e) => set("funding", { ...(inp.funding ?? {}), available: e.value ?? null })} />
            </label>
          </fieldset>
        </div>
      )}

      {tab === "지원금" && <SupportsForm supports={inp.supports ?? []} onChange={(s) => set("supports", s)} />}

      {tab === "보유·리모델링" && (
        <div className="grid gap-5 md:grid-cols-2">
          <fieldset className="rounded-xl ring-1 ring-line p-3">
            <legend className="px-1 font-bold">보유 시 연간 비용</legend>
            {[["tax", "보유세"], ["management", "관리·수선비"], ["insurance", "보험료"], ["other", "기타"]].map(([k, t]) => (
              <SimpleEvidence key={k} id={`hold-${k}`} label={t} ev={inp.holding?.[k]} onChange={(e) => set("holding", { ...(inp.holding ?? {}), [k]: e })} />
            ))}
            <label className="mt-2 block text-[13px] text-subtle">활용 계획(직접 사용·임대 등)
              <textarea value={inp.holding?.plan ?? ""} onChange={(e) => set("holding", { ...(inp.holding ?? {}), plan: e.target.value })} rows={2} className="mt-1 block w-full rounded-xl bg-fill p-3 text-[14px]" />
            </label>
          </fieldset>
          <fieldset className="rounded-xl ring-1 ring-line p-3">
            <legend className="px-1 font-bold">리모델링 후 매각(확장 옵션)</legend>
            <p className="text-[12px] text-subtle">대상에 대한 수리 후 상담 가격·공사 견적·비용이 모두 있어야 계산해요.</p>
            <SimpleEvidence id="r-price" label="수리 후 가격" ev={inp.remodel?.priceAfter} onChange={(e) => set("remodel", { ...(inp.remodel ?? {}), priceAfter: e })} allowNone={false} />
            <SimpleEvidence id="r-quote" label="공사 견적" ev={inp.remodel?.quote} onChange={(e) => set("remodel", { ...(inp.remodel ?? {}), quote: e })} allowNone={false} />
            {Object.entries(COST_PARTS).map(([p, label]) => (
              <SimpleEvidence key={p} id={`r-${p}`} label={label} ev={inp.remodel?.costs?.[p]}
                onChange={(e) => set("remodel", { ...(inp.remodel ?? {}), costs: { ...(inp.remodel?.costs ?? {}), [p]: e } })} />
            ))}
          </fieldset>
        </div>
      )}

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "다시 계산하는 중…" : "저장하고 다시 계산"}</Button>
      </div>
    </Card>
  );
}

function PriceForm({ title, kind, ev, onChange }: { title: string; kind: "as_is" | "land"; ev?: Evidence; onChange: (e: Evidence) => void }) {
  const cur: Evidence = ev ?? { kind: "unknown", priceType: kind };
  const upd = (e: Evidence) => onChange({ ...e, priceType: kind });
  return (
    <fieldset className="space-y-2 rounded-xl ring-1 ring-line p-3">
      <legend className="px-1 font-bold">{title}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <KindSelect id={`k-${kind}`} value={cur.kind} onChange={(k) => upd({ ...cur, kind: k })} allow={["unknown", "consult", "assumption"]} />
        {cur.kind !== "unknown" && <AmountInput idPrefix={kind} ev={cur} onChange={upd} />}
      </div>
      {cur.kind === "consult" && (
        <>
          <SourceFields ev={cur} onChange={upd} />
          <Check checked={cur.scopeMatches} onChange={(v) => upd({ ...cur, scopeMatches: v })}>상담한 주소·건물·필지 범위가 이 대상과 같아요</Check>
          <Check checked={cur.siteConditionShared} onChange={(v) => upd({ ...cur, siteConditionShared: v })}>현장 상태와 차량 진입 조건을 상담 때 전달했어요</Check>
          <Check checked={cur.wishPrice} onChange={(v) => upd({ ...cur, wishPrice: v })}>근거 없는 희망가격이에요(추천 근거로 쓰지 않음)</Check>
        </>
      )}
      {cur.kind === "assumption" && <p className="text-[12px] text-warn">가정 값은 참고 계산에만 쓰고 추천 근거로 쓰지 않아요.</p>}
    </fieldset>
  );
}

function DemolitionForm({ d, access, onChange }: { d: any; access: string; onChange: (d: any) => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const q: Evidence = d.quote ?? { kind: "consult" };
  const sim = d.simulation ?? {};
  const setQ = (e: Evidence) => onChange({ ...d, quote: e });
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <fieldset className="space-y-2 rounded-xl ring-1 ring-line p-3">
        <legend className="px-1 font-bold">실제 견적(우선)</legend>
        <AmountInput idPrefix="dq" ev={q} onChange={setQ} />
        <SourceFields ev={q} onChange={setQ} sourceLabel="견적 업체·경로" />
        <p className="pt-1 text-[13px] font-semibold">견적에 포함됐나요?</p>
        {Object.entries(QUOTE_ITEMS).map(([k, label]) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
            <span>{label}</span>
            <select value={q.items?.[k] ?? "unknown"} onChange={(e) => setQ({ ...q, items: { ...(q.items ?? {}), [k]: e.target.value as "included" } })}
              className="h-9 rounded-lg bg-fill px-2 text-[13px] font-semibold">
              <option value="unknown">모름</option><option value="included">포함</option><option value="excluded">별도(미포함)</option><option value="excluded_na">해당 없음</option>
            </select>
          </div>
        ))}
        {access === "none" && <Check checked={q.siteWorkConfirmed} onChange={(v) => setQ({ ...q, siteWorkConfirmed: v })}>업체가 차량 진입 불가 조건에서 작업 가능하다고 확인했어요</Check>}
        <p className="text-[12px] text-subtle">견적에 장비·인력 할증이 이미 들어 있으면 따로 곱하지 않아요.</p>
        <button type="button" className="text-[13px] font-bold text-bad" onClick={() => onChange({ ...d, quote: undefined })}>견적 지우기</button>
      </fieldset>
      <fieldset className="space-y-2 rounded-xl ring-1 ring-line p-3">
        <legend className="px-1 font-bold">가정 시뮬레이션(견적 전 참고)</legend>
        <p className="text-[12px] text-warn">검증된 단가가 아니라 내가 넣는 가정이에요. 추천 근거로 쓰지 않아요.</p>
        <label className="block text-[14px]">평당 단가(원)
          <input inputMode="numeric" value={sim.unitPerPyeong ?? ""} onChange={(e) => onChange({ ...d, simulation: { ...sim, unitPerPyeong: e.target.value.replace(/\D/g, "") } })}
            className="mt-1 block h-11 w-40 rounded-xl bg-fill px-3 text-right text-[15px] font-semibold" />
        </label>
        <label className="block text-[14px]">좁은 진입로 할증 배율(예: 1.5)
          <input inputMode="decimal" value={sim.multiplier ?? ""} onChange={(e) => onChange({ ...d, simulation: { ...sim, multiplier: e.target.value } })}
            className="mt-1 block h-11 w-28 rounded-xl bg-fill px-3 text-right text-[15px] font-semibold" />
        </label>
        <label className="block text-[14px]">할증이 적용되는 공종 비중(0~1, 1=전체)
          <input inputMode="decimal" value={sim.multiplierShare ?? ""} onChange={(e) => onChange({ ...d, simulation: { ...sim, multiplierShare: e.target.value } })}
            className="mt-1 block h-11 w-28 rounded-xl bg-fill px-3 text-right text-[15px] font-semibold" />
        </label>
      </fieldset>
    </div>
  );
}

function MonthField({ label, ev, onChange }: { label: string; ev?: Evidence; onChange: (e: Evidence) => void }) {
  const cur: Evidence = ev ?? { kind: "unknown", unit: "개월" };
  return (
    <fieldset className="rounded-xl ring-1 ring-line p-3">
      <legend className="px-1 text-[14px] font-bold">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <KindSelect id={label} value={cur.kind} onChange={(k) => onChange({ ...cur, kind: k, unit: "개월" })} allow={["unknown", "consult", "assumption"]} />
        {cur.kind !== "unknown" && <AmountInput idPrefix={label} ev={cur} onChange={(e) => onChange({ ...e, unit: "개월" })} unit="개월" />}
      </div>
    </fieldset>
  );
}

// 빈집애·구청에서 확인받은 지원을 직접 입력(공고 최대액이 아니라 이 집에 확인된 금액만)
function SupportsForm({ supports, onChange }: { supports: any[]; onChange: (s: any[]) => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const put = (i: number, patch: object) => onChange(supports.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-subtle">빈집애나 구청에서 <b>이 집에 대해 확인받은 지원액</b>만 넣어요. 공고의 최대 지원액은 확정 금액이 아니에요. 기본 비교는 지원금 미반영이고, 넣은 금액은 &lsquo;확인된 지원 반영&rsquo; 결과에만 들어가요.</p>
      {supports.map((s, i) => (
        <fieldset key={i} className="space-y-2 rounded-xl ring-1 ring-line p-3">
          <legend className="sr-only">지원 {i + 1}</legend>
          <div className="flex gap-2">
            <input aria-label="지원 이름" placeholder="예: 남구 빈집 철거 지원" value={s.name ?? ""} onChange={(e) => put(i, { name: e.target.value })}
              className="h-10 flex-1 rounded-lg bg-fill px-3 text-[14px]" />
            <button type="button" onClick={() => onChange(supports.filter((_, j) => j !== i))} className="rounded-lg bg-fill px-3 text-[13px] font-bold">삭제</button>
          </div>
          <Check checked={s.confirmed} onChange={(v) => put(i, { confirmed: v })}>기관에서 이 집의 지원액을 확인받았어요</Check>
          {s.confirmed && (
            <>
              <AmountInput idPrefix={`g-${i}`} ev={{ kind: "consult", value: s.confirmedAmount }} onChange={(e) => put(i, { confirmedAmount: e.value })} />
              <div className="flex flex-wrap gap-3 text-[13px]">
                <label>방식 <select value={s.type ?? "cash"} onChange={(e) => put(i, { type: e.target.value })} className="rounded bg-fill px-2 py-1"><option value="cash">현금 보조</option><option value="direct">지자체 직접 철거</option><option value="tax">세제 혜택</option></select></label>
                <label>지급 <select value={s.payment ?? "post"} onChange={(e) => put(i, { payment: e.target.value })} className="rounded bg-fill px-2 py-1"><option value="post">철거 후 지급</option><option value="pre">철거 전 지급</option></select></label>
              </div>
              <Check checked={s.saleCompatible === true} onChange={(v) => put(i, { saleCompatible: v })}>철거 후 바로 팔아도 되는 지원이에요(공공활용 의무 없음)</Check>
              <Check checked={s.noDuplicationConfirmed} onChange={(v) => put(i, { noDuplicationConfirmed: v })}>다른 지원과 같이 받아도 된다고 확인했어요</Check>
            </>
          )}
        </fieldset>
      ))}
      <button type="button" onClick={() => onChange([...supports, { programId: `manual-${Date.now()}`, name: "", type: "cash" }])}
        className="rounded-lg bg-fill px-4 py-2 text-[14px] font-bold">+ 확인받은 지원 추가</button>
    </div>
  );
}
