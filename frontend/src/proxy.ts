// 로그인 안 한 사람은 소개 화면(/welcome)으로 보낸다. 동의 여부는 서버만 알아서 화면(MemberGate)과 API에서 따로 확인한다.
import { NextRequest, NextResponse } from "next/server";

const OPEN = ["/welcome", "/login", "/terms", "/privacy"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.get("hc_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/welcome";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

// 화면 주소만 검사(API·중계·정적 파일·아이콘·서비스워커·매니페스트는 제외)
export const config = {
  matcher: ["/((?!api/|relay/|_next/|icons/|sw\\.js|manifest\\.webmanifest|icon\\.svg|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
