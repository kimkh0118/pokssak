"use client";

// 도로명 주소 표지판 컨셉의 주소 입력: 파란 판, 흰 테두리, 흰 글씨, 오른쪽 화살표
export function AddressSign({
  value,
  onChange,
  onSubmit,
  busy,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="relative rounded-[18px] bg-[#1d4f9c] p-[6px] shadow-[0_10px_30px_-12px_rgba(29,79,156,.6)]"
    >
      <div className="flex items-center gap-3 rounded-[13px] border-[3px] border-white px-4 py-3 sm:px-5 sm:py-4">
        <label htmlFor="addr" className="sr-only">빈집 주소</label>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold tracking-[0.2em] text-white/70">ROAD NAME · 도로명주소</p>
          <input
            id="addr"
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="장대골로31번길 19"
            autoComplete="street-address"
            className="mt-1 w-full bg-transparent text-[24px] font-extrabold tracking-tight text-white caret-white outline-none placeholder:text-white/40 sm:text-[30px]"
          />
          <p className="mt-1 text-[12px] text-white/70">도로명 또는 지번(동 이름 + 번지)으로 검색하세요</p>
        </div>
        <button
          type="submit"
          disabled={busy}
          aria-label="주소 검색"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-[#1d4f9c] transition hover:scale-105 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {busy ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1d4f9c] border-t-transparent" />
          ) : (
            <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}
