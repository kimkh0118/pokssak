"use client";

import type { ReactNode } from "react";
import type { ProviderError } from "@/lib/api";
import { ERROR_LABEL, KIND_LABEL } from "@/lib/labels";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line ${className}`}>{children}</section>;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "dark"; size?: "md" | "lg" }) {
  const styles = {
    primary: "bg-brand text-brand-ink shadow-[0_4px_10px_-4px_rgba(169,93,46,.7)] hover:bg-brand-strong",
    dark: "bg-ink text-white hover:opacity-90",
    secondary: "bg-fill text-ink hover:bg-fill-strong",
    ghost: "text-brand-strong hover:underline",
  }[variant];
  const sizes = size === "lg" ? "min-h-14 rounded-2xl px-5 text-[17px]" : "min-h-11 rounded-xl px-4 text-[15px]";
  return (
    <button
      className={`inline-flex items-center justify-center font-bold transition-[transform,background-color,opacity,box-shadow] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-fill-strong disabled:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${sizes} ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 화면 하단 고정 버튼 영역(모바일 앱처럼) */
/** 화면 아래 고정 버튼 줄. 휴대폰에서는 하단 탭 바로 위에 붙고, 내용이 버튼에 가리지 않게 빈 공간을 둔다 */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden className="h-20" />
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 pb-3 pt-3 backdrop-blur md:bottom-0 md:pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="mx-auto flex max-w-md gap-2">{children}</div>
      </div>
    </>
  );
}

const PROV_STYLE: Record<string, string> = {
  public_api: "bg-brand-soft text-brand-strong",
  public: "bg-brand-soft text-brand-strong",
  rule: "bg-brand-soft text-brand-strong",
  consult: "bg-[#e8f8f0] text-good",
  assumption: "bg-warn-soft text-warn",
  unknown: "bg-bad-soft text-bad",
  none: "bg-fill text-muted",
  sample: "bg-sample-soft text-sample",
};

export function ProvenanceBadge({ p }: { p: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 align-middle text-[11px] font-bold ${PROV_STYLE[p] ?? "bg-fill text-muted"}`}>{KIND_LABEL[p] ?? p}</span>;
}

export function Pill({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "blue" | "red" | "orange" | "green" }) {
  const s = { gray: "bg-fill text-muted", blue: "bg-brand-soft text-brand-strong", red: "bg-bad-soft text-bad", orange: "bg-warn-soft text-warn", green: "bg-[#e8f8f0] text-good" }[tone];
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
        {title ?? error.source} · {ERROR_LABEL[error.kind] ?? error.kind}
        {error.code ? ` (코드 ${error.code})` : ""}
      </p>
      <p className="mt-1 text-ink/80">{error.message}</p>
      {error.kind === "not_configured" && <p className="mt-1 text-ink/80">서버 환경변수에 인증키를 넣어야 해요. README의 &lsquo;API 인증키&rsquo;를 참고하세요.</p>}
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
              className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-[15px] font-semibold shadow-sm transition ${on ? "bg-brand-soft text-brand-strong ring-2 ring-brand" : "bg-surface text-ink ring-1 ring-line hover:ring-brand-2"}`}
            >
              <span>
                {o.label}
                {o.hint && <span className="block text-[13px] font-normal text-subtle">{o.hint}</span>}
              </span>
              <input type="radio" name={name} className="sr-only" checked={on} onChange={() => onChange(o.value)} />
              <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] ${on ? "bg-brand text-white" : "bg-fill text-transparent ring-1 ring-line"}`}>✓</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "blue" | "red" }) {
  return (
    <div className="rounded-xl bg-fill p-3.5">
      <p className="text-[12px] font-semibold text-subtle">{label}</p>
      <p className={`num-in tabular mt-1 text-[17px] font-extrabold ${tone === "blue" ? "text-brand-strong" : tone === "red" ? "text-bad" : "text-ink"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-subtle">{sub}</p>}
    </div>
  );
}
