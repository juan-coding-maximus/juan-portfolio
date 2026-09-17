import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deliberately NOT lib/dal.ts's mutate(): every helper there runs
// verifySession() first, which is the NutriBiotic PIN gate. This route is
// public by design, so it carries its own narrow write instead of widening
// a gate that guards a different thing.
const URL_BASE = process.env.NB_SUPABASE_URL;
const KEY = process.env.NB_SUPABASE_SERVICE_ROLE_KEY;

const SLUG = /^[a-z0-9_-]+$/i;

export async function POST(req: Request) {
  if (!URL_BASE || !KEY) {
    return NextResponse.json({ error: "store not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const raw = (body as { scores?: Record<string, unknown> })?.scores;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "no scores" }, { status: 400 });
  }

  // The worker acts on this unattended, so what lands has to be exactly what
  // it expects: a known-shaped slug and a 1-10 integer, nothing else.
  const scores: Record<string, number> = {};
  for (const [slug, value] of Object.entries(raw)) {
    if (!SLUG.test(slug) || slug.length > 120) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 10) continue;
    scores[slug] = n;
  }
  if (Object.keys(scores).length === 0) {
    return NextResponse.json({ error: "no valid scores" }, { status: 400 });
  }

  const res = await fetch(`${URL_BASE}/rest/v1/agency_rule_priorities`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ scores, status: "pending" }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // A missing table is the one failure worth naming precisely: it means the
    // migration has not been run yet, and the page can say so instead of
    // reporting a generic outage over a scored deck it does not want to lose.
    const missing = res.status === 404 || detail.includes("does not exist");
    return NextResponse.json(
      { error: missing ? "table not created yet" : `store rejected it (${res.status})` },
      { status: missing ? 503 : 502 },
    );
  }

  const [row] = (await res.json()) as Array<{ id: number }>;
  return NextResponse.json({ ok: true, id: row?.id ?? null, counted: Object.keys(scores).length });
}
