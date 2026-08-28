"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReportDraft, ReportHqNote, RouteEndpoint } from "./dal";
import { actionDecideReport, actionRenderPreview, actionRequestRebuild, actionSaveReportEdits } from "./report-actions";
import { RouteEndpointField } from "../map/RouteEndpointField";
import { Ico, SuccessNote } from "./ui";

const HQ_CATEGORIES = [
  "FORMULATION & PRODUCT",
  "DISCOUNTS & PRICING",
  "ENTERPRISE & HQ ACCESS",
  "COMPETITIVE INTEL",
  "OTHER",
];

type StopEdit = { hidden: boolean; call_only: boolean; message_only: boolean };

/**
 * Tonight's report, before it goes out.
 *
 * Juan, 2026-08-27: "I want to be able to edit the current report before it
 * goes to my inbox to make sure that all the details are right and that the
 * map looks right... just so I don't have to edit after the fact." And, on the
 * timing: "not necessarily a 7pm daily thing, just like after the day is done
 * and before the 10pm cron."
 *
 * THE PREVIEW IS THE ARTIFACT. The button opens the actual PDF the Mac
 * rendered from this payload, map included, not a second rendering of the same
 * data in the browser. Two renderings would eventually disagree, and the one
 * he checked would not be the one that got mailed. The cost is that after an
 * edit the PDF is briefly behind the payload, which the screen says outright
 * rather than showing a stale map as though it were final.
 *
 * WHAT IS EDITABLE is only what the OS owns: the HQ notes, each stop's
 * classification, and the mileage. Every other line on the report is a HubSpot
 * record and is corrected in HubSpot. Nothing on this screen writes to the CRM.
 */
