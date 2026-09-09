"use client";

/**
 * The prospecting console: draw an area, search it, pick what to look further
 * into, pick what to put on the queue.
 *
 * THREE ACTIONS, THREE DECISIONS, IN ONE PLACE (rebuilt 2026-09-09 on Juan's
 * redirect). The first version was one Preview button and one Land button over
 * a radius picker, which made every survivor's website get read and every
 * survivor get landed. Both of those are Juan's calls to make per row, not the
 * pipeline's to make in bulk:
 *
 *   Search this area   Google + the book. A list. Nothing fetched, nothing written.
 *   Look further       ONLY the ticked rows get their websites read.
 *   Add to SDR         ONLY the ticked rows become prospects and calls.
 *
 * The selection SURVIVES between them, so the normal shape is: tick eight,
 * look further, untick the four that turned out wrong, add four.
 *
 * WHAT THIS FILE IS ALLOWED TO DO: collect filters, post them, and display what
 * comes back. It computes no counts of its own, it never fills a blank, and it
 * does not decide what is inside the drawn area (that is the server's
 * ray-cast). A candidate with no about-us line or no named human renders with
 * that cell EMPTY, never with "unknown" or a guess.
 *
 * THE LIST LIVES HERE, IN THIS PAGE'S STATE, and that is deliberate. See the
 * "WHY NO TABLE" note in bridges/nutribiotic/places_search_ingest.py: a
 * candidate nobody lands is a row nobody wants, and the cost of the choice is
 * that a reload means one re-search (page 0 is cached, so usually not a billed
 * one).
 *
 * EVERY ACTION IS A QUEUED JOB NOW, NOT A REQUEST THAT WAITS (2026-09-09). The
 * pipeline is Python on Juan's Mac and this screen is served from Vercel, which
 * has no Python and no bridges/ directory, so a synchronous call could never
 * work off the Mac and did not: "The search bridge is not reachable from this
 * deployment." Each button now POSTs a job, gets an id back immediately, and
 * polls it. See the route's docstring for the whole shape.
 *
 * WHICH MAKES "PENDING" A REAL STATE ON SCREEN, and it is not a failure. A job
 * sitting queued means the Mac has not picked it up yet, and it will, as soon
 * as the Mac is awake with the worker up. Past a short grace period this says
 * "waiting on your Mac", plainly, in the same muted line the run's progress
 * uses. The only hard stop is the ceiling below, and it says what did not
 * happen rather than dressing itself up as an alert.
 */

import { Fragment, useCallback, useMemo, useState } from "react";
import { Ico, SuccessNote } from "../lib/ui";
import { AreaPicker, type Pin } from "./AreaPicker";

/* ------------------------------------------------------------------ *
 * one shared set of surface tokens, so the console reads as one tool  *
 * ------------------------------------------------------------------ */
const inputCls =
  "w-full rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-2.5 py-1.5 text-[13px] text-[#14201B] " +
  "placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none";
