/**
 * Expensos, from the browser rather than the Claude Code CLI.
 *
 * This is a THIRD DOOR onto the same Drive/Sheets tree `expense_log.py`
 * files into (`bridges/expenses/expense_log.py`, invoked by the `expensos`
 * skill when Juan hands over photos in a session) and shares its exact
 * layout constants, period/workweek math, and California overtime tiers, so
 * a period filed half from the CLI and half from this OS reads as one
 * claim, not two. Whenever one side's layout changes, the other must move
 * with it; there is no automated check for that yet, only this comment.
 *
 * NO SHARED LEDGER. `expense_log.py` dedupes photo re-runs against a local
 * `ledger.jsonl` that only exists on Juan's Mac; a Vercel function has no
 * such file and no database of its own for this (deliberately not adding
 * one, see gdrive.ts). Duplicate protection here is instead: read the
 * target period's own Hours tab before writing an hours row (one date per
 * period, same rule as the CLI), and for photos, the UI disables the submit
 * control once a filing succeeds rather than hashing bytes. A photo filed
 * twice on purpose from two different days is not caught here the way the
 * CLI's content-hash dedupe would catch it; this trades that guarantee for
 * statelessness. Bulk end-of-day filing from a phone camera roll should
 * still go through the CLI's `expensos` skill, which has the ledger.
 *
 * MILEAGE RATE is duplicated from `bridges/expenses/config.json` rather
 * than read from it (Vercel cannot see that file). If Juan states a new
 * rate, both this constant AND that config file need to change together,
 * same as expense_log.py's own DEFAULT_MILEAGE_RATE fallback constant.
 */
import "server-only";
import {
  asOwnerLink,
  ensureFolder,
  ensureSpreadsheet,
  hyperlink,
  nextFreeRow,
  readColumn,
  tabId,
  batchUpdate,
  uploadFile,
  writeRange,
} from "./gdrive";

const ROOT_FOLDER = "NutriBiotic Field Expenses";
const LOG_TAB = "Log";
const HOURS_TAB = "Hours";
// Cost/Reimbursement split 2026-08-19, mirrors expense_log.py: Cost is what was actually
// spent, Reimbursement is what NutriBiotic owes back, they differ only on a company-card
// charge (Reimbursement 0). G is the gap/DAY column between the two tables.
const EXPENSE_HEADER = ["Date", "Merchant", "Purpose", "Cost", "Reimbursement", "Link"];
const MILES_HEADER = ["Start Odo", "Link", "End Odo", "Link", "Distance", "Mileage Comp"];
const HOURS_HEADER = ["Date", "Day", "Clock In", "Clock Out", "Break (hours)", "Hours Worked", "Regular", "OT 1.5x", "OT 2x", "Notes"];
const TOTALS_ROW = 2;
const FIRST_DATA_ROW = 3;
const LAST_ROW = 2000;
// Hours-tab-only bound, tighter than the Log tab's LAST_ROW: one row per day, and a
// semi-monthly period never exceeds 16 days, so this pads past 16 with room to spare.
// Mirrors bridges/expenses/expense_log.py's HOURS_LAST_ROW (2026-08-18), keep both in sync.
const HOURS_LAST_ROW = 20;
const LIGHT_GREEN = { red: 0.91, green: 0.961, blue: 0.914 };

// Paired with bridges/expenses/config.json's "mileage_rate". Change both
// together; see the module comment above.
const MILEAGE_RATE = 0.76;

export type PeriodBounds = { start: Date; end: Date };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** All date math here is calendar-day arithmetic in Pacific local time (the
 * territory this whole department runs in), never UTC-shifted, so a photo
 * filed at 11pm doesn't land on tomorrow's period. Callers pass plain
 * YYYY-MM-DD date strings for exactly this reason; parsing them with `new
 * Date(dateStr)` (UTC midnight) then reading UTC fields keeps the day fixed
 * regardless of the server's own timezone. */
