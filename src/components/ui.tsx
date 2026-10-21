"use client";

import { useState, type ReactNode } from "react";
import type { MoneyInput, Provenance } from "@/lib/domain/types";
import { PROVENANCE_LABEL } from "@/lib/domain/types";
import { formatWon, manwonToWon, wonToManwon } from "@/lib/domain/units";
import { PROVIDER_ERROR_LABEL, type ProviderError } from "@/lib/domain/property";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</section>;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-brand text-brand-ink hover:opacity-90",
    secondary: "border border-line bg-surface text-ink hover:bg-bg",
    ghost: "text-brand hover:underline",
  }[variant];
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

const PROV_STYLE: Record<Provenance, string> = {
  public_api: "bg-brand-soft text-brand",
  user_input: "bg-bg text-ink border border-line",
  estimate: "bg-warn-soft text-warn",
  sample: "bg-sample-soft text-sample",
};

export function ProvenanceBadge({ p }: { p: Provenance }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${PROV_STYLE[p]}`}>{PROVENANCE_LABEL[p]}</span>;
}

export function SampleBanner() {
  return (
    <div role="status" className="sticky top-0 z-20 -mx-4 mb-4 border-y border-sample bg-sample-soft px-4 py-2 text-sm text-sample">
      <strong>예시 모드</strong> · 가상의 주소와 거래 사례로 만든 화면입니다. 실제 공공데이터 조회 결과가 아닙니다.
    </div>
  );
}

export function ProviderErrorBox({ error, title }: { error: ProviderError; title?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-bad bg-bad-soft p-3 text-sm text-bad">
      <p className="font-medium">
        {title ?? error.source} — {PROVIDER_ERROR_LABEL[error.kind]}
        {error.code ? ` (코드 ${error.code})` : ""}
      </p>
      <p className="mt-1">{error.message}</p>
      {error.kind === "not_configured" && <p className="mt-1">서버 환경변수에 인증키를 설정해야 합니다. README의 &lsquo;API 인증키 설정&rsquo;을 참고하세요.</p>}
      {error.kind === "rate_limit" && <p className="mt-1">잠시 후 다시 시도해 주세요.</p>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: ReactNode }) {
  const s = { info: "border-line bg-bg text-ink", warn: "border-warn bg-warn-soft text-warn", bad: "border-bad bg-bad-soft text-bad" }[tone];
  return <div className={`rounded-lg border p-3 text-sm ${s}`}>{children}</div>;
}

export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${value === o.value ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-bg"}`}
          >
            <input type="radio" name={name} className="mt-0.5 accent-[var(--brand)]" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              {o.label}
              {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 만원 단위 금액 입력 + "모름". 빈 칸은 미입력(0원 아님). */
export function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  allowNone,
}: {
  id: string;
  label: string;
  value: MoneyInput;
  onChange: (v: MoneyInput) => void;
  hint?: string;
  allowNone?: string; // 예: "대출 없음"
}) {
  const [text, setText] = useState(value.status === "known" ? String(wonToManwon(value.won)) : "");
  const unknown = value.status === "unknown";
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-line bg-surface focus-within:border-brand">
          <input
            id={id}
            inputMode="numeric"
            disabled={unknown}
            className="tabular w-36 rounded-lg bg-transparent px-3 py-2 text-right text-sm outline-none disabled:opacity-40"
            placeholder="미입력"
            value={value.status === "known" ? text : ""}
            onChange={(e) => {
              const t = e.target.value.replace(/[^\d.]/g, "");
              setText(t);
              if (t === "") onChange({ status: "unanswered" });
              else if (Number.isFinite(Number(t))) onChange({ status: "known", won: manwonToWon(Number(t)) });
            }}
          />
          <span className="pr-3 text-sm text-muted">만원</span>
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={unknown} onChange={(e) => onChange(e.target.checked ? { status: "unknown" } : { status: "unanswered" })} />
          모름
        </label>
        {allowNone && (
          <button
            type="button"
            className="text-sm text-brand underline-offset-2 hover:underline"
            onClick={() => {
              setText("0");
              onChange({ status: "known", won: 0 });
            }}
          >
            {allowNone}
          </button>
        )}
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {value.status === "known" ? `= ${formatWon(value.won)}` : value.status === "unknown" ? "모름으로 저장(0원으로 계산하지 않음)" : "미입력(0원으로 계산하지 않음)"}
        {hint ? ` · ${hint}` : ""}
      </p>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-1 text-base font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
