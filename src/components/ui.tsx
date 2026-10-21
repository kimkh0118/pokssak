"use client";

import { useState, type ReactNode } from "react";
import type { MoneyInput, Provenance } from "@/lib/domain/types";
import { PROVENANCE_LABEL } from "@/lib/domain/types";
import { formatWon, manwonToWon, wonToManwon } from "@/lib/domain/units";
import { PROVIDER_ERROR_LABEL, type ProviderError } from "@/lib/domain/property";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-5 ring-1 ring-line ${className}`}>{children}</section>;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "dark"; size?: "md" | "lg" }) {
  const styles = {
    primary: "bg-brand text-brand-ink hover:bg-brand-strong",
    dark: "bg-ink text-white hover:opacity-90",
    secondary: "bg-fill text-ink hover:bg-fill-strong",
    ghost: "text-brand hover:underline",
  }[variant];
  const sizes = size === "lg" ? "min-h-14 rounded-xl px-5 text-[17px]" : "min-h-11 rounded-xl px-4 text-[15px]";
  return (
    <button
      className={`inline-flex items-center justify-center font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-fill-strong disabled:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${sizes} ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 화면 하단 고정 버튼 영역(모바일 앱처럼) */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl gap-2">{children}</div>
    </div>
  );
}

const PROV_STYLE: Record<Provenance, string> = {
  public_api: "bg-brand-soft text-brand",
  user_input: "bg-fill text-muted",
  estimate: "bg-warn-soft text-warn",
  sample: "bg-sample-soft text-sample",
};

export function ProvenanceBadge({ p }: { p: Provenance }) {
  return <span className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 align-middle text-[11px] font-bold ${PROV_STYLE[p]}`}>{PROVENANCE_LABEL[p]}</span>;
}

export function Pill({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "blue" | "red" | "orange" | "green" }) {
  const s = { gray: "bg-fill text-muted", blue: "bg-brand-soft text-brand", red: "bg-bad-soft text-bad", orange: "bg-warn-soft text-warn", green: "bg-[#e8f8f0] text-good" }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${s}`}>{children}</span>;
}

export function SampleBanner() {
  return (
    <div role="status" className="mb-5 flex items-center gap-2 rounded-xl bg-sample-soft px-4 py-3 text-[14px] text-sample">
      <span className="rounded-md bg-sample px-1.5 py-0.5 text-[11px] font-extrabold text-white">예시</span>
      <span>가상의 주소·거래 사례로 만든 화면이에요. 실제 공공데이터 조회 결과가 아닙니다.</span>
    </div>
  );
}

export function ProviderErrorBox({ error, title }: { error: ProviderError; title?: string }) {
  return (
    <div role="alert" className="rounded-xl bg-bad-soft p-4 text-[14px] text-bad">
      <p className="font-bold">
        {title ?? error.source} · {PROVIDER_ERROR_LABEL[error.kind]}
        {error.code ? ` (코드 ${error.code})` : ""}
      </p>
      <p className="mt-1 text-ink/80">{error.message}</p>
      {error.kind === "not_configured" && <p className="mt-1 text-ink/80">서버 환경변수에 인증키를 넣어야 해요. README의 &lsquo;API 인증키 설정&rsquo;을 참고하세요.</p>}
      {error.kind === "rate_limit" && <p className="mt-1 text-ink/80">잠시 후 다시 시도해 주세요.</p>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: ReactNode }) {
  const s = { info: "bg-fill text-muted", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad" }[tone];
  return <div className={`rounded-xl p-4 text-[14px] leading-relaxed ${s}`}>{children}</div>;
}

export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  columns = 1,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-[15px] font-bold text-ink">{legend}</legend>
      <div className={`grid gap-2 ${columns === 2 ? "grid-cols-2" : ""}`}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 text-[16px] font-semibold transition ${on ? "bg-brand-soft text-brand ring-2 ring-brand" : "bg-fill text-ink hover:bg-fill-strong"}`}
            >
              <span>
                {o.label}
                {o.hint && <span className="block text-[13px] font-normal text-subtle">{o.hint}</span>}
              </span>
              <input type="radio" name={name} className="sr-only" checked={on} onChange={() => onChange(o.value)} />
              <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] ${on ? "bg-brand text-white" : "bg-surface text-transparent ring-1 ring-line"}`}>✓</span>
            </label>
          );
        })}
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
  allowNone?: string;
}) {
  const [text, setText] = useState(value.status === "known" ? String(wonToManwon(value.won)) : "");
  const unknown = value.status === "unknown";
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[15px] font-bold">
        {label}
      </label>
      <div className={`flex items-center rounded-xl bg-fill px-4 focus-within:ring-2 focus-within:ring-brand ${unknown ? "opacity-50" : ""}`}>
        <input
          id={id}
          inputMode="numeric"
          disabled={unknown}
          className="tabular h-14 min-w-0 flex-1 bg-transparent text-right text-[20px] font-bold outline-none placeholder:text-[16px] placeholder:font-medium placeholder:text-subtle"
          placeholder="입력하지 않음"
          value={value.status === "known" ? text : ""}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.]/g, "");
            setText(t);
            if (t === "") onChange({ status: "unanswered" });
            else if (Number.isFinite(Number(t))) onChange({ status: "known", won: manwonToWon(Number(t)) });
          }}
        />
        <span className="pl-2 text-[16px] font-bold text-muted">만원</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={unknown}
          onClick={() => onChange(unknown ? { status: "unanswered" } : { status: "unknown" })}
          className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${unknown ? "bg-ink text-white" : "bg-fill text-muted hover:bg-fill-strong"}`}
        >
          모름
        </button>
        {allowNone && (
          <button
            type="button"
            className="rounded-full bg-fill px-3 py-1.5 text-[13px] font-bold text-muted hover:bg-fill-strong"
            onClick={() => {
              setText("0");
              onChange({ status: "known", won: 0 });
            }}
          >
            {allowNone}
          </button>
        )}
        <span className="text-[13px] text-subtle" aria-live="polite">
          {value.status === "known" ? `= ${formatWon(value.won)}` : value.status === "unknown" ? "모름 (0원으로 계산하지 않아요)" : "미입력 (0원으로 계산하지 않아요)"}
        </span>
      </div>
      {hint && <p className="text-[13px] text-subtle">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "blue" | "red" }) {
  return (
    <div className="rounded-xl bg-fill p-3.5">
      <p className="text-[12px] font-semibold text-subtle">{label}</p>
      <p className={`tabular mt-1 text-[17px] font-extrabold ${tone === "blue" ? "text-brand" : tone === "red" ? "text-bad" : "text-ink"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-subtle">{sub}</p>}
    </div>
  );
}
