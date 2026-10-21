import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const noto = Noto_Sans_KR({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "집 선택 비교",
  description: "단독·다가구주택의 매각·철거·리모델링·유지 선택지를 같은 기준으로 비교합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${noto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-bold text-ink">
              집 선택 비교 <span className="ml-1 rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">MVP</span>
            </Link>
            <span className="text-xs text-muted">단독·다가구주택 대상</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted">
          계산 결과는 공개 자료와 가정에 기반한 참고용 추정이며, 세금·법률·안전진단 판단을 대신하지 않습니다.
        </footer>
      </body>
    </html>
  );
}
