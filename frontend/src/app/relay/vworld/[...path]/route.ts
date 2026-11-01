// 브이월드 중계: 브이월드는 해외 서버(Render) 접속을 막아서, 서울 리전(Vercel icn1)에서 대신 불러 준다.
// 서버만 아는 비밀값(VWORLD_RELAY_SECRET)이 맞을 때만, /ned/data/ 아래 조회만 넘긴다.
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const secret = process.env.VWORLD_RELAY_SECRET;
  if (!secret || req.headers.get("x-relay-key") !== secret) return new Response("forbidden", { status: 403 });
  const { path } = await ctx.params;
  const sub = path.join("/");
  if (!/^ned\/data\/[A-Za-z]+$/.test(sub)) return new Response("not found", { status: 404 });
  const url = `https://api.vworld.kr/${sub}${req.nextUrl.search}`;
  const referer = req.headers.get("referer");
  const r = await fetch(url, { headers: referer ? { Referer: referer } : {}, cache: "no-store" });
  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}
