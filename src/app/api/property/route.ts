import { lookupProperty } from "@/lib/server/lookup";
import { errorResponse, parseMode } from "@/lib/server/respond";
import type { AddressCandidate } from "@/lib/domain/property";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { mode?: unknown; address?: AddressCandidate };
    const mode = parseMode(body.mode);
    if (!mode || !body.address || typeof body.address.admCd !== "string") {
      return Response.json({ error: "주소 정보가 올바르지 않습니다." }, { status: 400 });
    }
    const lookup = await lookupProperty(mode, body.address);
    return Response.json(lookup);
  } catch (e) {
    return errorResponse(e);
  }
}
