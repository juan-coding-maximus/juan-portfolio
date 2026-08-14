/**
 * Google Drive + Sheets, server-side, via a SERVICE ACCOUNT rather than the
 * OAuth user token `bridges/expenses/expense_log.py` runs with on the Mac.
 *
 * WHY A SEPARATE CREDENTIAL. That script's token lives in a gitignored file
 * on Juan's machine and only exists there; a Vercel function has no such
 * filesystem to read it from. `nutribiotic-expenses-web@agency-gmail.iam
 * .gserviceaccount.com` (2026-08-14) was created for exactly this call site,
 * in the same `agency-gmail` Cloud project the Mac-side token uses, and was
 * given Editor access to the `NutriBiotic Field Expenses 2026` Drive folder
 * directly (Share -> add the service account's email) rather than any
 * broader scope. It can only reach what that folder and its future
 * siblings/children hold, same "not found means we didn't create it, never
 * widen scope" posture as drive_client.py's `drive.file` restriction.
 *
 * NO ID CACHE. expense_log.py caches folder/sheet ids in a local
 * config.json between runs; a Vercel function is stateless and often a cold
 * new instance, so every call here just resolves by NAME (find-or-create),
 * same as that script's own fallback path when the cache misses. One or two
 * extra Drive list calls per action is a fine price for a UI someone taps a
 * few times a day.
 *
 * OWNER_EMAIL is baked in rather than asked for: this bridge only ever files
 * into the one Drive tree juan@nutribiotic.com owns, so every link this
 * module returns is qualified with `authuser=` for that account, same reason
 * as `drive_client.py`'s `as_account` (a bare link opens in whichever Google
 * profile the browser signed into first).
 */
import "server-only";
import { google } from "googleapis";

const OWNER_EMAIL = "juan@nutribiotic.com";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

function credentials() {
  const email = process.env.NB_EXPENSES_SA_EMAIL;
  const key = process.env.NB_EXPENSES_SA_KEY;
  if (!email || !key) {
    throw new Error(
      "NB_EXPENSES_SA_EMAIL / NB_EXPENSES_SA_KEY are not set. The expenses UI cannot reach Drive without them.",
    );
  }
  // Vercel env values keep literal "\n" in a multi-line secret; PEM parsing
  // needs real newlines.
  return { email, key: key.replace(/\\n/g, "\n") };
}

function auth() {
  const { email, key } = credentials();
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"],
  });
}

function drive() {
  return google.drive({ version: "v3", auth: auth() });
}

function sheets() {
  return google.sheets({ version: "v4", auth: auth() });
}

/** Every Drive/Sheets link this module returns, qualified so it opens in the
 * account that owns the file rather than the browser's first-signed-in profile. */
export function asOwnerLink(url: string | null | undefined): string {
  if (!url) return "";
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}authuser=${OWNER_EMAIL}`;
}

async function findChild(
  name: string,
  parent: string | null,
  mime?: string,
): Promise<{ id: string; name: string; webViewLink?: string | null } | null> {
  const q = [`name = '${name.replace(/'/g, "\\'")}'`, "trashed = false"];
  q.push(parent ? `'${parent}' in parents` : "'root' in parents");
  if (mime) q.push(`mimeType = '${mime}'`);
  const res = await drive().files.list({
    q: q.join(" and "),
    fields: "files(id,name,webViewLink,mimeType)",
    pageSize: 10,
    spaces: "drive",
  });
  const files = res.data.files ?? [];
  return files.length ? (files[0] as { id: string; name: string; webViewLink?: string | null }) : null;
}

export async function ensureFolder(name: string, parent: string | null): Promise<{ id: string; webViewLink?: string | null }> {
  const got = await findChild(name, parent, FOLDER_MIME);
  if (got) return got;
  const res = await drive().files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: parent ? [parent] : undefined },
    fields: "id,name,webViewLink",
  });
  return { id: res.data.id!, webViewLink: res.data.webViewLink };
}

