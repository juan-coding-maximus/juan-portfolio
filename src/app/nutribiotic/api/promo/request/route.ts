/**
 * Order request intake. Public by design (the buyer holds no session), bounded
 * the same way as lookup: rate-limited, exact-code, insert-only.
 *
 * WRITE SEQUENCE: the order row first, then the code state. The database is
 * the record; the "email to Juan" of the original spec is deliberately absent
 * because no send leaves this system without a human (agency principle 1).
 * Requests surface in the phone tab, where the relay block is one copy away.
 *
 * TOTALS ARE RECOMPUTED HERE from the frozen snapshot's per-unit numbers and
 * the submitted quantities. The client shows a live total as quantities move,
 * but what is stored is the server's arithmetic over stored prices; a tampered
 * client total never reaches the record.
 */
import { createOrder, getCode, rateLimited } from "../../../lib/promo-public";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (rateLimited(ip, "request", 5)) {
    return Response.json({ ok: false, error: "Too many tries. Wait a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ ok: false, error: "Bad request." }, { status: 400 });

  const code = await getCode(String(body.code ?? ""));
  if (!code) return Response.json({ ok: false, error: "Unknown code." }, { status: 404 });
  if (code.state === "void" || code.state === "expired") {
    return Response.json({ ok: false, error: "This offer is no longer open." }, { status: 410 });
  }
  if (code.state === "requested") {
    return Response.json({ ok: false, error: "Already requested." }, { status: 409 });
  }

  const contact_name = String(body.contact_name ?? "").trim();
  const company = String(body.company ?? "").trim();
  const contact_email = String(body.contact_email ?? "").trim();
  const contact_phone = String(body.contact_phone ?? "").trim();
  const ship = String(body.ship_address ?? "").trim();
  const notes = String(body.notes ?? "").trim();
  if (!contact_name || !company || (!contact_email && !contact_phone)) {
    return Response.json(
      { ok: false, error: "Name, business name, and an email or phone are required." },
      { status: 400 },
    );
  }

  // Quantities: pre-filled from the snapshot, editable. Both the original and
  // the submitted figure are recorded; free units scale with the mechanic's
  // paid:free ratio for that line, and the total is server arithmetic.
  const submitted: Record<string, number> = body.quantities ?? {};
  const disc = code.snapshot.baseline_discount_pct || 0;
  let you_pay = 0;
  const line_items = code.snapshot.line_items.map((l) => {
    const qRaw = Number(submitted[l.sku]);
    const qty_paid =
      Number.isFinite(qRaw) && qRaw >= 0 && qRaw <= 999 ? Math.floor(qRaw) : l.qty_paid;
    const qty_free =
      l.qty_paid > 0 ? Math.floor((qty_paid * l.qty_free) / l.qty_paid) : l.qty_free;
    you_pay += qty_paid * l.wholesale_each * (1 - disc / 100);
    return { sku: l.sku, name: l.name, qty_paid, qty_free, original_qty_paid: l.qty_paid };
  });
  if (line_items.every((l) => l.qty_paid === 0)) {
    return Response.json({ ok: false, error: "The request has no items." }, { status: 400 });
  }

  const order = await createOrder({
    code_norm: code.code_norm,
    contact_name,
    contact_email: contact_email || null,
    contact_phone: contact_phone || null,
    company,
    ship_address: ship ? { text: ship } : null,
    line_items,
    totals: { you_pay: Math.round(you_pay * 100) / 100 },
    notes: notes || null,
  });

  return Response.json({ ok: true, redirect: `/nutribiotic/promo/o/${code.code_norm}/received`, id: order.id });
}
