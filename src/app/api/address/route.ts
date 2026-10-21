import type { NextRequest } from "next/server";
import { searchAddress } from "@/lib/server/lookup";
import { errorResponse, parseMode } from "@/lib/server/respond";

export async function GET(req: NextRequest) {
  try {
    const mode = parseMode(req.nextUrl.searchParams.get("mode"));
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (!mode) return Response.json({ error: "mode는 live 또는 sample이어야 합니다." }, { status: 400 });
    if (q.length < 2) return Response.json({ error: "검색어를 두 글자 이상 입력해 주세요." }, { status: 400 });
    if (q.length > 80) return Response.json({ error: "검색어가 너무 깁니다." }, { status: 400 });
    const r = await searchAddress(mode, q);
    return Response.json(r, { status: r.ok ? 200 : 502 });
  } catch (e) {
    return errorResponse(e);
  }
}