export async function uploadFile(
  bytes: ArrayBuffer,
  mimeType: string,
  parent: string,
  name: string,
): Promise<{ id: string; webViewLink?: string | null }> {
  const res = await drive().files.create({
    requestBody: { name, parents: [parent] },
    media: { mimeType, body: bufferToStream(Buffer.from(bytes)) },
    fields: "id,name,webViewLink",
  });
  return { id: res.data.id!, webViewLink: res.data.webViewLink };
}

function bufferToStream(buf: Buffer) {
  const { Readable } = require("node:stream") as typeof import("node:stream");
  return Readable.from(buf);
}

export async function ensureSpreadsheet(
  name: string,
  parent: string,
  tabs: Record<string, string[]>,
): Promise<{ id: string; webViewLink: string }> {
  const got = await findChild(name, parent, SHEET_MIME);
  if (got) {
    await addMissingTabs(got.id, tabs);
    return { id: got.id, webViewLink: got.webViewLink ?? `https://docs.google.com/spreadsheets/d/${got.id}/edit` };
  }
  const sh = sheets();
  const created = await sh.spreadsheets.create({
    requestBody: {
      properties: { title: name },
      sheets: Object.keys(tabs).map((t) => ({ properties: { title: t } })),
    },
    fields: "spreadsheetId,spreadsheetUrl",
  });
  const id = created.data.spreadsheetId!;
  for (const [tab, header] of Object.entries(tabs)) {
    if (header.length) {
      await sh.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${tab}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [header] },
      });
    }
  }
  // A spreadsheet created through the Sheets API lands in My Drive root; move it
  // into the period folder. Cosmetic if it fails, so best-effort.
  try {
    await drive().files.update({ fileId: id, addParents: parent, fields: "id,parents" });
  } catch {
    /* placement only; the sheet exists and works either way */
  }
  return { id, webViewLink: created.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}/edit` };
}

async function addMissingTabs(sheetId: string, tabs: Record<string, string[]>): Promise<void> {
  const sh = sheets();
  const meta = await sh.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" });
  const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  for (const [tab, header] of Object.entries(tabs)) {
    if (have.has(tab)) continue;
    await sh.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] } });
    if (header.length) {
      await sh.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tab}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [header] },
      });
    }
  }
}

export async function tabId(sheetId: string, tab: string): Promise<number> {
  const meta = await sheets().spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties(title,sheetId)" });
  const found = (meta.data.sheets ?? []).find((s) => s.properties?.title === tab);
  if (found?.properties?.sheetId == null) throw new Error(`no tab named ${tab} in that spreadsheet`);
  return found.properties.sheetId;
}

export async function batchUpdate(sheetId: string, requests: object[]): Promise<void> {
  await sheets().spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } });
}

export async function writeRange(sheetId: string, a1: string, values: unknown[][]): Promise<void> {
  await sheets().spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: a1,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function readColumn(sheetId: string, rangeA1: string): Promise<string[]> {
  const res = await sheets().spreadsheets.values.get({ spreadsheetId: sheetId, range: rangeA1 });
  return (res.data.values ?? []).map((row) => (row[0] != null ? String(row[0]) : ""));
}

export async function nextFreeRow(sheetId: string, tab: string, keyCol: string): Promise<number> {
  const col = await readColumn(sheetId, `${tab}!${keyCol}1:${keyCol}`);
  return col.length + 1;
}

/** A link cell. `numeric` leaves the label unquoted so the cell stays a number
 * (End Odo doubles as a Distance-formula operand). No url -> empty cell, a
 * visible gap rather than an unlinked "photo" that claims evidence exists. */
export function hyperlink(url: string | null | undefined, label: string | number | null, numeric = false): string {
  if (!url || label == null || label === "") return "";
  return numeric ? `=HYPERLINK("${url}",${label})` : `=HYPERLINK("${url}","${label}")`;
}
