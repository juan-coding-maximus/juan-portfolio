"use server";

import { revalidatePath } from "next/cache";
import {
  getReportDraft,
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
 * Everything else on the report is a HubSpot record. Correcting one of those
 * means correcting the CRM, which is a separate and separately-gated write.
 * Nothing here touches HubSpot.
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
  stops: Record<string, { hidden: boolean; call_only: boolean; message_only: boolean }>;
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
  if (draft.status === "sent") return; // a sent report is a record, not a draft

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

  await saveReportDraftPayload(dateISO, payload);
  revalidatePath(PATH);
}
