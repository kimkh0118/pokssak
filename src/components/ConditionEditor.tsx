"use client";

import { useState } from "react";
import type { StoredAnalysis } from "@/lib/server/analyses";
import type { Overrides } from "@/lib/analysis/buildInput";
import type { Range } from "@/lib/domain/types";
import { manwonToWon, wonToManwon } from "@/lib/domain/units";
import { Button, Card } from "./ui";

type RangeKey = "asIsPrice" | "landPrice" | "remodelPrice" | "remodelRentMonthly" | "demolitionCost" | "remodelCost";
type Txt = { low: string; base: string; high: string };

const RANGE_FIELDS: { key: RangeKey; label: string; hint: string }[] = [
  { key: "asIsPrice", label: "현상태 매각가", hint: "중개사 의견·호가 확인 결과 등" },
  { key: "landPrice", label: "철거 후 토지 매각가", hint: "토지 거래 사례·전문가 의견이 있을 때" },
  { key: "remodelPrice", label: "리모델링 후 가치(매각가)", hint: "근거가 없으면 비워 두세요(계산 보류)" },
  { key: "remodelRentMonthly", label: "리모델링 후 월 임대료 합계", hint: "임대 목적일 때" },
  { key: "demolitionCost", label: "철거 실행비용 합계", hint: "견적서 금액(공사·폐기물·부대·예비비 포함)" },
  { key: "remodelCost", label: "리모델링 실행비용 합계", hint: "견적서 금액" },
];

const toTxt = (r: Range | null | undefined): Txt =>
  r ? { low: String(Math.round(wonToManwon(r.low))), base: String(Math.round(wonToManwon(r.base))), high: String(Math.round(wonToManwon(r.high))) } : { low: "", base: "", high: "" };

function toRange(t: Txt): Range | undefined {
  if (t.base.trim() === "") return undefined;
  const b = Number(t.base);
  const lo = t.low.trim() === "" ? b : Number(t.low);
  const hi = t.high.trim() === "" ? b : Number(t.high);
  if (![b, lo, hi].every(Number.isFinite)) return undefined;
  return { low: manwonToWon(Math.min(lo, b)), base: manwonToWon(b), high: manwonToWon(Math.max(hi, b)) };
}

const numOrUndef = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

