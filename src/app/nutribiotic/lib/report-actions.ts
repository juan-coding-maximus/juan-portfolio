"use server";

import { revalidatePath } from "next/cache";
import { archiveEngagement } from "./hubspot-engagement";
import {
  addAccountToRouteDraft,
  getActivityByEngagementId,
  getReportDraft,
  insertActivityCorrection,
  insertFieldNote,
  requestPreviewRender,
  requestReportRebuild,
  saveReportDraftPayload,
  setReportDraftStatus,
  type RouteEndpoint,
  type ReportHqNote,
  type ReportPayload,
} from "./dal";

/**
 * The review gate's four actions.
 *
 * THE CLICK RECORDS A DECISION, IT DOES NOT EXECUTE ONE. Same rule as
 * lib/import-actions.ts and the calendar proposals: this app runs on Vercel and
 * can run neither Playwright nor /usr/bin/python3, so every render and the send
 * itself happen on the Mac in field_report.py --serve. What lands here is a row.
 *
 * WHAT MAY BE EDITED. Only the parts of the report the OS itself owns:
 *   - hq_notes, free text the model drafted, with no upstream record to
 *     contradict, so a human rewriting them is authorship rather than
 *     fabrication;
 *   - each stop's hidden / call-only / message-only classification, which is
 *     what decides map inclusion and mileage and is where the heuristics
 *     actually get it wrong;
 *   - where the day starts and ends (route_start_override/route_end_override),
 *     when field_report.py's route_endpoints_for() got it wrong or nothing was
 *     ever planned for the day -- the 2026-08-27 bug (a Sands of La Jolla
 *     overnight reported as a round trip from Manhattan Beach because the
 *     report never looked at the route plan);
 *   - miles, when the computed drive is wrong even with the right start/end.
 *
 * ONE EXCEPTION, ADDED 2026-09-03: marking a stop as a field note. That one DOES
 * reach HubSpot, and deliberately. Juan: "the report page shows the current
 * states, but doesn't allow changes. One of the biggest functionalities of this
 * page is to help me edit to reflect reality." The reality being corrected is
 * that a thing filed as a customer contact never was one, and leaving the
 * engagement in the shared portal while the report calls it a note would be two
 * systems disagreeing about the same event. So it logs an
 * nb_activity_corrections row (nb_activities stays append-only), writes the
 * nb_field_notes twin that carries the touchpoint credit, and archives the
 * engagement with scope asserted twice, exactly as field_note_correct.py does on
 * the Mac side. See HARD RULES 17 and 18.
 */

const PATH = "/nutribiotic/reports";

export async function actionRequestRebuild(dateISO: string): Promise<void> {
  await requestReportRebuild(dateISO);
  revalidatePath(PATH);
}

/** Render-only, no HubSpot pull, no status change -- for a sent (or any)
 *  day that has no preview PDF on hand yet. See requestPreviewRender. */
export async function actionRenderPreview(dateISO: string, kind: "daily" | "weekly" = "daily"): Promise<void> {
  await requestPreviewRender(dateISO, kind);
  revalidatePath(PATH);
}

/** Add a report stop to an upcoming day's route (2026-08-29, replaces the
 *  "Message" toggle: "add a button of add the client to an upcoming route on
 *  /map and i can decide the date"). Writes straight to the same
 *  route_draft the /map screen edits -- open Map on that date and the
 *  account is already there. Revalidates /map too since this is the one
 *  action here that changes what that screen shows. */
export async function actionAddToRoute(hubspotCompanyId: string, date: string): Promise<void> {
  await addAccountToRouteDraft(hubspotCompanyId, date);
  revalidatePath(PATH);
  revalidatePath("/nutribiotic/map");
}

export async function actionDecideReport(
  dateISO: string,
  decision: "approved" | "held" | "pending",
  kind: "daily" | "weekly" = "daily",
): Promise<void> {
  await setReportDraftStatus(dateISO, decision, kind);
  revalidatePath(PATH);
}

export type ReportEdits = {
  hqNotes: ReportHqNote[];
  miles: number | null;
  /** null = clear the override (fall back to route_endpoints_for's default);
   *  undefined = leave whatever override is already stored untouched. */
  routeStart?: RouteEndpoint | null;
  routeEnd?: RouteEndpoint | null;
  stops: Record<string, { hidden: boolean; call_only: boolean; message_only: boolean; field_note?: boolean }>;
  /** Display order, as stop `n` values, in the order Juan arranged them
   *  (2026-08-28, "move things around"). field_report.py's apply_edits()
   *  renumbers and draws the route/mileage straight off array order, so
   *  reordering here -- once, on save -- is the whole feature; nothing on
   *  the Mac side needed to change. Undefined/empty leaves the existing
   *  (HubSpot-chronological) order alone. */
  order?: number[];
};

