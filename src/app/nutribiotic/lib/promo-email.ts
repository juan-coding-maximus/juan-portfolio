/**
 * Order-request notification to Juan. The ONE automatic send in the promo
 * system, and it is inward: Juan asked for it explicitly (2026-08-10), and it
 * goes to Juan's own inboxes alone. The buyer gets a confirmation SCREEN, not
 * an email, and the relay to the orders team stays a human paste from the
 * phone tab; both of those are outward and stay gated (agency principle 1).
 *
 * Transport is the agency's existing Gmail OAuth client (Google Cloud project
 * agency-gmail, the same credential bridges/gmail uses for the main account,
 * juan.arenas.rec@gmail.com, which already carries the gmail.send scope) —
 * reused rather than minting a new provider. Env, set in Vercel and
 * .env.local, never committed:
 *   NB_GMAIL_CLIENT_ID / NB_GMAIL_CLIENT_SECRET / NB_GMAIL_REFRESH_TOKEN
 *   NB_ORDER_EMAIL_TO   where requests land (comma-separated is fine)
 *
 * FAILURE IS NON-FATAL BY CONTRACT: the order row is already written before
 * this is called. The database is the record; this is a doorbell. A failed
 * send is logged and the request still surfaces on the phone tab.
 */

import "server-only";
import { relayText, clientTypeLabel, money, type PromoCode, type PromoOrder } from "./promo";

export const emailConfigured = (): boolean =>
  Boolean(
    process.env.NB_GMAIL_CLIENT_ID &&
      process.env.NB_GMAIL_CLIENT_SECRET &&
      process.env.NB_GMAIL_REFRESH_TOKEN &&
      process.env.NB_ORDER_EMAIL_TO,
  );

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.NB_GMAIL_CLIENT_ID!,
      client_secret: process.env.NB_GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.NB_GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`gmail token refresh -> HTTP ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function sendOrderNotification(order: PromoOrder, code: PromoCode): Promise<boolean> {
  if (!emailConfigured()) return false;

  const issuedToRequested = code.requested_at
    ? Math.round((new Date(code.requested_at).getTime() - new Date(code.created_at).getTime()) / 3600_000)
    : null;

  // Part one forwards verbatim to the orders team; part two is context for
  // Juan only, per the spec's email shape.
  const body = [
    relayText(order, code),
    "",
    "Context (yours, trim before forwarding):",
    `Code:        ${code.display_code} (${clientTypeLabel(code.snapshot.client_type)})`,
    `Client:      ${[code.client_name, code.client_company].filter(Boolean).join(", ") || "not named at issue"}`,
    `Issued:      ${new Date(code.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`,
    issuedToRequested !== null ? `Issue->request: ~${issuedToRequested}h` : null,
    `Margin shown: ${code.show_margin ? "yes" : "no"}`,
    order.totals ? `Total:       ${money(order.totals.you_pay)}` : null,
    `In the OS:   https://juanarenas.bio/nutribiotic/phone`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const subject = `Order request · ${order.company ?? "unknown"} · ${code.display_code}`;
  const rfc822 = [
    `To: ${process.env.NB_ORDER_EMAIL_TO}`,
    // RFC 2047: the subject travels as a header, so non-ASCII (the middot)
    // must be B-encoded or clients render mojibake.
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  const raw = Buffer.from(rfc822).toString("base64url");

  try {
    const token = await accessToken();
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) throw new Error(`gmail send -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return true;
  } catch (e) {
    console.error("promo order notification failed:", e);
    return false;
  }
}