export function ReportReview({
  draft,
  previewUrl,
  archivedUrl,
  home,
}: {
  draft: ReportDraft;
  previewUrl: string | null;
  /** The actual daily-{date}.pdf from the Reports archive, when one exists
   *  (2026-08-28, "I need to be able to see what was sent... refer to from
   *  the archives, you do have this information already"). This is the real
   *  artifact for a sent day -- draft-{date}.pdf (previewUrl) is only the
   *  pre-send preview and often doesn't exist any more once a day is sent
   *  (see 2026-08-27's correction, which cleared it). Once sent, archivedUrl
   *  is what's shown; previewUrl only matters while still pending. */
  archivedUrl: string | null;
  /** Juan's apartment, for the start/end pickers' "Home" quick-pick. Null if
      the waypoint account is missing -- the pickers still work, just without
      that shortcut, same as RouteEndpointField on the Map screen. */
  home: RouteEndpoint | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const shownUrl = draft.status === "sent" && archivedUrl ? archivedUrl : previewUrl;

  const payload = draft.payload;
  const stops = payload?.stops ?? [];
  const followUps = payload?.follow_ups ?? [];

  // Display order, as the stop `n` values in the order Juan arranged them.
  // Starts as the payload's own order (HubSpot chronological, what
  // build_report() gave it). Move buttons only reorder this local array --
  // the actual reordering of payload.stops happens server-side in
  // actionSaveReportEdits, once, on save, same read-modify-write discipline
  // as every other edit here.
  const [order, setOrder] = useState<number[]>(() => stops.map((s) => s.n ?? 0));
  const orderedStops = order
    .map((n) => stops.find((s) => s.n === n))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  function moveStop(n: number, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(n);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const [hqNotes, setHqNotes] = useState<ReportHqNote[]>(payload?.hq_notes ?? []);
  const [miles, setMiles] = useState<string>(
    payload?.miles_override != null ? String(payload.miles_override) : "",
  );
  // null = use the route plan's resolved default (payload.route_start/_end,
  // set by field_report.py's route_endpoints_for -- not always home anymore,
  // see 2026-08-27). A picked value is Juan overriding that default because
  // it's wrong or nothing was ever planned.
  const [routeStart, setRouteStart] = useState<RouteEndpoint | null>(payload?.route_start_override ?? null);
  const [routeEnd, setRouteEnd] = useState<RouteEndpoint | null>(payload?.route_end_override ?? null);
  const [stopEdits, setStopEdits] = useState<Record<string, StopEdit>>(() =>
    Object.fromEntries(
      stops.map((s) => [
        String(s.n),
        {
          hidden: Boolean(s.hidden),
          call_only: Boolean(s.is_call_only),
          message_only: Boolean(s.is_message_only),
        },
      ]),
    ),
  );

  const sent = draft.status === "sent";
  const locked = sent || pending;

  function currentEdits() {
    return {
      hqNotes,
      miles: miles.trim() === "" ? null : Number(miles),
      routeStart,
      routeEnd,
      stops: stopEdits,
      order,
    };
  }

  function save(then?: () => void) {
    startTransition(async () => {
      await actionSaveReportEdits(draft.report_date, currentEdits());
      setSaved("Saved. The preview is re-rendering.");
      then?.();
      router.refresh();
    });
  }

  function decide(decision: "approved" | "held" | "pending") {
    startTransition(async () => {
      // Save first, always: approving something he edited but did not save
      // would mail the version he was looking away from.
      await actionSaveReportEdits(draft.report_date, currentEdits());
      await actionDecideReport(draft.report_date, decision, "daily");
      setSaved(
        decision === "approved"
          ? "Approved. It goes out on the next pass, within a few minutes."
          : decision === "held"
            ? "Held. Nothing goes out tonight unless you release it."
            : "Back to pending.",
      );
      router.refresh();
    });
  }

  const statusLine = sent
    ? `Sent ${draft.sent_at ? new Date(draft.sent_at).toLocaleString("en-US") : ""}`
    : draft.status === "approved"
      ? "Approved, sending on the next pass"
      : draft.status === "held"
        ? "Held. Nothing goes out tonight."
        : draft.rebuild_requested
          ? "Rebuilding from today's data…"
          : draft.dirty
            ? "Preview is re-rendering from your edits…"
            : "Waiting on you";

  return (
    <section className="mb-8 rounded-xl border border-[#E2DFD5] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
          Tonight&rsquo;s report
        </h2>
        <span className={`text-[12.5px] ${draft.status === "held" ? "text-[#8A6D2F]" : "text-[#8A928C]"}`}>
          {statusLine}
        </span>
      </div>

      {draft.send_error && (
        <div className="mb-4 flex items-start gap-1.5 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[12.5px] text-[#8A6D2F]">
          <Ico name="alert" size={13} />
          <span>{draft.send_error}</span>
        </div>
      )}

      {!payload ? (
        archivedUrl ? (
          <div>
            <p className="mb-3 text-[13.5px] text-[#5B6560]">
              No draft on file for {draft.report_date}, but a report was sent that day.
            </p>
            <a
              href={archivedUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-5 inline-flex items-center gap-1.5 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90"
            >
              <Ico name="external" size={13} />
              Open the sent PDF
            </a>
            <div className="overflow-hidden rounded-lg border border-[#E2DFD5]">
              <iframe src={archivedUrl} title={`Sent report, ${draft.report_date}`} className="h-[70vh] w-full" />
            </div>
          </div>
        ) : (
          <div className="text-[13.5px] text-[#5B6560]">
            <p className="mb-3">Nothing built or sent for {draft.report_date} yet.</p>
            <button
              onClick={() => startTransition(async () => {
                await actionRequestRebuild(draft.report_date);
                router.refresh();
              })}
              disabled={pending}
              className="rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Asking…" : "Build this day's report"}
            </button>
          </div>
        )
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {shownUrl ? (
              <a
                href={shownUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90"
              >
                <Ico name="external" size={13} />
                {shownUrl === archivedUrl ? "Open the sent PDF" : "Open the draft PDF"}
              </a>
            ) : (
              <button
                onClick={() => startTransition(async () => {
                  await actionRenderPreview(draft.report_date, "daily");
                  router.refresh();
                })}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {pending ? "Rendering…" : "Render preview"}
              </button>
            )}
            {!sent && (
              <button
                onClick={() => startTransition(async () => {
                  await actionRequestRebuild(draft.report_date);
                  router.refresh();
                })}
                disabled={locked}
                title="Re-query HubSpot and rebuild from scratch. Discards the edits below."
                className="rounded-md border border-[#E2DFD5] px-3 py-2 text-[12.5px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
              >
                Rebuild from today&rsquo;s data
              </button>
            )}
            {draft.dirty && (
              <span className="text-[12px] text-[#8A6D2F]">
                The PDF is behind{sent ? "" : " your edits"}. It re-renders within a few minutes.
              </span>
            )}
          </div>

          {/* THE DRAFT, INLINE. Juan, 2026-08-28: he wants to see the report
              itself on this screen while confirming it, not just an edit form
              plus a link that leaves the page. This is the same artifact the
              "Open" link above points to (render_pdf(render_html(payload)) on
              the Mac) -- one rendering, shown two ways, never a second one
              that could disagree with what actually mails. Once sent, this is
              archivedUrl (the real daily-{date}.pdf), not the pre-send draft. */}
          {shownUrl && !draft.dirty && (
            <div className="mb-5 overflow-hidden rounded-lg border border-[#E2DFD5]">
              <iframe
                src={shownUrl}
                title={`Report, ${draft.report_date}`}
                className="h-[70vh] w-full"
              />
            </div>
          )}

          {/* START/END. field_report.py resolves these from the route plan
              (route_start/route_end -- migration 0040, not always home
              anymore since the 2026-08-27 fix: a day never assumes Manhattan
              Beach when a hotel was actually planned). Overriding here is for
              when that default is still wrong, or nothing was ever planned. */}
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Route starts</div>
              {sent ? (
                <span className="text-[13.5px] text-[#5B6560]">
                  {(routeStart ?? payload.route_start ?? home)?.label ?? "—"}
                </span>
              ) : (
                <RouteEndpointField
                  value={routeStart}
                  home={home}
                  fallback={payload.route_start ?? home}
                  onChange={setRouteStart}
                />
              )}
            </div>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Route ends</div>
              {sent ? (
                <span className="text-[13.5px] text-[#5B6560]">
                  {(routeEnd ?? payload.route_end ?? home)?.label ?? "—"}
                </span>
              ) : (
                <RouteEndpointField
                  value={routeEnd}
                  home={home}
                  fallback={payload.route_end ?? home}
                  onChange={setRouteEnd}
                />
              )}
            </div>
          </div>

          {/* STOPS. The three toggles are exactly the ones that decide what the
              map draws and what the mileage counts, which is where the keyword
              heuristics are wrong most often. The move buttons only change
              display/mileage order (2026-08-28 ask, "move things around") --
              same up/down convention as the route plan's own reorder controls
              on /nutribiotic/map, not drag-and-drop, which doesn't hold up on
              a phone. */}
          <div className="mb-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
              Stops · {stops.filter((s) => !stopEdits[String(s.n)]?.hidden).length} of {stops.length}
            </div>
            {orderedStops.length === 0 ? (
              <p className="text-[13px] text-[#8A928C]">No stops on this day.</p>
            ) : (
              <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5]">
                {orderedStops.map((s, i) => {
                  const key = String(s.n);
                  const n = s.n ?? 0;
                  const e = stopEdits[key] ?? { hidden: false, call_only: false, message_only: false };
                  const set = (patch: Partial<StopEdit>) =>
                    setStopEdits((prev) => ({ ...prev, [key]: { ...e, ...patch } }));
                  return (
                    <li
                      key={key}
                      className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${e.hidden ? "opacity-45" : ""}`}
                    >
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => moveStop(n, -1)}
                          disabled={locked || i === 0}
                          aria-label={`Move ${s.name} earlier`}
                          className="rounded-md border border-[#E2DFD5] bg-white p-1 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Ico name="chevron-up" size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStop(n, 1)}
                          disabled={locked || i === orderedStops.length - 1}
                          aria-label={`Move ${s.name} later`}
                          className="rounded-md border border-[#E2DFD5] bg-white p-1 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Ico name="chevron-down" size={12} />
                        </button>
                      </div>
                      <span className="w-5 shrink-0 text-[12px] tabular-nums text-[#8A928C]">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">
                        {s.name}
                        {s.city && <span className="text-[#8A928C]"> · {s.city}</span>}
                        {s.lat == null && (
                          <span className="ml-1.5 text-[11.5px] text-[#8A6D2F]">no coordinates, off the map</span>
                        )}
                      </span>
                      <div className="flex shrink-0 gap-1.5">
                        <Toggle on={e.call_only} onClick={() => set({ call_only: !e.call_only })} disabled={locked}>
                          Call only
                        </Toggle>
                        <Toggle
                          on={e.message_only}
                          onClick={() => set({ message_only: !e.message_only })}
                          disabled={locked}
                        >
                          Message
                        </Toggle>
                        <Toggle on={e.hidden} onClick={() => set({ hidden: !e.hidden })} disabled={locked} danger>
                          Hide
                        </Toggle>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* FOLLOW-UPS. Companies with an open HubSpot Task and no visit this
              window (assemble_stops() in field_report.py) -- accounts that need
              more work, not stops that happened. Read-only: the task itself is
              corrected in HubSpot, not here, this is just where Juan confirms
              nothing due got missed before the day goes out. */}
          {followUps.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
                Needs follow-up · {followUps.length}
              </div>
              <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5]">
                {followUps.map((f, i) => (
                  <li key={f.hubspot_id ?? i} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-medium">
                        {f.name}
                        {f.city && <span className="font-normal text-[#8A928C]"> · {f.city}</span>}
                      </span>
                      {f.due && (
                        <span className="shrink-0 text-[11.5px] text-[#8A6D2F]">
                          due {new Date(f.due).toLocaleDateString("en-US")}
                        </span>
                      )}
                    </div>
                    {f.body && <p className="mt-1 text-[12.5px] leading-relaxed text-[#5B6560]">{f.body}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* MILEAGE. Blank means recompute from whatever stops are still
              visible, which is what has to happen after hiding one. */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <label className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]" htmlFor="miles">
              Miles
            </label>
            <input
              id="miles"
              inputMode="numeric"
              value={miles}
              disabled={locked}
              onChange={(ev) => setMiles(ev.target.value.replace(/[^\d]/g, ""))}
              placeholder={payload.miles != null ? String(payload.miles) : "—"}
              className="w-24 rounded-md border border-[#E2DFD5] px-2.5 py-1.5 text-[14px] tabular-nums focus:border-[#14201B] focus:outline-none disabled:opacity-50"
            />
            <span className="text-[12px] text-[#8A928C]">
              Leave blank to recompute from the stops above.
            </span>
          </div>

          {/* HQ NOTES. The one free-text section: model-drafted, no upstream
              record to contradict, so editing it is authorship. */}
          <div className="mb-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Notes to HQ</div>
            <div className="flex flex-col gap-2">
              {hqNotes.map((n, i) => (
                <div key={i} className="flex flex-wrap items-start gap-2">
                  <select
                    value={n.category}
                    disabled={locked}
                    onChange={(ev) =>
                      setHqNotes((prev) => prev.map((x, j) => (j === i ? { ...x, category: ev.target.value } : x)))
                    }
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-1.5 text-[12px] disabled:opacity-50"
                  >
                    {HQ_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={n.text}
                    disabled={locked}
                    rows={2}
                    onChange={(ev) =>
                      setHqNotes((prev) => prev.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)))
                    }
                    className="min-w-[220px] flex-1 rounded-md border border-[#E2DFD5] px-2.5 py-1.5 text-[13.5px] leading-relaxed focus:border-[#14201B] focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => setHqNotes((prev) => prev.filter((_, j) => j !== i))}
                    disabled={locked}
                    aria-label="Remove note"
                    className="rounded-md border border-[#E2DFD5] px-2 py-1.5 text-[12px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
                  >
                    <Ico name="close" size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setHqNotes((prev) => [...prev, { category: "OTHER", text: "", source: "Juan" }])}
                disabled={locked}
                className="self-start rounded-md border border-[#E2DFD5] px-3 py-1.5 text-[12.5px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
              >
                Add a note
              </button>
            </div>
          </div>

          {saved && <div className="mb-4"><SuccessNote title={saved} /></div>}

          {!sent && (
            <div className="flex flex-wrap gap-2 border-t border-[#EDEBE3] pt-4">
              <button
                onClick={() => decide("approved")}
                disabled={locked}
                className="rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {pending ? "Working…" : "Approve and send"}
              </button>
              <button
                onClick={() => save()}
                disabled={locked}
                className="rounded-md border border-[#E2DFD5] px-4 py-2 text-[13px] text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
              >
                Save edits
              </button>
              {draft.status === "held" ? (
                <button
                  onClick={() => decide("pending")}
                  disabled={locked}
                  className="rounded-md border border-[#E2DFD5] px-4 py-2 text-[13px] text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
                >
                  Release the hold
                </button>
              ) : (
                <button
                  onClick={() => decide("held")}
                  disabled={locked}
                  title="Nothing goes out tonight, including at the 10pm deadline."
                  className="rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-4 py-2 text-[13px] text-[#8A6D2F] transition-colors hover:opacity-90 disabled:opacity-40"
                >
                  Hold tonight
                </button>
              )}
            </div>
          )}

          <p className="mt-4 text-[11.5px] leading-relaxed text-[#8A928C]">
            Approving sends within a few minutes. If you never get to it, the report still goes out at 10pm
            with whatever edits you saved. Hold is how you stop that.
          </p>
        </>
      )}
    </section>
  );
}

function Toggle({
  on,
  onClick,
  disabled,
  danger,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-40 ${
        on
          ? danger
            ? "border-[#8A2E2E] bg-[#8A2E2E] text-[#F7F6F1]"
            : "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
          : "border-[#E2DFD5] bg-white text-[#5B6560] hover:bg-[#FAF9F5]"
      }`}
    >
      {children}
    </button>
  );
}

type WeeklyTotals = {
  touchpoints?: number;
  visits?: number;
  calls?: number;
  miles?: number;
  new_accounts?: number;
  accounts_closed?: number;
};

/**
 * This week's report (2026-08-28). The weekly companion to ReportReview
 * above, and deliberately a lighter one: weekly_report.py's payload has no
 * per-stop overlay to edit yet (see the "review gate" note at the top of
 * weekly_report.py) -- there's no single route to override, and mileage is
 * odometer-read, not geometry. View it, approve it, or hold it; that alone
 * closes the actual gap, which was that the weekly rollup mailed itself to
 * the employer every Friday with nobody having looked at it first.
 */
export function WeeklyReportReview({
  draft,
  previewUrl,
  archivedUrl,
}: {
  draft: ReportDraft;
  previewUrl: string | null;
  /** The real weekly-{start}_to_{end}.pdf, once sent -- same reasoning as
   *  ReportReview's archivedUrl. */
  archivedUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  const payload = draft.payload;
  if (!payload) return null;
  const shownUrl = draft.status === "sent" && archivedUrl ? archivedUrl : previewUrl;

  const sent = draft.status === "sent";
  const locked = sent || pending;
  const totals = (payload.totals as WeeklyTotals | undefined) ?? {};
  const rangeLabel = (payload.range_label as string | undefined) ?? draft.report_date;

  function decide(decision: "approved" | "held" | "pending") {
    startTransition(async () => {
      await actionDecideReport(draft.report_date, decision, "weekly");
      setSaved(
        decision === "approved"
          ? "Approved. It goes out on the next pass, within a few minutes."
          : decision === "held"
            ? "Held. Nothing goes out at Friday's deadline unless you release it."
            : "Back to pending.",
      );
      router.refresh();
    });
  }

  const statusLine = sent
    ? `Sent ${draft.sent_at ? new Date(draft.sent_at).toLocaleString("en-US") : ""}`
    : draft.status === "approved"
      ? "Approved, sending on the next pass"
      : draft.status === "held"
        ? "Held. Nothing goes out at Friday's deadline."
        : draft.dirty
          ? "Preview is rendering…"
          : "Waiting on you";

  return (
    <section className="mb-8 rounded-xl border border-[#E2DFD5] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
          This week&rsquo;s report · {rangeLabel}
        </h2>
        <span className={`text-[12.5px] ${draft.status === "held" ? "text-[#8A6D2F]" : "text-[#8A928C]"}`}>
          {statusLine}
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {([
          ["touchpoints", "Touchpoints"],
          ["visits", "Visits"],
          ["calls", "Calls"],
          ["miles", "Miles"],
          ["new_accounts", "New accounts"],
          ["accounts_closed", "Closed"],
        ] as const).map(([key, label]) => (
          <div key={key} className="rounded-lg border border-[#E2DFD5] p-3 text-center">
            <div className="font-[family-name:var(--font-fraunces)] text-[18px] font-semibold tabular-nums leading-none">
              {totals[key] ?? "—"}
            </div>
            <div className="mt-1 text-[10.5px] leading-snug text-[#5B6560]">{label}</div>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {shownUrl ? (
          <a
            href={shownUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90"
          >
            <Ico name="external" size={13} />
            {shownUrl === archivedUrl ? "Open the sent PDF" : "Open the draft PDF"}
          </a>
        ) : (
          <button
            onClick={() => startTransition(async () => {
              await actionRenderPreview(draft.report_date, "weekly");
              router.refresh();
            })}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Rendering…" : "Render preview"}
          </button>
        )}
      </div>

      {shownUrl && !draft.dirty && (
        <div className="mb-5 overflow-hidden rounded-lg border border-[#E2DFD5]">
          <iframe src={shownUrl} title={`Weekly report, ${rangeLabel}`} className="h-[70vh] w-full" />
        </div>
      )}

      {saved && <div className="mb-4"><SuccessNote title={saved} /></div>}

      {!sent && (
        <div className="flex flex-wrap gap-2 border-t border-[#EDEBE3] pt-4">
          <button
            onClick={() => decide("approved")}
            disabled={locked}
            className="rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Working…" : "Approve and send"}
          </button>
          {draft.status === "held" ? (
            <button
              onClick={() => decide("pending")}
              disabled={locked}
              className="rounded-md border border-[#E2DFD5] px-4 py-2 text-[13px] text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
            >
              Release the hold
            </button>
          ) : (
            <button
              onClick={() => decide("held")}
              disabled={locked}
              title="Nothing goes out at Friday's deadline."
              className="rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-4 py-2 text-[13px] text-[#8A6D2F] transition-colors hover:opacity-90 disabled:opacity-40"
            >
              Hold this week
            </button>
          )}
        </div>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-[#8A928C]">
        Approving sends within a few minutes. If you never get to it, it still goes out Friday evening with
        whatever HubSpot says by then. Hold is how you stop that.
      </p>
    </section>
  );
}

/**
 * Which day to review (2026-08-28, Juan's ask). Spans every day up to today
 * -- there's no min, a very old date just shows "nothing built yet" same as
 * any date with no draft. Picking a date pushes ?date=YYYY-MM-DD, which
 * page.tsx reads for both the daily section AND the week that date falls in
 * ("weekly is derived from daily", his follow-up): the two are always the
 * same click, never two separate pickers to keep in sync by hand.
 */
export function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  return (
    <div className="mb-5 flex items-center gap-2">
      <label htmlFor="report-date" className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
        Reviewing
      </label>
      <input
        id="report-date"
        type="date"
        value={date}
        max={today}
        onChange={(e) => {
          if (!e.target.value) return;
          router.push(`/nutribiotic/reports?date=${e.target.value}`);
        }}
        className="rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 text-[13.5px] tabular-nums focus:border-[#14201B] focus:outline-none"
      />
      {date !== today && (
        <a
          href="/nutribiotic/reports"
          className="text-[12px] text-[#2C6A46] underline decoration-[#2C6A46]/40 underline-offset-2 hover:decoration-[#2C6A46]"
        >
          Back to today
        </a>
      )}
    </div>
  );
}
