"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-[24px] font-extrabold">일시적인 문제가 생겼어요</h1>
      <p className="mt-2 text-[15px] text-muted">잠시 후 다시 시도해 주세요. 입력하신 내용은 저장되지 않았을 수 있어요.</p>
      <div className="mt-8 flex justify-center gap-2">
        <button type="button" onClick={reset} className="rounded-xl bg-brand px-5 py-3 text-[15px] font-bold text-white">다시 시도</button>
        <Link href="/" className="rounded-xl bg-fill px-5 py-3 text-[15px] font-bold text-ink">홈으로</Link>
      </div>
    </div>
  );
}
