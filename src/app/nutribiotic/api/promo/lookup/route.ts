/**
 * Code lookup for the public entry screen. No session: a buyer with a card is
 * exactly who this is for. Returns a redirect target, never data; the offer
 * page itself is the only reader of a code's content.
 */
import { getCode, rateLimited } from "../../../lib/promo-public";
import { normalizeCode } from "../../../lib/promo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (rateLimited(ip, "lookup", 10)) {
    return Response.json({ ok: false, error: "Too many tries. Wait a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const raw = (body?.code as string | undefined) ?? "";
  const norm = normalizeCode(raw);
  if (!norm) return Response.json({ ok: false, found: false });

  const code = await getCode(norm);
  // void codes resolve to the general page with no further explanation, per
  // spec: a voided offer is withdrawn, not discussed.
  if (!code || code.state === "void") return Response.json({ ok: true, found: false });

  return Response.json({ ok: true, found: true, redirect: `/nutribiotic/promo/o/${norm}` });
}
