/**
 * A report link that is still alive when Juan clicks it.
 *
 * WHAT BROKE (2026-09-21). Every link and inline preview on the Reports tab
 * was a Supabase signed storage URL minted while the PAGE rendered: 900
 * seconds for the day/week previews, 300 for the archive list. A signed URL
 * starts ageing the moment it is created, not the moment it is used, so a tab
 * left open through a phone call handed back
 * `{"statusCode":"400","error":"InvalidJWT","message":"\"exp\" claim timestamp
 * check failed"}`. Juan read that as corrupted files, which is the right
 * reading of it: nothing on the page says the link has a five-minute fuse.
 *
 * Raising the expiry would only move the fuse. The page now links HERE, a
 * stable path that never expires, and the signature is minted at the moment of
 * the click and redirected to immediately, so its lifetime covers one request
 * instead of however long a tab sits open.
 *
 * THE BUCKET STAYS PRIVATE. This route is behind the same device gate as every
 * other NutriBiotic screen, and the object name is checked against a strict
 * pattern before it reaches Supabase: a plain filename, no slashes, no
 * traversal, .pdf only. Signing is still what fetches the file, so an object
 * this route would decline to name is still unreachable without a signature.
 */
import { NextRequest } from "next/server";
import { hasAccess } from "../../lib/devices";
import { signReportObject } from "../../lib/dal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A report filename and nothing else. No path separator can survive this, so
// the name cannot climb out of the bucket or into another one.
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.pdf$/;

export async function GET(req: NextRequest) {
  if (!(await hasAccess())) {
    return new Response("Not available", { status: 403, headers: { "cache-control": "no-store" } });
  }
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!NAME.test(name) || name.includes("..")) {
    return new Response("Bad report name", { status: 400, headers: { "cache-control": "no-store" } });
  }
  const signed = await signReportObject(name);
  if (!signed) {
    return new Response("That report is not in the bucket", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }
  return Response.redirect(signed, 302);
}
