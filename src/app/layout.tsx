import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "집 선택 비교",
  description: "단독·다가구주택의 매각·철거·리모델링·유지 선택지를 같은 기준으로 비교합니다.",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

const TICKER = [
  ["공시지가 말고", "실거래 사례로"],
  ["세금은", "확인한 금액만"],
  ["모르면", "판단 보류로 솔직하게"],
  ["업체 수수료는", "순위에 반영 안 함"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight text-ink">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-2 to-brand text-[13px] text-white">집</span>
              집 선택 비교
            </Link>
            <Link href="/analyze?mode=sample" className="rounded-full bg-fill px-3 py-1.5 text-[13px] font-bold text-muted hover:bg-fill-strong">
              예시로 체험
            </Link>
          </div>
        </header>
        <div className="overflow-hidden bg-ink py-2.5 text-[14px] font-bold text-white" aria-label="서비스 원칙">
          <div className="ticker flex w-max gap-10 whitespace-nowrap">
            {[...TICKER, ...TICKER].map(([a, b], i) => (
              <span key={i} aria-hidden={i >= TICKER.length}>
                {a} <span className="text-brand-2">{b}</span>
              </span>
            ))}
          </div>
        </div>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6">{children}</main>
        <footer className="bg-fill px-4 py-6 text-center text-[12px] leading-relaxed text-subtle">
          계산 결과는 공개 자료와 가정에 기반한 참고용 추정이며,
          <br className="sm:hidden" /> 세금·법률·안전진단 판단을 대신하지 않습니다.
        </footer>
      </body>
    </html>
  );
}
