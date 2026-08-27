/**
 * One odometer photo, start or end, from the widget's camera-gated route
 * (Juan's ask 2026-08-26). Uploads into the SAME Drive/Sheets tree the
 * /expenses screen and expensos CLI already file mileage into
 * (lib/expenses.ts's uploadMileagePhoto), reads a best-effort odometer value
 * off the photo the same way /api/expenses/classify already does, and once
 * both sides of a day exist, files the trip row automatically -- Juan never
 * has to open /expenses for a day that read cleanly.
 *
 * BYPASS (Juan's ask 2026-08-27): the widget offers "Enter manually" next to
 * "Take Photo" before it ever opens the camera (see nb-widget.js's
 * chooseMileageMethod). A bypassed side sends `bypass=1` and `manual_odo`
 * instead of a photo -- no Drive upload, no Claude read, `manual: true` on
 * the stored side so the filed row says "no photo (manual)" in plain text
 * (fileTripFromLinks) rather than a blank cell that would read as a missed
 * upload. The reading itself still has to be plain digits; a bypass skips
 * the photo, never the "no fabrication" rule.
 *
 * AUTH IS WIDENED ON PURPOSE, JUST FOR THIS ROUTE. Every other write in this
 * app requires a real session (mutate()'s verifySession()); the widget's
 * NB_WIDGET_TOKEN is deliberately read-only everywhere else (see api/widget/
 * route.ts's own header). This is the one exception: a photo of Juan's own
 * odometer, filed nowhere near a customer record or HubSpot, is a low enough
 * stakes write that the widget doing it directly -- rather than needing the
 * much higher-privilege NB_SESSION_SECRET bearer, or a trusted-device cookie
 * a phone script has no natural way to hold -- is worth the narrow exception.
 * See dal.ts's setRouteMileageDay, which enforces this same check again.
 *
 * AN UNREADABLE ODOMETER IS A BLANK, NEVER A GUESS, same rule as
 * /api/expenses/classify. When a reading can't be confirmed automatically,
 * both photos still upload and stay linked (fileError set) rather than
 * getting lost; Juan corrects it by hand on /expenses.
 */
import Anthropic from "@anthropic-ai/sdk";
import { setRouteMileageDay, type RouteMileageSide } from "../../../lib/dal";
import { fileTripFromLinks, uploadMileagePhoto } from "../../../lib/expenses";
import { hasAccess } from "../../../lib/devices";
import { hasWidgetToken } from "../../../lib/session";

export const runtime = "nodejs";
export const maxDuration = 45;

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const READ_TOOL = {
  name: "read_odometer",
  description: "Report the total odometer reading visible in this dashboard photo.",
  input_schema: {
    type: "object" as const,
    properties: {
      reading: {
        type: ["string", "null"],
        description: "The total odometer number, digits only (a decimal is normal), never the trip meter. Null if not clearly legible -- never a guess.",
      },
    },
    required: ["reading"],
  },
};

async function readOdometer(bytes: ArrayBuffer, mimeType: string): Promise<string | null> {
  if (!client) return null;
  try {
    const base64 = Buffer.from(bytes).toString("base64");
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 200,
      system:
        "Read the total odometer number from this car dashboard photo. An unreadable or ambiguous " +
        "digit means the reading is null -- never a plausible guess, this feeds a mileage reimbursement.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg", data: base64 } },
            { type: "text", text: "Read the odometer." },
          ],
        },
      ],
      tools: [READ_TOOL],
      tool_choice: { type: "tool", name: "read_odometer" },
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;
    return (toolUse.input as { reading: string | null }).reading ?? null;
  } catch {
    return null;
  }
}

/**
 * Record one side (start or end), then file the trip if both sides are now
 * present and legible. Shared by the photo path and the manual-bypass path
 * below -- they differ only in how `side` gets built.
 */
async function recordSide(day: string, kind: "start" | "end", side: RouteMileageSide) {
  const today = (await setRouteMileageDay(day, { [kind]: side }))[day] ?? {};

  // Only one side so far: nothing more to do until the other one lands.
  if (!today.start || !today.end) {
    return Response.json({ ok: true, filed: false, odo: side.odo, photoLink: side.photoLink });
  }

  // Both sides present. A clean pair files itself -- Juan never has to
  // visit /expenses for a day that read legibly on both ends.
  if (today.start.odo && today.end.odo) {
    try {
      const filed = await fileTripFromLinks({
        date: day,
        startOdo: today.start.odo,
        endOdo: today.end.odo,
        startLink: today.start.photoLink,
        endLink: today.end.photoLink,
        startManual: today.start.manual,
        endManual: today.end.manual,
      });
      // Filed: the sheet row is the durable record now. Reset the day back
      // to waiting-for-start (Juan's own ask) so a second trip the same
      // day starts clean rather than staying parked on "ended".
      await setRouteMileageDay(day, { start: undefined, end: undefined, filedSheetLink: undefined, fileError: undefined });
      return Response.json({ ok: true, filed: true, sheetLink: filed.sheetLink, miles: filed.miles, odo: side.odo });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await setRouteMileageDay(day, { fileError: message });
      return Response.json({
        ok: true,
        filed: false,
        odo: side.odo,
        error: `Both sides saved, but filing the trip failed: ${message}`,
      });
    }
  }

  // Both sides are in, but at least one odometer reading wasn't legible.
  // Never guess it: leave both in place and say so.
  await setRouteMileageDay(day, { fileError: "One odometer reading wasn't legible. Enter it by hand on /nutribiotic/expenses." });
  return Response.json({
    ok: true,
    filed: false,
    odo: side.odo,
    error: "Both sides saved. One odometer reading wasn't legible -- enter it by hand on /nutribiotic/expenses.",
  });
}

export async function POST(req: Request) {
  if (!(await hasWidgetToken()) && !(await hasAccess())) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Expected multipart/form-data." }, { status: 400 });
  }

  const kind = form.get("kind");
  const day = form.get("day");
  if (kind !== "start" && kind !== "end") {
    return Response.json({ ok: false, error: "kind must be \"start\" or \"end\"." }, { status: 400 });
  }
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return Response.json({ ok: false, error: "day must be YYYY-MM-DD." }, { status: 400 });
  }

  // BYPASS: no photo, Juan typed the reading himself. See this file's header.
  if (form.get("bypass") === "1") {
    const manualOdo = String(form.get("manual_odo") ?? "").trim().replace(/,/g, "");
    if (!manualOdo || !Number.isFinite(Number(manualOdo))) {
      return Response.json({ ok: false, error: "Enter the odometer reading as plain digits." }, { status: 400 });
    }
    try {
      return await recordSide(day, kind, {
        odo: manualOdo, driveFileId: "", photoLink: "", capturedAt: new Date().toISOString(), manual: true,
      });
    } catch (e) {
      return Response.json({ ok: false, error: e instanceof Error ? e.message : "Filing failed." }, { status: 500 });
    }
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return Response.json({ ok: false, error: "No photo." }, { status: 400 });
  }

  try {
    const bytes = await photo.arrayBuffer();
    const mimeType = photo.type || "image/jpeg";
    const [odo, uploaded] = await Promise.all([
      readOdometer(bytes, mimeType),
      uploadMileagePhoto(day, kind, { bytes, mimeType, filename: photo.name || `${kind}.jpg` }),
    ]);
    return await recordSide(day, kind, {
      odo, driveFileId: uploaded.driveFileId, photoLink: uploaded.photoLink, capturedAt: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}
