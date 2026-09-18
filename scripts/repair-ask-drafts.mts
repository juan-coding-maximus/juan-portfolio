/**
 * Repair the Outbound rows the old ask path wrote, using the new one.
 *
 * Juan, 2026-09-17: "these drafts are bullshit". Eleven rows in
 * nb_outbound_drafts are a customer's ask in his own words, queued as though
 * it were a written email: null subject, null recipient, a body that is half a
 * sentence. Six were still pending in front of him. This pass fixes those rows
 * in place rather than deleting them, because each one is a real thing a real
 * customer asked for and the queue losing it is worse than the queue printing
 * it badly.
 *
 * It calls the SAME composer the live path now calls
 * (src/app/nutribiotic/lib/ask-compose.ts). There is no second copy of the
 * no-fabrication rule, the voice, or the grounding gate here: this file finds
 * the rows and writes the answers back, and that is all it does.
 *
 * THREE STEPS, IN ORDER:
 *   1. source_ask backfilled on all eleven, including the five Juan already
 *      dismissed. That is what makes a dismissal permanent: the live path now
 *      checks every ask ever filed for the account, whatever became of it.
 *   2. Collisions among the pending rows resolved, keeping the row that says
 *      more. "Chlorella and Defense Plus" and "Julie asked for Chlorella and
 *      Defense Plus" are one ask from one conversation logged twice.
 *   3. What survives is composed against the note it came from.
 *
 * Usage, from the portfolio repo root:
 *   node --experimental-strip-types scripts/repair-ask-drafts.mts          # dry run
 *   node --experimental-strip-types scripts/repair-ask-drafts.mts --write
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

// .env.local carries the model key. The Supabase pair is blank in it on this
// Mac (the app reads those from Vercel in the environment Juan actually uses),
// so the department's own env, which every bridges/ script already reads, is
// where this one gets them too. First non-empty value wins.
for (const file of [resolve(ROOT, ".env.local"), resolve(ROOT, "../nutribiotic/.env")]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (value && !process.env[key]) process.env[key] = value;
  }
}

// After the env is in place: ask-compose builds its Anthropic client at module
// load, so importing it any earlier would give it no key.
const { asksCollide, composeAsk, normalizeAsk, unwrittenBody, ASK_COMPOSED_PLAY, ASK_UNWRITTEN_PLAY } = await import(
  "../src/app/nutribiotic/lib/ask-compose.ts"
);

const SB = process.env.NB_SUPABASE_URL!;
const KEY = process.env.NB_SUPABASE_SERVICE_ROLE_KEY!;

async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  // A DELETE asking for return=minimal answers 204 with no body at all.
  return (text ? JSON.parse(text) : null) as T;
}

type Row = {
  id: string;
  account_id: string | null;
  status: string;
  subject: string | null;
  to_email: string | null;
  body_md: string;
  source_ask: string | null;
  created_at: string;
};

const rows = await sb<Row[]>(
  "nb_outbound_drafts?select=id,account_id,status,subject,to_email,body_md,source_ask,created_at" +
    "&subject=is.null&to_email=is.null&origin=eq.manual&order=created_at.asc",
);
console.log(`${rows.length} fragment rows (${rows.filter((r) => r.status === "pending").length} pending)\n`);

// --- 1. Tombstones ---------------------------------------------------------
for (const r of rows) {
  if (r.source_ask) continue;
  const key = normalizeAsk(r.body_md);
  console.log(`  source_ask  ${r.id} (${r.status})  <- ${key}`);
  if (WRITE) await sb(`nb_outbound_drafts?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ source_ask: key }) });
}

// --- 2. Collisions among what is still pending -----------------------------
const pending = rows.filter((r) => r.status === "pending");
const dropped = new Set<string>();
for (let i = 0; i < pending.length; i++) {
  for (let j = i + 1; j < pending.length; j++) {
    const a = pending[i];
    const b = pending[j];
    if (dropped.has(a.id) || dropped.has(b.id)) continue;
    if (a.account_id !== b.account_id) continue;
    if (!asksCollide(a.body_md, b.body_md)) continue;
    // Keep the one that says more; it is the same ask with the person's name
    // still attached. The other is the same conversation logged twice.
    const [keep, drop] = a.body_md.length >= b.body_md.length ? [a, b] : [b, a];
    dropped.add(drop.id);
    console.log(`\n  duplicate   ${drop.id} "${drop.body_md}"\n    kept      ${keep.id} "${keep.body_md}"`);
    if (WRITE) await sb(`nb_outbound_drafts?id=eq.${drop.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
}

// --- 3. Compose what is left -----------------------------------------------
type Account = { id: string; name: string; city: string | null; email: string | null };
type Contact = { id: string; first_name: string | null; last_name: string | null; title: string | null; email: string | null };
type Touchpoint = { raw_text: string; created_at: string };

for (const r of pending) {
  if (dropped.has(r.id) || !r.account_id) continue;

  const [account] = await sb<Account[]>(`nb_accounts?select=id,name,city,email&id=eq.${r.account_id}`);
  if (!account) continue;
  const contacts = await sb<Contact[]>(
    `nb_contacts?select=id,first_name,last_name,title,email&account_id=eq.${r.account_id}&order=is_decision_maker.desc`,
  );
  const notes = await sb<Touchpoint[]>(
    `nb_touchpoints?select=raw_text,created_at&account_id=eq.${r.account_id}&order=created_at.desc&limit=25`,
  );

  // The note this ask came out of: the closest one in time. The extractor
  // files the draft in the same request that files the touchpoint, so the gap
  // is seconds. Anything past a day is a different conversation and is not
  // used as grounding for this one.
  const target = new Date(r.created_at).getTime();
  const nearest = notes
    .map((n) => ({ n, gap: Math.abs(new Date(n.created_at).getTime() - target) }))
    .sort((x, y) => x.gap - y.gap)[0];
  const noteText = nearest && nearest.gap < 24 * 3600 * 1000 ? nearest.n.raw_text : "";

  console.log(`\n  ${r.id}  ${account.name}\n    ask   "${r.body_md}"`);
  if (!noteText) {
    console.log("    skip  no note within a day of this row, nothing to ground it in");
    continue;
  }

  const composed = await composeAsk({
    ask: r.body_md,
    noteText,
    account,
    contacts: contacts
      .map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
        title: c.title,
        email: c.email,
      }))
      .filter((c) => c.name),
  });

  const patch = composed.written
    ? {
        subject: composed.subject,
        body_md: composed.body,
        to_email: composed.toEmail,
        to_name: composed.toName,
        contact_id: composed.contactId,
        play_key: ASK_COMPOSED_PLAY,
      }
    : { body_md: unwrittenBody(r.body_md, composed.reason), play_key: ASK_UNWRITTEN_PLAY };

  if (composed.written) {
    console.log(`    WRITTEN to ${composed.toName ?? "(no named contact)"} <${composed.toEmail ?? "no email"}>`);
    console.log(`    subj  ${composed.subject}`);
    console.log(composed.body.split("\n").map((l) => `          ${l}`).join("\n"));
  } else {
    console.log(`    UNWRITTEN  ${composed.reason}`);
  }

  if (WRITE) await sb(`nb_outbound_drafts?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

console.log(WRITE ? "\nwritten." : "\ndry run, nothing written. Re-run with --write.");