export function ConditionEditor({ data, saving, onApply }: { data: StoredAnalysis; saving: boolean; onApply: (o: Overrides) => void }) {
  const ov = data.overrides;
  const ei = data.built.engineInput;
  const [ranges, setRanges] = useState<Record<RangeKey, Txt>>(() =>
    Object.fromEntries(RANGE_FIELDS.map((f) => [f.key, toTxt(ov[f.key] ?? null)])) as Record<RangeKey, Txt>,
  );
  const [horizon, setHorizon] = useState(String(ov.horizonMonths ?? ""));
  const [disc, setDisc] = useState(String(ov.discountRatePct ?? ""));
  const [growth, setGrowth] = useState(String(ov.priceGrowthPct ?? ""));
  const [replacement, setReplacement] = useState(ov.replacementHousingMonthly != null ? String(wonToManwon(ov.replacementHousingMonthly)) : "");
  const [holding, setHolding] = useState(ov.holdingCostMonthly != null ? String(wonToManwon(ov.holdingCostMonthly)) : "");
  const [taxA, setTaxA] = useState(ov.taxes?.asIsSale != null ? String(wonToManwon(ov.taxes.asIsSale)) : "");
  const [taxL, setTaxL] = useState(ov.taxes?.landSale != null ? String(wonToManwon(ov.taxes.landSale)) : "");
  const [taxR, setTaxR] = useState(ov.taxes?.remodelSale != null ? String(wonToManwon(ov.taxes.remodelSale)) : "");
  const [scope, setScope] = useState<"" | "partial" | "full">(ov.remodelScope ?? "");

  function apply() {
    const o: Overrides = {};
    for (const f of RANGE_FIELDS) {
      const r = toRange(ranges[f.key]);
      if (r) o[f.key] = r;
    }
    const h = numOrUndef(horizon);
    if (h !== undefined) o.horizonMonths = h;
    const d = numOrUndef(disc);
    if (d !== undefined) o.discountRatePct = d;
    const g = numOrUndef(growth);
    if (g !== undefined) o.priceGrowthPct = g;
    const rp = numOrUndef(replacement);
    if (rp !== undefined) o.replacementHousingMonthly = manwonToWon(rp);
    const hd = numOrUndef(holding);
    if (hd !== undefined) o.holdingCostMonthly = manwonToWon(hd);
    const ta = numOrUndef(taxA), tl = numOrUndef(taxL), tr = numOrUndef(taxR);
    if (ta !== undefined || tl !== undefined || tr !== undefined)
      o.taxes = { asIsSale: ta === undefined ? null : manwonToWon(ta), landSale: tl === undefined ? null : manwonToWon(tl), remodelSale: tr === undefined ? null : manwonToWon(tr) };
    if (scope) o.remodelScope = scope;
    onApply(o);
  }

  const cur = (k: RangeKey) => {
    const r = ei[k];
    return r ? `현재 ${Math.round(wonToManwon(r.base)).toLocaleString("ko-KR")}만원` : "현재 산정 보류";
  };
  const inputCls = "tabular w-24 rounded border border-line bg-surface px-2 py-1 text-right text-sm";

  return (
    <Card>
      <details>
        <summary className="cursor-pointer font-bold">계산 조건 수정 <span className="text-sm font-normal text-muted">— 견적·시세를 알면 입력해 더 정확하게 계산합니다</span></summary>
        <div className="mt-4 space-y-5 text-sm">
          <p className="text-xs text-muted">빈 칸은 기본 가정값을 씁니다. 금액 단위는 만원입니다. 기준값만 입력하면 범위도 같은 값으로 봅니다.</p>
          <div className="space-y-3">
            {RANGE_FIELDS.map((f) => (
              <fieldset key={f.key} className="flex flex-wrap items-center gap-2">
                <legend className="sr-only">{f.label}</legend>
                <span className="w-52 font-medium">{f.label}<span className="block text-xs font-normal text-muted">{f.hint} · {cur(f.key)}</span></span>
                {(["low", "base", "high"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1 text-xs text-muted">
                    {k === "low" ? "낮음" : k === "base" ? "기준" : "높음"}
                    <input
                      inputMode="numeric"
                      aria-label={`${f.label} ${k === "low" ? "낮은 값" : k === "base" ? "기준값" : "높은 값"}(만원)`}
                      className={inputCls}
                      value={ranges[f.key][k]}
                      onChange={(e) => setRanges((s) => ({ ...s, [f.key]: { ...s[f.key], [k]: e.target.value.replace(/[^\d.]/g, "") } }))}
                    />
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`공통 비교 기간(개월) · 현재 ${ei.horizonMonths}`} value={horizon} onChange={setHorizon} />
            <Field label={`연 할인율(%) · 현재 ${(ei.discountRateAnnual * 100).toFixed(1)}`} value={disc} onChange={setDisc} />
            <Field label={`연 가격변동률(%) · 현재 ${(ei.priceGrowthAnnual * 100).toFixed(1)}`} value={growth} onChange={setGrowth} allowNegative />
            <Field label={`월 대체·임시 주거비(만원) · 현재 ${ei.replacementHousingMonthly === null ? "미입력" : wonToManwon(ei.replacementHousingMonthly)}`} value={replacement} onChange={setReplacement} />
            <Field label={`월 보유비(만원) · 현재 ${wonToManwon(ei.holdingCostMonthly)}`} value={holding} onChange={setHolding} />
            <label className="space-y-1">
              <span className="block text-xs text-muted">리모델링 범위</span>
              <select value={scope} onChange={(e) => setScope(e.target.value as "" | "partial" | "full")} className="rounded border border-line bg-surface px-2 py-1 text-sm">
                <option value="">집 상태 답변에 따름</option>
                <option value="partial">부분 리모델링</option>
                <option value="full">전면 리모델링</option>
              </select>
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="font-medium">세금(직접 확인한 금액만, 만원)</legend>
            <p className="text-xs text-muted">비워 두면 &lsquo;세금 반영 전&rsquo;으로 표시합니다. 0을 입력하면 세금 0원으로 계산합니다.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="현상태 매각 시" value={taxA} onChange={setTaxA} />
              <Field label="토지 매각 시" value={taxL} onChange={setTaxL} />
              <Field label="리모델링 후 매각·처분 시" value={taxR} onChange={setTaxR} />
            </div>
          </fieldset>
          <Button onClick={apply} disabled={saving}>{saving ? "다시 계산 중…" : "이 조건으로 다시 계산"}</Button>
        </div>
      </details>
    </Card>
  );
}

function Field({ label, value, onChange, allowNegative }: { label: string; value: string; onChange: (v: string) => void; allowNegative?: boolean }) {
  return (
    <label className="space-y-1">
      <span className="block text-xs text-muted">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        placeholder="기본값"
        onChange={(e) => onChange(e.target.value.replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, ""))}
        className="tabular w-32 rounded border border-line bg-surface px-2 py-1 text-right text-sm"
      />
    </label>
  );
}
