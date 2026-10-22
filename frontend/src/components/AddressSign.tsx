"use client";

// 도로명 주소 표지판: 남색 판 + 흰 안쪽 테두리 + 오른쪽 화살촉
function Plate({ children, size = "lg" }: { children: React.ReactNode; size?: "lg" | "md" }) {
  return (
    <div className={`road-sign bg-sign ${size === "lg" ? "p-[5px] pr-[26px]" : "p-1 pr-[24px]"} drop-shadow-[0_6px_14px_rgba(44,47,128,.35)]`}>
      <div className="road-sign rounded-l-[6px] border-[2.5px] border-r-0 border-white px-3 py-2 pr-6">{children}</div>
    </div>
  );
}

/** 결과·정보 화면 머리의 주소 표지판(읽기 전용) */
export function AddressPlate({ title, sub = "Enter the address" }: { title: string; sub?: string }) {
  return (
    <div className="inline-block max-w-full">
      <Plate size="md">
        <p className="truncate text-[24px] font-bold leading-tight tracking-tight text-white sm:text-[28px]">{title}</p>
        <p className="text-[11px] font-medium text-white/75">{sub}</p>
      </Plate>
    </div>
  );
}

/** 지번 주소에서 '동 번지'만 뽑아 표지판에 쓴다(예: 반송동 250-2809) */
export function plateTitle(jibun?: string | null, road?: string | null) {
  const parts = (jibun ?? "").trim().split(/\s+/);
  if (parts.length >= 2) return parts.slice(-2).join(" ");
  return road ?? "주소";
}

export function AddressSign({
  value,
  onChange,
  onSubmit,
  busy,
  autoFocus,
  cta = "내 주소 조회하기",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  autoFocus?: boolean;
  cta?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-3"
    >
      <Plate>
        <label htmlFor="addr" className="sr-only">빈집 주소</label>
        <input
          id="addr"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="도로명/주소 입력"
          autoComplete="street-address"
          className="w-full bg-transparent text-[26px] font-bold leading-tight tracking-tight text-white caret-white outline-none placeholder:text-white/85 sm:text-[30px]"
        />
        <p className="text-[11px] font-medium text-white/75">Enter the address · 도로명 또는 동 이름 + 번지</p>
      </Plate>
      <button
        type="submit"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(169,93,46,.7)] transition hover:bg-brand-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
        {busy ? "찾는 중…" : cta}
      </button>
    </form>
  );
}
