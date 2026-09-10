/**
 * The Search screen's three actions. This route validates one and queues it.
 *
 * THIS ROUTE OWNS NO LOGIC AND, SINCE 2026-09-09, RUNS NO PYTHON. Every filter,
 * every drop reason, the triage weights, the point-in-polygon test, the
 * territory test, the book de-dup and the landing all live in
 * bridges/nutribiotic/places_search_ingest.py, which is the department's source
 * of truth for this pipeline and is exercised from the CLI as well.
 * Re-implementing any of it in TypeScript would give the OS and the CLI two
 * editable copies of the same rule (root AGENTS.md P4), and the first time they
 * disagreed, Juan would be looking at a number no file produced.
 *
 * WHERE IT RUNS, HONESTLY, AND WHY THAT CHANGED
 * ---------------------------------------------
 * bridges/ lives in the agency repo. This app is its own repo, deployed to
 * Vercel, where there is no Python and no bridges/ directory, and no
 * environment variable can conjure one. This route used to shell out to the
 * script synchronously and return 503 when the file was not on disk, which is
 * correct on `pnpm dev` and is a dead screen on the site Juan uses every day.
 * He hit exactly that: "The search bridge is not reachable from this
 * deployment." (Vercel's function ceiling would have killed a 300-second sweep
 * regardless.)
 *
 * So the two halves stop trying to reach each other. Both reach Supabase, which
 * is reachable from everywhere:
 *
 *   POST /nutribiotic/api/search        validates the request, inserts one
 *                                       pending row in nb_search_jobs (migration
 *                                       0074), returns { job } immediately.
 *   bridges/nutribiotic/search_worker.py  on Juan's Mac under launchd
 *                                       (com.agency.nutribiotic-search-worker),
 *                                       claims the row, calls the script's
 *                                       stage function locally, writes the
 *                                       answer back onto the row.
 *   GET  /nutribiotic/api/search?job=id the browser polls this until the row
 *                                       says done or error.
 *
 * ONE PATH, NOT TWO. There is deliberately no "shell out directly if bridges/
 * happens to exist" fast path any more. A second mechanism would mean the path
 * Juan depends on is the one exercised least, and the local worker is running
 * on this Mac anyway, so `pnpm dev` and production now go through the identical
 * queue. A dev with no worker loaded sees exactly the state Juan would, which
 * is the point.
 *
 * THIS IS THE REPORTS SCREEN'S PATTERN. nb_report_drafts + field_report.py
 * --serve has been carrying builds and renders across the same boundary since
 * August (com.agency.nutribiotic-report-serve.plist). Only the cadence differs:
 * that poller runs every 3 minutes because nobody is watching a report render,
 * and this one polls every 2 seconds because Juan is watching a search.
 *
 * WHAT "NOT REACHABLE" MEANS NOW. A job that sits `pending` is not a failure:
 * it is queued, and the Mac will take it as soon as it is awake and the worker
 * is up. The screen says "waiting on your Mac", which is the recoverable truth,
 * and only calls it a stop when the wait runs past the client's ceiling. A
 * stage that RAN and could not reach Google still reports that as ok:false with
 * its own `errors`, printed verbatim, never as an empty list that would read
 * like "the sweep found nothing" (NutriBiotic AGENTS.md, HARD RULE 8).
 *
 * THE CANDIDATE LIST TRAVELS IN THE JOB ROW, NOT ON A COMMAND LINE. Stages 2
 * and 3 take the list stage 1 produced, and that list has been sitting in the
 * browser while Juan picked from it. It goes into `params` as jsonb and comes
 * back out on the Mac, which is the same shape it had on stdin before.
 *
 * WHAT COMES BACK FROM THE BROWSER IS FACTS, NOT POLICY. The script's
 * candidate_row() writes owner, source, lifecycle and hubspot_sync_eligible
 * from its own constants and reads only the Places/site fields off the record,
 * so a tampered payload cannot change who a prospect belongs to or whether it
 * is allowed near the portal.
 *
 * THREE STAGES, THREE CLICKS, ONE AT A TIME:
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
 * NOTHING HERE TOUCHES HUBSPOT, because the script the worker calls does not
 * import the hubspot module at all. Rows land with hubspot_sync_eligible =
 * false and earn a portal record by being talked to (HARD RULE 20).
 */
import { hasAccess } from "../../lib/devices";
import {
  createSearchJob,
  getSearchJobResult,
  getSearchJobStatus,
  type SearchJobStage,
} from "../../lib/dal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function num(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** The candidate records, passed straight back through. They came from the
 *  script and go back to it; the only thing checked here is that they are
 *  objects carrying the `key` the script assigns, so a malformed page state
 *  fails at the door instead of halfway through a landing. */
/** A list of short, human-typed phrases (excluded categories, chain names).
 *  Trimmed, deduped, blanks dropped, capped so a pasted blob can't blow up the
 *  params payload or the script's per-place string scan. */