const labelCls = "mb-1 block text-[11px] uppercase tracking-[0.1em] text-[#8A928C]";
const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-md bg-[#14201B] px-3.5 py-2 text-[13px] font-medium " +
  "text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30";
const secondaryBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-[#14201B] bg-white px-3 py-2 text-[13px] " +
  "font-medium text-[#14201B] transition-colors hover:bg-[#F2F0E8] disabled:cursor-not-allowed " +
  "disabled:border-[#E2DFD5] disabled:text-[#A9AFA9]";
const panel = "rounded-lg border border-[#E2DFD5] bg-white";
const th = "whitespace-nowrap px-3 py-2 text-left font-medium";
const td = "px-3 py-2 align-top";

export type Candidate = {
  key: string;
  name: string | null;
  city: string | null;
  street: string | null;
  address: string | null;
  postal: string | null;
  area: string | null;
  phone: string | null;
  website: string | null;
  website_raw: string | null;
  places_id: string | null;
  places_rating: number | null;
  places_rating_count: number | null;
  triage_score: number;
  triage_parts: Record<string, number>;
  enriched: boolean;
  about: string | null;
  about_url: string | null;
  about_basis: string | null;
  decision_maker_candidate: string | null;
  decision_maker_found_by: string | null;
  fit_tags: string[];
  catalog_terms: string[];
  pages_read: string[];
  site_failures: string[];
  /** Set by the land stage, and only by it. Its presence is what makes a row
   *  a real prospect on screen. */
  id?: string;
};

type StageReply = {
  ok: boolean;
  stage?: string;
  /** The queued job's id (POST) and where it is (GET). The rest of this shape
   *  is the script's own summary, unchanged: the queue carries it verbatim. */
  job?: string;
  status?: string;
  errors?: string[];
  error?: string;
  detail?: string;
  written?: boolean;
  candidates?: Candidate[];
  scope?: { kind?: string; pins?: number; diagonal_km?: number; label?: string };
  stages?: {
    search?: { distinct_places?: number; live_calls?: number; hit_google_ceiling?: string[] };
    triage?: {
      considered?: number;
      survivors?: number;
      capped_off?: number;
      dropped?: Record<string, number>;
      book_size?: number;
    };
    enrich?: {
      attempted?: number;
      with_about?: number;
      with_person?: number;
      with_fit?: number;
      failed?: number;
    };
    land?: {
      accounts?: number;
      sdr_calls?: number;
      first_sdr_day?: string;
      inserted_accounts?: number;
      inserted_sdr?: number;
      skipped?: { name: string | null; why: string }[];
    };
  };
};

type Busy = null | "search" | "enrich" | "land";
type SortKey = "triage" | "name" | "rating" | "reviews";

/** What the poll is watching. `elapsedMs` is measured in the polling loop and
 *  carried in, rather than read off the clock while rendering: a component that
 *  calls Date.now() during render is not idempotent (react-hooks/purity), and
 *  the poll is the only thing that should be moving this line anyway. It is
 *  what turns "queued" into "waiting on your Mac" once it has been long
 *  enough. */
type Progress = { stage: Exclude<Busy, null>; status: "pending" | "running"; elapsedMs: number };

/** How often the browser asks. The work is 30-60 seconds; a poll a second and a
 *  half is responsive without being a load, and each one reads status only, not
 *  the result payload. */
const POLL_MS = 1500;

/** Queued longer than this and the honest word is not "queued", it is "waiting
 *  on your Mac". The worker polls every 2 seconds when it is up, so anything
 *  past this is the Mac being asleep or the worker being down. */
const WAITING_AFTER_MS = 20_000;

/** The ceiling. A search is a minute, an enrich of 25 sites is a few. Past this
 *  the screen stops waiting and says so; the job itself stays in the queue. */
const GIVE_UP_MS = 180_000;

const RUNNING_LINE: Record<Exclude<Busy, null>, string> = {
  search: "Searching Google from your Mac",
  enrich: "Reading their websites from your Mac",
  land: "Adding them from your Mac",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SearchClient() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [query, setQuery] = useState("medical spa");

  const [minReviews, setMinReviews] = useState("30");
  const [minRating, setMinRating] = useState("4.0");
  const [minTriage, setMinTriage] = useState("45");
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireWebsite, setRequireWebsite] = useState(true);
  const [narrowType, setNarrowType] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("triage");

  const [meta, setMeta] = useState<StageReply | null>(null);
  const [enrichMeta, setEnrichMeta] = useState<StageReply["stages"] | null>(null);
  const [landMeta, setLandMeta] = useState<StageReply | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const canSearch = pins.length >= 3 && query.trim().length > 0 && busy === null;

  /**
   * Queue one stage and wait for the Mac to answer it.
   *
   * POST is an insert and always succeeds from anywhere. Everything after it is
   * polling one row. A poll that fails is NOT a failure of the run: the run is
   * on the Mac and unaffected by a dropped request from this tab, so a bad poll
   * is skipped and the next one asks again. Only the ceiling stops the wait.
   */
  const post = useCallback(
    async (stage: Exclude<Busy, null>, payload: Record<string, unknown>): Promise<StageReply | null> => {
      let job: string;
      try {
        const res = await fetch("/nutribiotic/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, stage }),
        });
        const json = (await res.json()) as StageReply & { job?: string };
        if (!res.ok || !json.ok || !json.job) {
          setFailure([json.error, json.detail].filter(Boolean).join("\n") || "The run was not queued.");
          return null;
        }
        job = json.job;
      } catch {
        setFailure("Could not reach the OS to queue this. Nothing ran.");
        return null;
      }

      const since = Date.now();
      setProgress({ stage, status: "pending", elapsedMs: 0 });
      let last: "pending" | "running" = "pending";

      for (;;) {
        await sleep(POLL_MS);

        let json: (StageReply & { status?: string }) | null = null;
        try {
          const res = await fetch(`/nutribiotic/api/search?job=${encodeURIComponent(job)}`, {
            cache: "no-store",
          });
          json = (await res.json()) as StageReply & { status?: string };
        } catch {
          json = null; // a dropped poll, not a dropped run
        }

        if (json && (json.status === "pending" || json.status === "running")) {
          last = json.status;
        }
        // The counter keeps moving even through a poll that did not come back,
        // because the wait is real whether or not this tab heard about it.
        setProgress({ stage, status: last, elapsedMs: Date.now() - since });

        if (json && json.status && json.status !== "pending" && json.status !== "running") {
          setProgress(null);
          if (!json.ok && (json.errors ?? []).length > 0) {
            setFailure(json.errors!.join("\n"));
            return null;
          }
          if (!json.ok) {
            setFailure([json.error, json.detail].filter(Boolean).join("\n"));
            return null;
          }
          return json;
        }

        if (Date.now() - since > GIVE_UP_MS) {
          setProgress(null);
          setFailure(
            last === "running"
              ? "This started on your Mac and has not finished in three minutes. It is still running there. Nothing has been lost."
              : "Your Mac has not picked this up in three minutes, so nothing has run yet. It stays queued and will start once the Mac is awake.",
          );
          return null;
        }
      }
    },
    [],
  );

  async function runSearch() {
    setBusy("search");
    setFailure(null);
    setLandMeta(null);
    setEnrichMeta(null);
    const reply = await post("search", {
      category: query.trim(),
      polygon: pins,
      min_review_count: Number.parseInt(minReviews, 10),
      min_rating: Number.parseFloat(minRating),
      min_triage_score: Number.parseFloat(minTriage),
      require_phone: requirePhone,
      require_website: requireWebsite,
      included_type: narrowType ? "auto" : "",
    });
    if (reply) {
      setMeta(reply);
      setRows(reply.candidates ?? []);
      // A new list is a new question. Carrying a tick across it would land a
      // business Juan picked out of a different search.
      setSelected(new Set());
      setExpanded(new Set());
    }
    setBusy(null);
  }

  async function runEnrich() {
    if (!rows) return;
    setBusy("enrich");
    setFailure(null);
    const picked = rows.filter((r) => selected.has(r.key));
    const reply = await post("enrich", { candidates: picked });
    if (reply) {
      const byKey = new Map((reply.candidates ?? []).map((c) => [c.key, c]));
      // Merged in place, so the table does not reorder or reset under him and
      // the ticks stay exactly where they were.
      setRows(rows.map((r) => byKey.get(r.key) ?? r));
      setEnrichMeta(reply.stages ?? null);
    }
    setBusy(null);
  }

  async function runLand() {
    if (!rows) return;
    setBusy("land");
    setFailure(null);
    const picked = rows.filter((r) => selected.has(r.key) && !r.id);
    const reply = await post("land", {
      category: query.trim(),
      candidates: picked,
      write: true,
    });
    if (reply) {
      const byKey = new Map((reply.candidates ?? []).map((c) => [c.key, c]));
      setRows(rows.map((r) => (byKey.has(r.key) ? { ...r, id: byKey.get(r.key)!.id } : r)));
      setLandMeta(reply);
      // Only what actually landed loses its tick. Anything the server skipped
      // stays ticked and stays visible, because it did not happen.
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of byKey.keys()) next.delete(k);
        return next;
      });
    }
    setBusy(null);
  }

  const sorted = useMemo(() => {
    if (!rows) return [];
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sort === "rating") return (b.places_rating ?? 0) - (a.places_rating ?? 0);
      if (sort === "reviews") return (b.places_rating_count ?? 0) - (a.places_rating_count ?? 0);
      return b.triage_score - a.triage_score;
    });
    return copy;
  }, [rows, sort]);

  const selectable = sorted.filter((r) => !r.id);
  const selectedRows = sorted.filter((r) => selected.has(r.key));
  const selectedUnlanded = selectedRows.filter((r) => !r.id);
  const selectedEnriched = selectedUnlanded.filter((r) => r.enriched).length;
  const anyEnriched = sorted.some((r) => r.enriched);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size >= selectable.length ? new Set() : new Set(selectable.map((r) => r.key)),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* THE QUERY BAR. One line, the whole width, the thing you type in first.
          Everything else on this screen narrows what it returns. */}
      <div className={`${panel} p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A928C]">
              <Ico name="search" size={15} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSearch) runSearch();
              }}
              placeholder="What kind of business? medical spa, health food store, chiropractor..."
              aria-label="What kind of business to search for"
              className="w-full rounded-md border border-[#E2DFD5] bg-[#FAF9F5] py-2.5 pl-9 pr-3 text-[14px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
            />
          </div>
          <button type="button" onClick={runSearch} disabled={!canSearch} className={primaryBtn}>
            {busy === "search" ? "Searching..." : "Search this area"}
          </button>
        </div>
      </div>

      {/* THE AREA AND THE FILTERS, SIDE BY SIDE. The area is the bigger of the
          two because it is the control that decides most of the answer. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-[460px] lg:h-[520px]">
          <AreaPicker pins={pins} onChange={setPins} disabled={busy !== null} />
        </div>

        <div className={`${panel} flex h-fit flex-col`}>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex items-center justify-between gap-2 border-b border-[#E2DFD5] px-3 py-2.5 text-left"
          >
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Filters</span>
            <Ico name={filtersOpen ? "chevron-up" : "chevron-down"} size={13} />
          </button>

          <div className={filtersOpen ? "flex flex-col gap-3 p-3" : "hidden"}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="min-reviews">
                  Min reviews
                </label>
                <input
                  id="min-reviews"
                  className={inputCls}
                  inputMode="numeric"
                  value={minReviews}
                  onChange={(e) => setMinReviews(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="min-rating">
                  Min rating
                </label>
                <input
                  id="min-rating"
                  className={inputCls}
                  inputMode="decimal"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="min-triage">
                Min triage score
              </label>
              <input
                id="min-triage"
                className={inputCls}
                inputMode="numeric"
                value={minTriage}
                onChange={(e) => setMinTriage(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-[#EFEDE5] pt-3">
              <Check
                checked={requirePhone}
                onChange={setRequirePhone}
                label="Must have a phone"
                hint="The SDR queue is a list of numbers to call."
              />
              <Check
                checked={requireWebsite}
                onChange={setRequireWebsite}
                label="Must have a website"
                hint="Look further reads the site. With no site there is nothing to read."
              />
              <Check
                checked={narrowType}
                onChange={setNarrowType}
                label="Let Google filter the category"
                hint="Sends the mapped Places type on the search itself, so a nail salon never comes back from a medical-spa sweep."
              />
            </div>
          </div>
        </div>
      </div>

      {progress && <ProgressLine progress={progress} />}

      {/* A stop, stated plainly. No icon, no tinted box: this screen already
          distinguishes "waiting" from "failed" above, so what is left here is
          one sentence about what did not happen. */}
      {failure && (
        <div className={`${panel} px-3.5 py-2.5`}>
          <span className="whitespace-pre-wrap text-[13px] text-[#3D4A44]">{failure}</span>
        </div>
      )}

      {meta && <RunBar meta={meta} enrich={enrichMeta} rows={sorted.length} />}

      {landMeta?.written && (
        <SuccessNote
          title={`${landMeta.stages?.land?.inserted_accounts ?? 0} prospect${
            (landMeta.stages?.land?.inserted_accounts ?? 0) === 1 ? "" : "s"
          } added, ${landMeta.stages?.land?.inserted_sdr ?? 0} call${
            (landMeta.stages?.land?.inserted_sdr ?? 0) === 1 ? "" : "s"
          } queued from ${landMeta.stages?.land?.first_sdr_day ?? ""}.`}
          detail="They are in the OS as prospects and on the SDR queue. None of them is in HubSpot: a prospect earns a portal record the day a real call or visit is logged against it."
        />
      )}

      {(landMeta?.stages?.land?.skipped ?? []).length > 0 && (
        <div className={`${panel} p-3 text-[12.5px] text-[#A0762C]`}>
          Not added, already in the book:{" "}
          {(landMeta!.stages!.land!.skipped ?? []).map((s) => s.name).join(", ")}
        </div>
      )}

      {rows && (
        <ResultsTable
          rows={sorted}
          selected={selected}
          expanded={expanded}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onExpand={(k) =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              return next;
            })
          }
          sort={sort}
          onSort={setSort}
          selectableCount={selectable.length}
          anyEnriched={anyEnriched}
        />
      )}

      {/* THE ACTION BAR, and it only exists once something is ticked. Each
          button names exactly what it will do to exactly how many rows, and
          the second one is the only thing on this screen that writes. */}
      {selectedUnlanded.length > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-[#14201B] bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(20,32,27,0.12)]">
          <span className="text-[13px] font-medium tabular-nums text-[#14201B]">
            {selectedUnlanded.length} selected
          </span>
          <span className="text-[12px] text-[#8A928C]">
            {selectedEnriched} of them already looked into
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runEnrich}
              disabled={busy !== null}
              className={secondaryBtn}
              title="Read these businesses' own websites for an about line, a named decision maker and which of our categories they mention"
            >
              <Ico name="globe" size={13} />
              {busy === "enrich"
                ? "Reading their sites..."
                : `Look further into ${selectedUnlanded.length}`}
            </button>
            <button
              type="button"
              onClick={runLand}
              disabled={busy !== null}
              className={primaryBtn}
              title="Add these as prospects in the OS and queue an SDR call for each"
            >
              <Ico name="phone-arrow" size={13} />
              {busy === "land" ? "Adding..." : `Add ${selectedUnlanded.length} to SDR`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Where the run is, in one muted line.
 *
 * Three states, and the middle one is the one that used to be a 503 with the
 * word "unreachable" in it: a job the Mac has not claimed yet is QUEUED, which
 * is recoverable and normal, not an error. Past WAITING_AFTER_MS it says so in
 * Juan's terms, "waiting on your Mac", because that names both the cause and
 * the fix. The elapsed counter is there so a stall is visible without anyone
 * having to describe one.
 */
function ProgressLine({ progress }: { progress: Progress }) {
  const elapsed = Math.max(0, Math.round(progress.elapsedMs / 1000));
  const waiting = progress.status === "pending" && progress.elapsedMs > WAITING_AFTER_MS;
  const label =
    progress.status === "running"
      ? RUNNING_LINE[progress.stage]
      : waiting
        ? "Waiting on your Mac. This starts as soon as it is awake."
        : "Queued";

  return (
    <div className={`${panel} flex items-center justify-between gap-3 px-3.5 py-2.5`}>
      <span className="text-[12.5px] text-[#8A928C]">{label}</span>
      <span className="text-[12.5px] tabular-nums text-[#A9AFA9]">{elapsed}s</span>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[#14201B]"
      />
      <span>
        <span className="block text-[12.5px] text-[#3D4A44]">{label}</span>
        <span className="block text-[11.5px] leading-snug text-[#8A928C]">{hint}</span>
      </span>
    </label>
  );
}

/** The receipt for the last search: what Google returned, what the filters cut,
 *  and why. Every number here comes off the script's own summary. */
function RunBar({
  meta,
  enrich,
  rows,
}: {
  meta: StageReply;
  enrich: StageReply["stages"] | null;
  rows: number;
}) {
  const search = meta.stages?.search ?? {};
  const triage = meta.stages?.triage ?? {};
  const dropped = Object.entries(triage.dropped ?? {}).sort((a, b) => b[1] - a[1]);
  const ceiling = (search.hit_google_ceiling ?? []).length > 0;
  const [open, setOpen] = useState(false);
  const e = enrich?.enrich;

  return (
    <div className={panel}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3.5 py-2.5">
        <Stat label="Returned by Google" value={search.distinct_places ?? 0} />
        <Stat label="Passed the filters" value={triage.survivors ?? 0} />
        <Stat label="On this list" value={rows} />
        {e && <Stat label="Sites read" value={e.attempted ?? 0} />}
        <div className="ml-auto flex items-center gap-3 text-[12px] text-[#8A928C]">
          <span className="tabular-nums">
            {search.live_calls ?? 0} live Places call{(search.live_calls ?? 0) === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums">
            {triage.book_size ?? 0} already in the book
          </span>
          {dropped.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-[#3D4A44] underline-offset-2 hover:underline"
            >
              <Ico name={open ? "chevron-up" : "chevron-down"} size={12} />
              Dropped, and why
            </button>
          )}
        </div>
      </div>

      {ceiling && (
        <div className="flex items-start gap-1.5 border-t border-[#EFEDE5] px-3.5 py-2 text-[12.5px] text-[#A0762C]">
          <Ico name="alert" size={14} />
          <span>
            This search came back at Google{"'"}s 60-result ceiling, so it is whichever 60 it picked
            and not everything in the area. Draw a smaller area and search again.
          </span>
        </div>
      )}

      {(triage.capped_off ?? 0) > 0 && (
        <div className="border-t border-[#EFEDE5] px-3.5 py-2 text-[12.5px] text-[#A0762C]">
          {triage.capped_off} more passed the filters than one list shows. The highest triage scores
          are kept.
        </div>
      )}

      {e && (
        <div className="border-t border-[#EFEDE5] px-3.5 py-2 text-[12.5px] text-[#5B6560]">
          Read {e.attempted ?? 0} site{(e.attempted ?? 0) === 1 ? "" : "s"}: {e.with_about ?? 0} state
          something about themselves, {e.with_person ?? 0} name a person, {e.with_fit ?? 0} mention
          our categories, {e.failed ?? 0} would not load.
        </div>
      )}

      {open && dropped.length > 0 && (
        <div className="grid gap-x-8 gap-y-1 border-t border-[#EFEDE5] px-3.5 py-2.5 sm:grid-cols-2">
          {dropped.map(([why, n]) => (
            <div key={why} className="flex items-baseline gap-2 text-[12.5px] text-[#5B6560]">
              <span className="w-8 shrink-0 text-right font-medium tabular-nums text-[#14201B]">
                {n}
              </span>
              <span>{why}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-[#8A928C]">{label}</div>
      <div className="font-[family-name:var(--font-fraunces)] text-[20px] leading-none font-semibold tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}

function ResultsTable({
  rows,
  selected,
  expanded,
  onToggle,
  onToggleAll,
  onExpand,
  sort,
  onSort,
  selectableCount,
  anyEnriched,
}: {
  rows: Candidate[];
  selected: Set<string>;
  expanded: Set<string>;
  onToggle: (k: string) => void;
  onToggleAll: () => void;
  onExpand: (k: string) => void;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  selectableCount: number;
  anyEnriched: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className={`${panel} p-5 text-[13.5px] leading-relaxed text-[#5B6560]`}>
        Nothing in that area passed these filters. That is a finding, not an error: lower the review
        or rating floor, turn off a requirement, or draw the area somewhere else.
      </div>
    );
  }

  return (
    <div className={`${panel} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E2DFD5] bg-[#FAF9F5] text-[11px] uppercase tracking-[0.1em] text-[#8A928C]">
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select every row"
                  checked={selectableCount > 0 && selected.size >= selectableCount}
                  onChange={onToggleAll}
                  className="accent-[#14201B]"
                />
              </th>
              <SortTh label="Business" k="name" sort={sort} onSort={onSort} />
              <th className={th}>Address</th>
              <th className={th}>Phone</th>
              <SortTh label="Rating" k="rating" sort={sort} onSort={onSort} align="right" />
              <SortTh label="Reviews" k="reviews" sort={sort} onSort={onSort} align="right" />
              <th className={th}>Website</th>
              <SortTh label="Triage" k="triage" sort={sort} onSort={onSort} align="right" />
              {anyEnriched && <th className={th}>Decision maker</th>}
              {anyEnriched && <th className={th}>Fit</th>}
              {anyEnriched && <th className={th}>About</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDEBE3]">
            {rows.map((r) => {
              const isOpen = expanded.has(r.key);
              const cols = 8 + (anyEnriched ? 3 : 0);
              return (
                <Fragment key={r.key}>
                  <tr
                    className={`transition-colors hover:bg-[#FAF9F5] ${
                      selected.has(r.key) ? "bg-[#F4F2EA]" : ""
                    }`}
                  >
                    <td className="px-3 py-2 align-top">
                      {r.id ? (
                        <span title="Already added as a prospect" className="text-[#3D6B4A]">
                          <Ico name="check" size={14} />
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.name ?? "this business"}`}
                          checked={selected.has(r.key)}
                          onChange={() => onToggle(r.key)}
                          className="accent-[#14201B]"
                        />
                      )}
                    </td>
                    <td className={td}>
                      <div className="font-medium text-[#14201B]">{r.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[#8A928C]">
                        {r.city}
                        {r.id && (
                          <span className="rounded-full bg-[#E7EDE4] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#3D6B4A]">
                            In SDR
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${td} max-w-[230px] text-[12.5px] text-[#5B6560]`}>
                      {r.address}
                    </td>
                    <td className={`${td} whitespace-nowrap text-[12.5px]`}>
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="text-[#3D4A44] hover:underline">
                          {r.phone}
                        </a>
                      )}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {r.places_rating != null && (
                        <span title={`${r.places_rating} out of 5 on Google`}>
                          {r.places_rating.toFixed(1)}
                          <span className="text-[11px] text-[#A9AFA9]"> / 5</span>
                        </span>
                      )}
                    </td>
                    <td className={`${td} text-right tabular-nums text-[#5B6560]`}>
                      {r.places_rating_count ?? null}
                    </td>
                    <td className={`${td} max-w-[170px] text-[12.5px]`}>
                      {r.website && (
                        <a
                          href={r.website.startsWith("http") ? r.website : `https://${r.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 truncate text-[#3D4A44] hover:underline"
                        >
                          <Ico name="external" size={11} />
                          <span className="truncate">{hostOf(r.website)}</span>
                        </a>
                      )}
                    </td>
                    <td className={`${td} text-right font-medium tabular-nums`}>
                      {r.triage_score.toFixed(0)}
                    </td>

                    {anyEnriched && (
                      <td className={`${td} text-[12.5px] text-[#3D4A44]`}>
                        {r.decision_maker_candidate}
                      </td>
                    )}
                    {anyEnriched && (
                      <td className={td}>
                        <div className="flex flex-wrap gap-1">
                          {r.fit_tags.map((t) => (
                            <span
                              key={t}
                              className="whitespace-nowrap rounded-full border border-[#E2DFD5] px-1.5 py-0.5 text-[11px] text-[#5B6560]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                    )}
                    {anyEnriched && (
                      <td className={`${td} max-w-[280px] text-[12.5px] text-[#5B6560]`}>
                        {r.about ? (
                          <button
                            type="button"
                            onClick={() => onExpand(r.key)}
                            aria-expanded={isOpen}
                            className="text-left underline-offset-2 hover:underline"
                          >
                            <span className={isOpen ? "" : "line-clamp-2"}>{r.about}</span>
                          </button>
                        ) : r.enriched && r.site_failures.length > 0 ? (
                          <span className="text-[#A0762C]">site would not load</span>
                        ) : null}
                      </td>
                    )}
                  </tr>

                  {isOpen && (
                    <tr className="bg-[#FAF9F5]">
                      <td />
                      <td colSpan={cols - 1} className="px-3 pb-3 pt-0">
                        <div className="flex flex-col gap-1.5 text-[12.5px] text-[#5B6560]">
                          {r.about_url && (
                            <a
                              href={r.about_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-fit items-center gap-1 text-[#3D4A44] hover:underline"
                            >
                              <Ico name="external" size={11} />
                              {r.about_basis} · {r.about_url}
                            </a>
                          )}
                          {r.decision_maker_found_by && (
                            <span>Named at {r.decision_maker_found_by}</span>
                          )}
                          {r.catalog_terms.length > 0 && (
                            <span>Site mentions: {r.catalog_terms.slice(0, 14).join(", ")}</span>
                          )}
                          {r.site_failures.length > 0 && (
                            <span className="text-[#A0762C]">{r.site_failures.join(" · ")}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`${th} ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.1em] ${
          sort === k ? "text-[#14201B]" : ""
        }`}
      >
        {label}
        {sort === k && <Ico name="chevron-down" size={10} />}
      </button>
    </th>
  );
}

/** The host, for a column that has 170px. The full URL is what the link goes
 *  to; a truncated middle of a tracking query is not information. */
function hostOf(website: string): string {
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).host.replace(
      /^www\./,
      "",
    );
  } catch {
    return website;
  }
}
