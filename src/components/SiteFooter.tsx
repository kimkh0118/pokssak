import Link from "next/link";
import { SITE } from "@/lib/site";
import { LogoMark } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-10 bg-fill">
      <div className="mx-auto max-w-5xl px-4 py-10 text-[13px] text-subtle">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-sm">
            <p className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
              <LogoMark size={22} /> {SITE.name}
            </p>
            <p className="mt-2 leading-relaxed">{SITE.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-[14px]">
            <p className="col-span-2 mb-1 text-[12px] font-bold text-muted">서비스</p>
            <Link href="/analyze?mode=live" className="hover:text-ink">분석하기</Link>
            <Link href="/history" className="hover:text-ink">내 분석</Link>
            <Link href="/about" className="hover:text-ink">계산 방법</Link>
            <Link href="/faq" className="hover:text-ink">자주 묻는 질문</Link>
            <Link href="/terms" className="hover:text-ink">이용약관</Link>
            <Link href="/privacy" className="font-bold text-muted hover:text-ink">개인정보처리방침</Link>
          </div>
        </div>
        <div className="mt-8 space-y-1 border-t border-line pt-6 leading-relaxed">
          <p>
            데이터 출처: 행정안전부 주소기반산업지원서비스(도로명주소), 국토교통부 건축HUB 건축물대장정보·단독/다가구 매매 실거래가(공공데이터포털),
            국토교통부 브이월드 토지특성정보.
          </p>
          <p>계산 결과는 공개 자료와 가정에 기반한 참고용 추정이며, 세금·법률·감정평가·안전진단을 대신하지 않습니다.</p>
        </div>
      </div>
    </footer>
  );
}