function parseDate(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${dateStr}`);
  return d;
}

export function periodBounds(dateStr: string): PeriodBounds {
  const d = parseDate(dateStr);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (day <= 15) {
    return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m, 15)) };
  }
  const lastOfMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { start: new Date(Date.UTC(y, m, 16)), end: new Date(Date.UTC(y, m, lastOfMonth)) };
}

export function periodKey(dateStr: string): string {
  const d = parseDate(dateStr);
  const half = d.getUTCDate() <= 15 ? "a" : "b";
  return `pp_${d.getUTCFullYear()}_${pad2(d.getUTCMonth() + 1)}${half}`;
}

export function periodLabel(dateStr: string): string {
  const { start, end } = periodBounds(dateStr);
  const monthName = start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `period ${monthName} ${start.getUTCDate()}-${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

export function sheetName(dateStr: string): string {
  const d = parseDate(dateStr);
  const half = d.getUTCDate() <= 15 ? "a" : "b";
  return `expense-report-${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}${half}`;
}

/** The Sunday (UTC-date-math) that starts the fixed 7-day workweek California
 * overtime is computed against, independent of the pay period. Mirrors
 * `workweek_start` in expense_log.py exactly. */
export function workweekStart(dateStr: string): string {
  const d = parseDate(dateStr);
  const dow = d.getUTCDay(); // 0 = Sunday already
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - dow);
  return ymd(sunday);
}

function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

type Tree = { yearFolderId: string; periodFolderId: string; sheetId: string; sheetLink: string };

async function ensureTree(dateStr: string): Promise<Tree> {
  const d = parseDate(dateStr);
  const yearFolder = await ensureFolder(`${ROOT_FOLDER} ${d.getUTCFullYear()}`, null);
  const periodFolder = await ensureFolder(periodLabel(dateStr), yearFolder.id);
  const sheet = await ensureSpreadsheet(sheetName(dateStr), periodFolder.id, { [LOG_TAB]: [], [HOURS_TAB]: [] });

  const logHeaderCol = await readColumn(sheet.id, `${LOG_TAB}!A1:A1`);
  if (logHeaderCol.length === 0) {
    await writeRange(sheet.id, `${LOG_TAB}!A1:F1`, [EXPENSE_HEADER]);
    await writeRange(sheet.id, `${LOG_TAB}!G1:N1`, [["DAY", ...MILES_HEADER, "Total Field Comp"]]);
    // Total Field Comp sums Reimbursement (E), not Cost (D): the claim is what's owed
    // back, a company-card charge sits in Cost without inflating it.
    await writeRange(sheet.id, `${LOG_TAB}!A${TOTALS_ROW}:N${TOTALS_ROW}`, [[
      "TOTAL", "", "",
      `=SUM(D${FIRST_DATA_ROW}:D${LAST_ROW})`,
      `=SUM(E${FIRST_DATA_ROW}:E${LAST_ROW})`, "", "", "", "", "", "",
      `=SUM(L${FIRST_DATA_ROW}:L${LAST_ROW})`,
      `=ROUND(L${TOTALS_ROW}*${MILEAGE_RATE},2)`,
      `=E${TOTALS_ROW}+M${TOTALS_ROW}`,
    ]]);
    await styleLogSheet(sheet.id);
  }

  const hoursHeaderCol = await readColumn(sheet.id, `${HOURS_TAB}!A1:A1`);
  if (hoursHeaderCol.length === 0) {
    await writeRange(sheet.id, `${HOURS_TAB}!A1:J1`, [HOURS_HEADER]);
    await writeRange(sheet.id, `${HOURS_TAB}!A${TOTALS_ROW}:J${TOTALS_ROW}`, [[
      "TOTAL", "", "", "",
      `=SUM(E${FIRST_DATA_ROW}:E${HOURS_LAST_ROW})`,
      `=SUM(F${FIRST_DATA_ROW}:F${HOURS_LAST_ROW})`,
      `=MIN(SUM(G${FIRST_DATA_ROW}:G${HOURS_LAST_ROW}),40)`,
      `=SUM(H${FIRST_DATA_ROW}:H${HOURS_LAST_ROW})+MAX(0,SUM(G${FIRST_DATA_ROW}:G${HOURS_LAST_ROW})-40)`,
      `=SUM(I${FIRST_DATA_ROW}:I${HOURS_LAST_ROW})`, "",
    ]]);
    await styleHoursSheet(sheet.id);
  }

  return { yearFolderId: yearFolder.id, periodFolderId: periodFolder.id, sheetId: sheet.id, sheetLink: sheet.webViewLink };
}

async function styleLogSheet(sheetId: string): Promise<void> {
  const gid = await tabId(sheetId, LOG_TAB);
  const money = { type: "CURRENCY", pattern: '"$"#,##0.00' };
  await batchUpdate(sheetId, [
    { repeatCell: { range: { sheetId: gid, startRowIndex: 0, endRowIndex: TOTALS_ROW, startColumnIndex: 0, endColumnIndex: 14 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { updateSheetProperties: { properties: { sheetId: gid, gridProperties: { frozenRowCount: TOTALS_ROW } }, fields: "gridProperties.frozenRowCount" } },
    // Cost (D) and Reimbursement (E)
    { repeatCell: { range: { sheetId: gid, startRowIndex: TOTALS_ROW - 1, endRowIndex: LAST_ROW, startColumnIndex: 3, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: money } }, fields: "userEnteredFormat.numberFormat" } },
    // Mileage Comp (M) and Total Field Comp (N)
    { repeatCell: { range: { sheetId: gid, startRowIndex: TOTALS_ROW - 1, endRowIndex: LAST_ROW, startColumnIndex: 12, endColumnIndex: 14 }, cell: { userEnteredFormat: { numberFormat: money } }, fields: "userEnteredFormat.numberFormat" } },
    // Distance (L)
    { repeatCell: { range: { sheetId: gid, startRowIndex: TOTALS_ROW - 1, endRowIndex: LAST_ROW, startColumnIndex: 11, endColumnIndex: 12 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0.0" } } }, fields: "userEnteredFormat.numberFormat" } },
    { addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId: gid, startRowIndex: FIRST_DATA_ROW - 1, endRowIndex: LAST_ROW, startColumnIndex: 0, endColumnIndex: 14 }], booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: "=ISEVEN(ROW())" }] }, format: { backgroundColor: LIGHT_GREEN } } } } },
  ]);
}

