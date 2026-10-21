import { env } from "@/lib/providers/http";

// 인증키 설정 여부만 알려준다(값은 노출하지 않음)
export async function GET() {
  return Response.json({
    juso: !!env.jusoKey(),
    dataGoKr: !!env.dataGoKrKey(),
    vworld: !!env.vworldKey(),
  });
}