/**
 * Merge his edits into the stored payload and mark the preview stale.
 *
 * READ-MODIFY-WRITE, deliberately. The payload is build_report()'s whole dict
 * and most of it is HubSpot's; sending only the edited fields from the browser
 * would mean the browser deciding what the rest of the report says. So the
 * server re-reads the row, changes the named fields, and writes the same
 * object back with everything else byte-identical.
 *
 * Stops are keyed by their `n`, which is what the map labels and what the
 * screen showed him. Any key that no longer matches a stop is ignored rather
 * than applied to whatever now sits at that index.
 */
export async function actionSaveReportEdits(dateISO: string, edits: ReportEdits): Promise<void> {
  const draft = await getReportDraft(dateISO);
  if (!draft?.payload) return;
  // A SENT REPORT IS STILL EDITABLE (Juan, 2026-09-03: "Everything should be
  // editable at any point. We only keep the latest updated version.").
  //
  // This used to return early on `sent`, on the reasoning that a sent report is
  // a record rather than a draft. That reasoning protected the wrong thing. The
  // point of this screen, in his words, is "to help me edit to reflect
  // reality", and reality is most often wrong the morning AFTER a report went
  // out, which is exactly when the old rule locked it. He caught the Sep 2
  // report calling three notes to self customer visits and starting the day in
  // a city he had not slept in, and could not fix either from the page.
  //
  // What stays true: editing never re-mails. The email that left is the record
  // of what was mailed, and re-sending on every correction would turn a typo
  // into an outward send (root AGENTS.md P1). The Reports-tab artifact is
  // republished in place instead, so the page and the PDF behind it always show
  // the latest version, which is the only version kept.

  const payload: ReportPayload = { ...draft.payload };

  payload.hq_notes = edits.hqNotes
    .map((n) => ({
      category: String(n.category ?? "OTHER"),
      text: String(n.text ?? "").trim(),
      source: String(n.source ?? "Juan"),
    }))
    .filter((n) => n.text.length > 0);

  // An OVERRIDE, not the value. Null means "recompute from the stops that are
  // still visible", which is what has to happen after hiding one, or the
  // mileage would still count a drive he just removed. See apply_edits() in
  // field_report.py, which is where both branches are resolved.
  payload.miles_override =
    edits.miles === null || Number.isNaN(edits.miles) ? null : edits.miles;

  if (edits.routeStart !== undefined) payload.route_start_override = edits.routeStart;
  if (edits.routeEnd !== undefined) payload.route_end_override = edits.routeEnd;

  payload.stops = (draft.payload.stops ?? []).map((s) => {
    const e = edits.stops[String(s.n)];
    if (!e) return s;
    return { ...s, hidden: e.hidden, is_call_only: e.call_only, is_message_only: e.message_only };
  });

  if (edits.order && edits.order.length > 0) {
    const byN = new Map(payload.stops.map((s) => [s.n, s]));
    const ordered = edits.order.map((n) => byN.get(n)).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const placed = new Set(ordered.map((s) => s.n));
    const rest = payload.stops.filter((s) => !placed.has(s.n)); // any stop `order` didn't name, appended, never dropped
    payload.stops = [...ordered, ...rest];
  }

  // Stops he marked as "not a customer contact" are corrected at the source
  // before the payload is written, so the rebuilt PDF reads the corrected world
  // rather than carrying an override the CRM disagrees with.
  for (const [n, e] of Object.entries(edits.stops)) {
    if (!e.field_note) continue;
    const stop = (draft.payload.stops ?? []).find((s) => String(s.n) === n);
    if (stop) await reclassifyStopAsFieldNote(stop);
  }

  await saveReportDraftPayload(dateISO, payload);
  revalidatePath(PATH);
}

/**
 * One stop, corrected from "a customer was contacted" to "a note was recorded".
 *
 * Order matters and is the same order field_note_correct.py uses: the OS rows
 * first, the portal last. If the archive fails, the OS already says field note
 * and the engagement is a visible leftover someone can delete; the reverse
 * order would delete the shared-portal record and then possibly fail to record
 * why, which is unrecoverable.
 */
async function reclassifyStopAsFieldNote(
  stop: NonNullable<ReportPayload["stops"]>[number],
): Promise<void> {
  for (const ev of stop.events ?? []) {
    // `events` is typed `unknown[]` on the payload: it is field_report.py's
    // shape, not this app's, so it is narrowed here rather than trusted.
    const engagementId = (ev as { id?: string } | null)?.id;
    if (!engagementId) continue;
    const activity = await getActivityByEngagementId(engagementId);
    if (!activity || activity.kind === "field_note") continue;

    await insertActivityCorrection({
      activity_id: activity.id,
      original_kind: activity.kind,
      corrected_kind: "field_note",
      reason: "Marked on the report as not a customer contact.",
    });
    await insertFieldNote({
      account_id: activity.account_id,
      touchpoint_id: null,
      at: activity.at,
      detail: activity.detail ?? "",
      raw_text: null,
      topic: "account",
    });
    await archiveEngagement(engagementId);
  }
}
