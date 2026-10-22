"use client";

import type { Evidence, Kind } from "@/lib/api";

// 금액 입력은 만원 단위로 받고 원으로 저장한다. '미확인'·'0원'·'적용 없음'을 구분한다.
const toMan = (won?: number) => (won == null ? "" : String(Math.round(won / 10_000)));
const toWon = (man: string) => (man.trim() === "" ? undefined : Math.round(Number(man) * 10_000));
const field = "h-11 rounded-xl bg-fill px-3 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-brand";

export function KindSelect({ value, onChange, allow, id }: { value: Kind; onChange: (k: Kind) => void; allow: Kind[]; id: string }) {
  const label: Record<string, string> = { consult: "상담·견적 값", assumption: "내 가정(참고 계산용)", unknown: "미확인", none: "적용 없음 확인", public: "공공자료" };
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as Kind)} className={`${field} pr-8`}>
      {allow.map((k) => <option key={k} value={k}>{label[k]}</option>)}
    </select>
  );
}

/** 금액(만원) 단일값 또는 범위 */
export function AmountInput({ ev, onChange, unit = "만원", idPrefix }: { ev: Evidence; onChange: (e: Evidence) => void; unit?: string; idPrefix: string }) {
  const isRange = ev.min != null || ev.max != null;
  const conv = unit === "만원";
  const show = (v?: number) => (conv ? toMan(v) : v == null ? "" : String(v));
  const parse = (s: string) => (conv ? toWon(s) : s.trim() === "" ? undefined : Number(s));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isRange ? (
        <label className="flex items-center gap-1.5 text-[14px]">
          <span className="sr-only">금액</span>
          <input id={`${idPrefix}-v`} inputMode="numeric" value={show(ev.value)} onChange={(e) => onChange({ ...ev, value: parse(e.target.value.replace(/[^\d.]/g, "")) })}
            className={`${field} w-36 text-right tabular`} placeholder="값" />
          {unit}
        </label>
      ) : (
        <>
          <label className="flex items-center gap-1 text-[14px]">최소
            <input inputMode="numeric" value={show(ev.min)} onChange={(e) => onChange({ ...ev, min: parse(e.target.value.replace(/[^\d.]/g, "")) })} className={`${field} w-28 text-right tabular`} />
          </label>
          <label className="flex items-center gap-1 text-[14px]">최대
            <input inputMode="numeric" value={show(ev.max)} onChange={(e) => onChange({ ...ev, max: parse(e.target.value.replace(/[^\d.]/g, "")) })} className={`${field} w-28 text-right tabular`} />
          </label>
          <span className="text-[14px]">{unit}</span>
        </>
      )}
      <button type="button" className="text-[13px] font-bold text-brand-strong underline-offset-2 hover:underline"
        onClick={() => onChange(isRange ? { ...ev, value: ev.min ?? ev.max, min: undefined, max: undefined } : { ...ev, min: ev.value, max: ev.value, value: undefined })}>
        {isRange ? "단일값으로" : "범위로 입력"}
      </button>
    </div>
  );
}

/** 출처·확인일 */
export function SourceFields({ ev, onChange, sourceLabel = "상담 경로(예: ○○공인중개사, △△철거)" }: { ev: Evidence; onChange: (e: Evidence) => void; sourceLabel?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <label className="text-[13px] text-subtle">{sourceLabel}
        <input value={ev.source ?? ""} onChange={(e) => onChange({ ...ev, source: e.target.value })} className={`${field} mt-1 block w-full`} />
      </label>
      <label className="text-[13px] text-subtle">확인일
        <input type="date" value={ev.checkedOn ?? ""} onChange={(e) => onChange({ ...ev, checkedOn: e.target.value })} className={`${field} mt-1 block`} />
      </label>
    </div>
  );
}

export function Check({ checked, onChange, children }: { checked?: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-[14px]">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** 금액 근거 한 줄(비용 항목 등): 종류 선택 + 금액 */
export function SimpleEvidence({ id, label, ev, onChange, allowNone = true }: { id: string; label: string; ev?: Evidence; onChange: (e: Evidence) => void; allowNone?: boolean }) {
  const cur: Evidence = ev ?? { kind: "unknown" };
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5">
      <label htmlFor={id} className="w-24 text-[14px] font-semibold">{label}</label>
      <KindSelect id={id} value={cur.kind} onChange={(k) => onChange({ ...cur, kind: k })} allow={allowNone ? ["unknown", "consult", "assumption", "none"] : ["unknown", "consult", "assumption"]} />
      {(cur.kind === "consult" || cur.kind === "assumption") && <AmountInput idPrefix={id} ev={cur} onChange={onChange} />}
    </div>
  );
}
