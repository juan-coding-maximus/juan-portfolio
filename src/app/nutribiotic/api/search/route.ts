/**
 * The Search screen's three actions, each its own POST to this one route.
 *
 * THIS ROUTE OWNS NO LOGIC. Every filter, every drop reason, the triage
 * weights, the point-in-polygon test, the territory test, the book de-dup and
 * the landing all live in bridges/nutribiotic/places_search_ingest.py, which is
 * the department's source of truth for this pipeline and is exercised from the
 * CLI as well. Re-implementing any of it in TypeScript would give the OS and
 * the CLI two editable copies of the same rule (root AGENTS.md P4), and the
 * first time they disagreed, Juan would be looking at a number no file
 * produced. So this pipes a JSON request into that script's `--stage` door and
 * hands back what it prints.
 *
 * THREE STAGES, THREE CLICKS, ONE AT A TIME (rebuilt 2026-09-09, Juan's ask):
 *
 *   stage:"search"  polygon + filters -> a list of candidates. Google and
 *                   nb_accounts are read. No site is fetched. NOTHING WRITTEN.
 *   stage:"enrich"  the candidates Juan ticked -> the same records with their
 *                   about-us line, product-fit tags and any named human filled
 *                   in from their own websites. NOTHING WRITTEN.
 *   stage:"land"    the candidates Juan ticked again -> rows in nb_accounts and
 *                   nb_sdr_schedule. THE ONLY STAGE THAT WRITES, and only with
 *                   write:true, which only the button that says so sends.
 *
 * THE CANDIDATE LIST TRAVELS ON STDIN, NOT ARGV. Stages 2 and 3 take the list
 * stage 1 produced, and that list has been sitting in the browser while Juan
 * picked from it. argv would truncate it; rebuilding it here would be the
 * second copy of the rules this file exists to avoid.
 *
 * WHAT COMES BACK FROM THE BROWSER IS FACTS, NOT POLICY. The script's
 * candidate_row() writes owner, source, lifecycle and hubspot_sync_eligible
 * from its own constants and reads only the Places/site fields off the record,
 * so a tampered payload cannot change who a prospect belongs to or whether it
 * is allowed near the portal.
 *
 * WHERE IT RUNS, HONESTLY. bridges/ lives in the agency repo; this app is its
 * own repo deployed to Vercel, where there is no Python and no bridges/
 * directory. So this route works when the OS is served from the Mac (pnpm dev
 * / a local build) and returns 503 everywhere else. That is the whole
 * requirement: Juan asked for this screen on his Mac only. It never pretends:
 * an unreachable bridge is a stop, not an empty result that reads like "the
 * sweep found nothing" (NutriBiotic AGENTS.md, HARD RULE 8's shape).
 *
 * NOTHING HERE TOUCHES HUBSPOT, because the script it calls does not import
 * the hubspot module at all. Rows land with hubspot_sync_eligible = false and
 * earn a portal record by being talked to (HARD RULE 20).
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { hasAccess } from "../../lib/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* The enrich stage fetches up to four pages per picked candidate. A handful of
   picks is the expectation; this is the ceiling. */
export const maxDuration = 300;

const SCRIPT_REL = path.join("bridges", "nutribiotic", "places_search_ingest.py");

/** A bound on one search. The script reports `capped_off` when it bites, so a
 *  truncated list says so on screen rather than looking like the whole answer. */
const MAX_CANDIDATES = 60;

/** A bound on what one click can spend and one click can append. Both are
 *  Juan-facing numbers: the UI disables the button past them rather than
 *  silently trimming his selection. */
const MAX_ENRICH = 25;
const MAX_LAND = 25;

/** As many pins as he wants, within reason. 200 vertices is a shape no hand
 *  draws by accident, and the ray-cast is linear in them. */
const MAX_PINS = 200;

const CHILD_TIMEOUT_MS = 280_000;

type Stage = "search" | "enrich" | "land";