async function styleHoursSheet(sheetId: string): Promise<void> {
  const gid = await tabId(sheetId, HOURS_TAB);
  const hrs = { type: "NUMBER", pattern: "0.00" };
  await batchUpdate(sheetId, [
    { repeatCell: { range: { sheetId: gid, startRowIndex: 0, endRowIndex: TOTALS_ROW, startColumnIndex: 0, endColumnIndex: 10 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { updateSheetProperties: { properties: { sheetId: gid, gridProperties: { frozenRowCount: TOTALS_ROW } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: gid, startRowIndex: TOTALS_ROW - 1, endRowIndex: HOURS_LAST_ROW, startColumnIndex: 4, endColumnIndex: 9 }, cell: { userEnteredFormat: { numberFormat: hrs } }, fields: "userEnteredFormat.numberFormat" } },
    { addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId: gid, startRowIndex: FIRST_DATA_ROW - 1, endRowIndex: HOURS_LAST_ROW, startColumnIndex: 0, endColumnIndex: 10 }], booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: "=ISEVEN(ROW())" }] }, format: { backgroundColor: LIGHT_GREEN } } } } },
  ]);
}

export async function periodSummary(dateStr: string): Promise<{ period: string; label: string; sheetLink: string }> {
  const tree = await ensureTree(dateStr);
  return { period: periodKey(dateStr), label: periodLabel(dateStr), sheetLink: asOwnerLink(tree.sheetLink) };
}

// ---------------------------------------------------------------------------
// hours
// ---------------------------------------------------------------------------

export type HoursInput = { date: string; clockIn: string; clockOut: string; breakMin: number; notes: string };
export type HoursResult = {
  status: "filed" | "duplicate";
  date?: string;
  hoursWorked?: number;
  sheetLink?: string;
  boundaryWeek?: boolean;
  sevenDayWeek?: boolean;
  why?: string;
};