function phrases(v: unknown, cap: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const s = String(raw ?? "").trim().slice(0, maxLen);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

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

/**
 * POST · queue one stage.
 *
 * Validation is unchanged and still happens here, at the door, before anything
 * is written: a request that cannot be run should never become a row the worker
 * has to fail.
 */
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

  const stage = String(body.stage ?? "search") as SearchJobStage;
  if (stage !== "search" && stage !== "enrich" && stage !== "land") {
    return Response.json({ ok: false, error: `Unknown stage ${stage}.` }, { status: 400 });
  }

  let params: Record<string, unknown>;

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

    params = {
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
      /* Category exclude is always live once Juan lists something; chain
         exclude and min_photos are capabilities he switches on, not defaults
         (his call, 2026-09-09). "not permanently closed" has no flag here at
         all: the script drops it unconditionally. */
      exclude_categories: phrases(body.exclude_categories, 40, 60),
      chain_exclude: bool(body.chain_exclude, false),
      chain_names: phrases(body.chain_names, 40, 80),
      min_photos: Math.round(num(body.min_photos, 0, 0, 200)),
      /* A density cap, not a location filter: keeps the top N by triage score
         per 1mi x 1mi cell rather than dropping anything for where it sits. */
      max_per_sq_mile: Math.round(num(body.max_per_sq_mile, 0, 0, 100)),
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
    params = { candidates: picked, site_pages: Math.round(num(body.site_pages, 4, 1, 8)) };
  } else {
    const category = String(body.category ?? "").trim().slice(0, 120);
    const picked = candidates(body.candidates, MAX_LAND);
    if (!picked) {
      return Response.json(
        { ok: false, error: `Pick between 1 and ${MAX_LAND} rows to add.` },
        { status: 400 },
      );
    }
    params = {
      category,
      candidates: picked,
      calls_per_day: Math.round(num(body.calls_per_day, 15, 1, 50)),
      /* The only place `write` is ever true, and it is not defaulted: an
         absent flag lands nothing, which is what a dry run is. */
      write: body.write === true,
    };
  }

  let job: string;
  try {
    job = await createSearchJob(stage, params);
  } catch (e) {
    /* The queue itself is unreachable, which is the one honest hard failure
       left on this path: without it there is nothing to hand the Mac. */
    return Response.json(
      {
        ok: false,
        stage,
        error: "Could not queue the run: the OS database did not accept it. Nothing ran.",
        detail: String(e).slice(-400),
      },
      { status: 502 },
    );
  }

  return Response.json(
    { ok: true, stage, job, status: "pending", limits: { MAX_CANDIDATES, MAX_ENRICH, MAX_LAND } },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * GET · what has happened to a queued job.
 *
 * `?job=<id>`. Answers with the row's status and, once there is one, the
 * stage's own summary verbatim, which is exactly the object the POST used to
 * return synchronously. The client's rendering did not have to change.
 *
 * The result is fetched only when the status says it exists, in a second query.
 * A finished search summary carries ~60 candidate records; re-shipping it on
 * every 1.5-second poll is the kind of egress that suspended this org on
 * 2026-09-02.
 */
export async function GET(req: Request) {
  if (!(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("job") ?? "";
  if (!id) {
    return Response.json({ ok: false, error: "Which job?" }, { status: 400 });
  }

  let row;
  try {
    row = await getSearchJobStatus(id);
  } catch (e) {
    return Response.json(
      { ok: false, error: "Could not read the run's status.", detail: String(e).slice(-400) },
      { status: 502 },
    );
  }
  if (!row) {
    return Response.json({ ok: false, error: "No such run." }, { status: 404 });
  }

  const base = {
    job: row.id,
    stage: row.stage,
    status: row.status,
    created_at: row.created_at,
    started_at: row.started_at,
    updated_at: row.updated_at,
  };

  if (row.status === "pending" || row.status === "running") {
    return Response.json({ ok: true, ...base }, { headers: { "cache-control": "no-store" } });
  }

  if (row.status === "error") {
    return Response.json(
      { ok: false, ...base, error: row.error ?? "The run failed on the Mac.", errors: [], candidates: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const result = await getSearchJobResult(id);
  if (!result) {
    /* done with no payload is not a state the worker writes; treat it as the
       stop it is rather than as an empty result set. */
    return Response.json(
      { ok: false, ...base, error: "The run finished without recording a summary.", errors: [], candidates: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  /* The stage's summary, unchanged. `ok` inside it is the script's own verdict:
     a stage that reached its sources and found nothing is ok:true with zeroes;
     a stage that could not reach one is ok:false carrying its own `errors`, and
     the client prints them verbatim. */
  return Response.json(
    { ...result, ...base, limits: { MAX_CANDIDATES, MAX_ENRICH, MAX_LAND } },
    { headers: { "cache-control": "no-store" } },
  );
}
