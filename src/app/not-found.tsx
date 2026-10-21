import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="text-[56px] font-extrabold leading-none tracking-tight text-brand">404</p>
      <h1 className="mt-4 text-[24px] font-extrabold">페이지를 찾을 수 없어요</h1>
      <p className="mt-2 text-[15px] text-muted">주소가 바뀌었거나 삭제된 페이지예요.</p>
      <div className="mt-8 flex justify-center gap-2">
        <Link href="/" className="rounded-xl bg-brand px-5 py-3 text-[15px] font-bold text-white">홈으로</Link>
        <Link href="/history" className="rounded-xl bg-fill px-5 py-3 text-[15px] font-bold text-ink">내 분석</Link>
      </div>
    </div>
  );
}
