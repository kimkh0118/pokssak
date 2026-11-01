// 브이월드 중계: 브이월드는 해외 서버(Render) 접속을 막아서, 서울 리전(Vercel icn1)에서 대신 불러 준다.
// 앱이 쓰는 조회 4가지만 넘긴다. 인증은 브이월드가 직접 한다(우리 키 + 등록된 사이트 주소 Referer).
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["getLandCharacteristics", "getLandUseAttr", "getIndvdHousingPriceAttr", "getEBOfficeInfo"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.length !== 3 || path[0] !== "ned" || path[1] !== "data" || !ALLOWED.has(path[2])) {
    return new Response("not found", { status: 404 });
  }
  if (!req.nextUrl.searchParams.get("key")) return new Response("missing key", { status: 400 });
  const url = `https://api.vworld.kr/ned/data/${path[2]}${req.nextUrl.search}`;
  const referer = req.headers.get("referer");
  const r = await fetch(url, { headers: referer ? { Referer: referer } : {}, cache: "no-store" });
  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}