function num(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** The agency checkout that holds bridges/. `pnpm dev` runs with cwd at the
 *  app root, whose parent is the agency repo; NB_AGENCY_DIR overrides for any
 *  other layout. */
function agencyRoot(): string | null {
  const candidates = [
    process.env.NB_AGENCY_DIR,
    path.resolve(process.cwd(), ".."),
    process.cwd(),
  ].filter((p): p is string => !!p);
  for (const root of candidates) {
    if (existsSync(path.join(root, SCRIPT_REL))) return root;
  }
  return null;
}

function python(): string {
  return process.env.NB_PYTHON ?? (existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3");
}

/** The script prints its summary as one JSON object. Anything a stray import
 *  wrote before it is skipped rather than allowed to break the parse. */
function parseSummary(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function runStage(
  root: string,
  stage: Stage,
  request: unknown,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      python(),
      [path.join(root, SCRIPT_REL), "--stage", stage],
      { cwd: root, timeout: CHILD_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === "number"
            ? (err as unknown as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
    child.stdin?.end(JSON.stringify(request));
  });
}

/** The candidate records, passed straight back through. They came from the
 *  script and go back to it; the only thing checked here is that they are
 *  objects carrying the `key` the script assigns, so a malformed page state
 *  fails at the door instead of halfway through a landing. */
function candidates(v: unknown, cap: number): Record<string, unknown>[] | null {
  if (!Array.isArray(v)) return null;
  if (v.length === 0 || v.length > cap) return null;
  const out: Record<string, unknown>[] = [];
  for (const c of v) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return null;
    const rec = c as Record<string, unknown>;
    if (typeof rec.key !== "string" || !rec.key) return null;
    out.push(rec);
  }
  return out;
}

function unavailable(stage: Stage) {
  return Response.json(
    {
      ok: false,
      stage,
      unavailable: true,
      error:
        "The search bridge is not reachable from this deployment. The pipeline is a Python " +
        "script in the agency repo, so it runs when the OS is served from the Mac.",
      errors: [],
      candidates: [],
    },
    { status: 503 },
  );
}

export async function POST(req: Request) {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Expected a JSON body." }, { status: 400 });
  }

  const stage = String(body.stage ?? "search") as Stage;
  if (stage !== "search" && stage !== "enrich" && stage !== "land") {
    return Response.json({ ok: false, error: `Unknown stage ${stage}.` }, { status: 400 });
  }

  let request: Record<string, unknown>;

  if (stage === "search") {
    const category = String(body.category ?? "").trim().slice(0, 120);
    if (!category) {
      return Response.json({ ok: false, error: "Say what to search for." }, { status: 400 });
    }

    /* The polygon, exactly as drawn. Validated for shape here (three real
       coordinates, no more than MAX_PINS) and for geometry in the script,
       which is where point_in_polygon and the bounding box live. */
    const raw = Array.isArray(body.polygon) ? body.polygon : [];
    const polygon: [number, number][] = [];
    for (const p of raw.slice(0, MAX_PINS)) {
      const pt = p as { lat?: unknown; lng?: unknown };
      const lat = Number(pt?.lat);
      const lng = Number(pt?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      polygon.push([lat, lng]);
    }
    if (polygon.length < 3) {
      return Response.json(
        { ok: false, error: "Drop at least three pins to close an area first." },
        { status: 400 },
      );
    }

    request = {
      category,
      polygon,
      min_review_count: Math.round(num(body.min_review_count, 30, 0, 5000)),
      min_rating: num(body.min_rating, 4.0, 0, 5),
      require_phone: bool(body.require_phone, true),
      require_website: bool(body.require_website, true),
      min_triage_score: num(body.min_triage_score, 45, 0, 100),
      /* "auto" means the script looks the category up in CATEGORY_TYPES.
         An explicit "" is Juan switching Google's own type filter off. */
      included_type:
        typeof body.included_type === "string" ? body.included_type.slice(0, 60) : "auto",
      max_candidates: MAX_CANDIDATES,
    };
  } else if (stage === "enrich") {
    const picked = candidates(body.candidates, MAX_ENRICH);
    if (!picked) {
      return Response.json(
        { ok: false, error: `Pick between 1 and ${MAX_ENRICH} rows to look further into.` },
        { status: 400 },
      );
    }
    request = { candidates: picked, site_pages: Math.round(num(body.site_pages, 4, 1, 8)) };
  } else {
    const category = String(body.category ?? "").trim().slice(0, 120);
    const picked = candidates(body.candidates, MAX_LAND);
    if (!picked) {
      return Response.json(
        { ok: false, error: `Pick between 1 and ${MAX_LAND} rows to add.` },
        { status: 400 },
      );
    }
    request = {
      category,
      candidates: picked,
      calls_per_day: Math.round(num(body.calls_per_day, 15, 1, 50)),
      /* The only place `write` is ever true, and it is not defaulted: an
         absent flag lands nothing, which is what a dry run is. */
      write: body.write === true,
    };
  }

  const root = agencyRoot();
  if (!root) return unavailable(stage);

  const { code, stdout, stderr } = await runStage(root, stage, request);
  const summary = parseSummary(stdout);
  if (!summary) {
    return Response.json(
      {
        ok: false,
        stage,
        error: "The search bridge produced no summary.",
        detail: (stderr || stdout).slice(-1200),
        errors: [],
        candidates: [],
      },
      { status: 502 },
    );
  }
  /* A stage that reached its sources and found nothing is ok:true with zeroes,
     and is shown as such. A stage that could not reach a source is ok:false
     carrying its own `errors`, and the client prints them verbatim. */
  return Response.json(
    { ...summary, exit_code: code, limits: { MAX_CANDIDATES, MAX_ENRICH, MAX_LAND } },
    { headers: { "cache-control": "no-store" } },
  );
}