function parseClock(dateStr: string, hhmm: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`${hhmm} is not HH:MM 24h.`);
  const d = parseDate(dateStr);
  d.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export async function fileHours(input: HoursInput): Promise<HoursResult> {
  const { date, clockIn, clockOut, breakMin, notes } = input;
  const tree = await ensureTree(date);

  const existingDates = await readColumn(tree.sheetId, `${HOURS_TAB}!A${FIRST_DATA_ROW}:A${HOURS_LAST_ROW}`);
  if (existingDates.includes(date)) {
    return { status: "duplicate", why: `${date} is already filed for this period. Amend it from the CLI (expensos) instead of re-filing.` };
  }

  const inAt = parseClock(date, clockIn);
  let outAt = parseClock(date, clockOut);
  // The web picker's clock-out window is 2pm-2am (2026-08-19), so a clock out
  // at/before clock in always means the 2am wrap into the next calendar day,
  // not a bad reading, roll it forward rather than rejecting it.
  if (outAt.getTime() <= inAt.getTime()) {
    outAt = new Date(outAt.getTime() + 24 * 3_600_000);
  }
  const worked = Math.round(((outAt.getTime() - inAt.getTime()) / 3_600_000 - breakMin / 60) * 100) / 100;
  if (worked <= 0) {
    throw new Error(`The break (${breakMin} min) is not shorter than the shift. Nothing filed.`);
  }

  const day = parseDate(date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const row = Math.max(await nextFreeRow(tree.sheetId, HOURS_TAB, "A"), FIRST_DATA_ROW);
  // breakMin stays minutes on the wire (that's what the clock-in/out UI collects); the
  // sheet cell reads hours, matching expense_log.py's 2026-08-18 presentation call.
  const breakHours = Math.round((breakMin / 60) * 100) / 100;
  await writeRange(tree.sheetId, `${HOURS_TAB}!A${row}:J${row}`, [[
    date, day, clockIn, clockOut, breakHours, worked,
    `=MIN(F${row},8)`, `=MAX(0,MIN(F${row},12)-8)`, `=MAX(0,F${row}-12)`, notes,
  ]]);

  // Same boundary check as expense_log.py's `hours` command, computed from
  // this period's own rows only (no cross-period ledger to read here) -- see
  // the module comment on why. Pure date arithmetic, so it's exact regardless
  // of what's actually filed on the other side of the boundary.
  const { start, end } = periodBounds(date);
  const wkStart = parseDate(workweekStart(date));
  const wkEnd = parseDate(addDays(workweekStart(date), 6));
  const boundaryWeek = wkStart.getTime() < start.getTime() || wkEnd.getTime() > end.getTime();

  const allDatesThisPeriod = [...existingDates, date];
  const wk = workweekStart(date);
  const sameWeekCount = allDatesThisPeriod.filter((d) => d && workweekStart(d) === wk).length;

  return {
    status: "filed", date, hoursWorked: worked, sheetLink: asOwnerLink(tree.sheetLink),
    boundaryWeek, sevenDayWeek: sameWeekCount >= 7,
  };
}

// ---------------------------------------------------------------------------
// receipts / statement rows / trips
// ---------------------------------------------------------------------------

export type ReceiptInput = {
  date: string; merchant: string; purpose: string; amount: string;
  // Defaults to `amount` (fully reimbursable) when omitted. Pass "0" for a
  // company-card charge: real spend, nothing owed back.
  reimbursement?: string;
  photo: { bytes: ArrayBuffer; mimeType: string; filename: string };
};

export async function fileReceipt(input: ReceiptInput): Promise<{ sheetLink: string; photoLink: string }> {
  const tree = await ensureTree(input.date);
  const ext = extOf(input.photo.filename, input.photo.mimeType);
  const stamp = input.date.replace(/-/g, "");
  const uploaded = await uploadFile(input.photo.bytes, input.photo.mimeType, tree.periodFolderId, `${stamp}_receipt_${randomSuffix()}${ext}`);
  const photoLink = asOwnerLink(uploaded.webViewLink);
  const reimbursement = input.reimbursement ?? input.amount;

  const row = Math.max(await nextFreeRow(tree.sheetId, LOG_TAB, "A"), FIRST_DATA_ROW);
  await writeRange(tree.sheetId, `${LOG_TAB}!A${row}:F${row}`, [[
    input.date, input.merchant, input.purpose, input.amount, reimbursement, hyperlink(photoLink, "receipt"),
  ]]);

  return { sheetLink: asOwnerLink(tree.sheetLink), photoLink };
}

export type TripInput = {
  date: string; endDate?: string; purpose: string;
  startOdo: string; endOdo: string;
  startPhoto: { bytes: ArrayBuffer; mimeType: string; filename: string };
  endPhoto: { bytes: ArrayBuffer; mimeType: string; filename: string };
};

/**
 * Upload one odometer photo into its date's period folder, tagged start/end,
 * same naming convention fileTrip has always used. Split out of fileTrip
 * 2026-08-26 for the widget's camera-gated mileage flow (see api/widget/
 * mileage/route.ts): that flow captures a start photo hours before the end
 * one exists, so the upload has to happen on its own, before there is a pair
 * to file a row for. fileTrip below calls this too, unchanged externally.
 */
export async function uploadMileagePhoto(
  date: string,
  moment: "start" | "end",
  photo: { bytes: ArrayBuffer; mimeType: string; filename: string },
): Promise<{ driveFileId: string; photoLink: string }> {
  const tree = await ensureTree(date);
  const stamp = date.replace(/-/g, "");
  const up = await uploadFile(photo.bytes, photo.mimeType, tree.periodFolderId, `${stamp}_trip-${moment}_${randomSuffix()}${extOf(photo.filename, photo.mimeType)}`);
  return { driveFileId: up.id, photoLink: asOwnerLink(up.webViewLink) };
}

/**
 * The H:M sheet row itself, given two ALREADY-UPLOADED photo links rather
 * than raw bytes -- the other half of fileTrip's split. Both entry points
 * (this one and fileTrip) end at the exact same row shape, so a trip filed
 * from the widget and one filed from /expenses read identically on the sheet.
 */
export async function fileTripFromLinks(input: {
  date: string; startOdo: string; endOdo: string; startLink: string; endLink: string;
}): Promise<{ sheetLink: string; miles: number }> {
  const startNum = Number(String(input.startOdo).replace(/,/g, ""));
  const endNum = Number(String(input.endOdo).replace(/,/g, ""));
  if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
    throw new Error("Odometer readings must be plain digits (a decimal is fine). An unreadable photo is a blank, never a guess.");
  }
  if (endNum < startNum) {
    throw new Error(`The end odometer (${input.endOdo}) is lower than the start (${input.startOdo}). Check which photo is which.`);
  }

  const tree = await ensureTree(input.date);
  // H:M, not G:L: G is the gap/DAY column between the two tables (2026-08-19). Mileage
  // Comp (M) stays blank per row, a totals-row-only figure since 2026-08-17, matching
  // expense_log.py, a per-drive dollar figure read as more precision than the claim needs.
  const row = Math.max(await nextFreeRow(tree.sheetId, LOG_TAB, "H"), FIRST_DATA_ROW);
  // hyperlink() already renders a blank cell when there's no link (a bypassed
  // side) -- a blank is the honest signal, Juan's own call 2026-08-27.
  await writeRange(tree.sheetId, `${LOG_TAB}!H${row}:M${row}`, [[
    input.startOdo, hyperlink(input.startLink, "photo"),
    input.endOdo, hyperlink(input.endLink, "photo"),
    `=IF(OR(H${row}="",J${row}=""),"",J${row}-H${row})`,
    "",
  ]]);

  return { sheetLink: asOwnerLink(tree.sheetLink), miles: Math.round((endNum - startNum) * 10) / 10 };
}

export async function fileTrip(input: TripInput): Promise<{ sheetLink: string; miles: number }> {
  // Fail fast on a bad reading, same as before this was split: no reason to
  // spend two Drive uploads on a request that's about to be rejected anyway.
  if (!Number.isFinite(Number(String(input.startOdo).replace(/,/g, "")))
    || !Number.isFinite(Number(String(input.endOdo).replace(/,/g, "")))) {
    throw new Error("Odometer readings must be plain digits (a decimal is fine). An unreadable photo is a blank, never a guess.");
  }
  const startUp = await uploadMileagePhoto(input.date, "start", input.startPhoto);
  const endUp = await uploadMileagePhoto(input.endDate ?? input.date, "end", input.endPhoto);
  return fileTripFromLinks({
    date: input.date, startOdo: input.startOdo, endOdo: input.endOdo,
    startLink: startUp.photoLink, endLink: endUp.photoLink,
  });
}

function extOf(filename: string, mimeType: string): string {
  const fromName = /\.[a-zA-Z0-9]+$/.exec(filename)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("heic")) return ".heic";
  return ".jpg";
}

function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 10);
}
