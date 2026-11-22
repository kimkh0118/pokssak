// 비회원도 조회·분석은 가능. 내 자산·알림·문의·관리자 화면만 로그인으로 보낸다(동의 여부는 MemberGate·API가 확인).
import { NextRequest, NextResponse } from "next/server";

const MEMBER = ["/my", "/notifications", "/notify", "/inquiry", "/admin"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!MEMBER.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.get("hc_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

// 화면 주소만 검사(API·중계·정적 파일·아이콘·서비스워커·매니페스트는 제외)
export const config = {
  matcher: ["/((?!api/|relay/|_next/|icons/|sw\\.js|manifest\\.webmanifest|icon\\.svg|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
