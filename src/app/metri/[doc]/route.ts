/**
 * Metri Bio client pages: /metri/sow, /metri/strategy, and /metri/why (any letter case).
 *
 * The documents are built in the agency repo (projects/metri-bio/deliverables) and copied into
 * ../docs.generated.ts by that repo's publish_site.py. They are never in public/, so the HTML is
 * only ever sent after the password check below.
 *
 * Password: "endo", compared after lowercasing and removing all whitespace.
 */
import { createHash } from "node:crypto";
import { DOCS } from "../docs.generated";

const PASSWORD = "endo";
const COOKIE = "metri_access";
const TOKEN = createHash("sha256").update(`metri-bio:${PASSWORD}`).digest("hex");
const MAX_AGE = 60 * 60 * 24 * 60;

type Key = keyof typeof DOCS;

function docKey(raw: string): Key | null {
  const k = raw.toLowerCase();
  return k in DOCS ? (k as Key) : null;
}

function normalize(v: string) {
  return v.toLowerCase().replace(/\s+/g, "");
}

function hasAccess(req: Request) {
  const cookies = req.headers.get("cookie") ?? "";
  return cookies.split(";").some((c) => c.trim() === `${COOKIE}=${TOKEN}`);
}

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function gate(action: string, wrong: boolean) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Metri Bio</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=Newsreader:opsz,wght@6..72,300&display=swap">
<style>
:root{--bg:#E9E7ED;--sheet:#FBFAFC;--ink:#171319;--ink2:#5C5566;--rule:#C3BCCB;--accent:#A32361;}
@media (prefers-color-scheme: dark){:root{--bg:#050408;--sheet:#131118;--ink:#F0ECF3;--ink2:#A29BAE;--rule:#3D3749;--accent:#F58BB6;}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font-family:Archivo,"Helvetica Neue",Arial,sans-serif}
form{background:var(--sheet);border:1px solid var(--rule);padding:32px;width:100%;max-width:360px;display:flex;flex-direction:column;gap:14px}
h1{font-family:Newsreader,Georgia,serif;font-weight:300;font-size:34px;margin:0 0 6px;letter-spacing:-.01em}
input{font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--rule);background:transparent;color:var(--ink);border-radius:2px}
input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button{font:inherit;font-weight:600;font-size:15px;padding:11px 12px;border:0;border-radius:2px;background:var(--ink);color:var(--sheet);cursor:pointer}
.err{margin:0;font-size:13px;color:var(--accent)}
</style></head><body>
<form method="post" action="${action}">
<h1>Metri Bio</h1>
<input type="password" name="password" placeholder="Password" aria-label="Password" autocomplete="current-password" autofocus required>
${wrong ? '<p class="err" role="alert">Wrong password.</p>' : ""}
<button type="submit">Enter</button>
</form></body></html>`;
}

export async function GET(req: Request, { params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const key = docKey(doc);
  if (!key) return new Response("Not found", { status: 404 });
  const path = new URL(req.url).pathname;
  if (!hasAccess(req)) return new Response(gate(path, false), { status: 401, headers: HEADERS });
  return new Response(DOCS[key], { headers: HEADERS });
}

export async function POST(req: Request, { params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const key = docKey(doc);
  if (!key) return new Response("Not found", { status: 404 });
  const path = new URL(req.url).pathname;
  const form = await req.formData();
  const given = normalize(String(form.get("password") ?? ""));
  if (given !== PASSWORD) return new Response(gate(path, true), { status: 401, headers: HEADERS });
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
      "Set-Cookie": `${COOKIE}=${TOKEN}; Path=/metri; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
      "Cache-Control": "no-store",
    },
  });
}
