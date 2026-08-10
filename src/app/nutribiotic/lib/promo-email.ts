/**
 * Order-request notification to Juan. The ONE automatic send in the promo
 * system, and it is inward: Juan asked for it explicitly (2026-08-10), and it
 * goes to Juan's own inboxes alone. The buyer gets a confirmation SCREEN, not
 * an email, and the relay to the orders team stays a human paste; that send is
 * outward and stays gated (agency principle 1).
 *
 * FORMAT: multipart/alternative, HTML first-class (Juan reads this on a phone;
 * the flat text version rendered as a wall on iOS Gmail), plain text kept as
 * the fallback and as the verbatim RELAY TO ORDERS block inside the HTML, so
 * a forward still hands the orders team exact copyable text. Every dynamic
 * string is HTML-escaped: the buyer typed half of these fields.
 *
 * Transport is the agency's existing Gmail OAuth client (Google Cloud project
 * agency-gmail, main account, gmail.send scope) — reused rather than minting
 * a new provider. Env, set in Vercel and .env.local, never committed:
 *   NB_GMAIL_CLIENT_ID / NB_GMAIL_CLIENT_SECRET / NB_GMAIL_REFRESH_TOKEN
 *   NB_ORDER_EMAIL_TO   where requests land (comma-separated is fine)
 *
 * FAILURE IS NON-FATAL BY CONTRACT: the order row is already written before
 * this is called. The database is the record; this is a doorbell. A failed
 * send is logged and the request still surfaces on the phone tab.
 */

import "server-only";
import {
  relayText,
  clientTypeLabel,
  money,
  TERMS_PLAIN,
  type PromoCode,
  type PromoOrder,
} from "./promo";

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

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Palette matches the OS: off-white ground, near-black ink, one green accent. */
const INK = "#14201B";
const MUTE = "#5B6560";
const LINE = "#E2DFD5";
const GROUND = "#F7F6F1";
const ACCENT = "#4A6242";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

function buildHtml(order: PromoOrder, code: PromoCode): string {
  const mech = code.snapshot.mechanic;
  const mechLabel =
    mech?.type === "buy_x_get_y" ? `Buy ${mech.x}, get ${mech.y} free` :
    mech?.type === "percent_off" ? `${mech.pct}% off` : null;
  const disc = code.snapshot.baseline_discount_pct
    ? `${code.snapshot.baseline_discount_pct}% off the first order`
    : null;
  const offerLine = [mechLabel, disc].filter(Boolean).join(" + ");

  const itemRows = order.line_items
    .map(
      (l) => `
      <tr>
        <td style="padding:9px 0;border-top:1px solid ${LINE};font:14px ${SANS};color:${INK};">${esc(l.name)}</td>
        <td style="padding:9px 0;border-top:1px solid ${LINE};font:14px ${SANS};color:${INK};text-align:right;white-space:nowrap;">
          <strong>${l.qty_paid} paid</strong>${l.qty_free > 0 ? ` <span style="color:${ACCENT};">+ ${l.qty_free} free</span>` : ""}
          ${l.qty_paid !== l.original_qty_paid ? `<div style="font:11.5px ${SANS};color:${MUTE};">edited from ${l.original_qty_paid}</div>` : ""}
        </td>
      </tr>`,
    )
    .join("");

  const terms = code.snapshot.friction
    .map(
      (f) => `
      <tr>
        <td style="padding:7px 0 0;">
          <div style="font:600 13.5px ${SANS};color:${INK};">${esc(f)}</div>
          ${TERMS_PLAIN[f] ? `<div style="font:13px/1.5 ${SANS};color:${MUTE};">${esc(TERMS_PLAIN[f])}</div>` : ""}
        </td>
      </tr>`,
    )
    .join("");

  const contact = [
    ["Business", order.company],
    ["Name", order.contact_name],
    ["Email", order.contact_email],
    ["Phone", order.contact_phone],
    ["Ship to", order.ship_address?.text ?? null],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:4px 14px 4px 0;font:12px ${SANS};color:${MUTE};text-transform:uppercase;letter-spacing:0.08em;vertical-align:top;white-space:nowrap;">${k}</td>
        <td style="padding:4px 0;font:14px ${SANS};color:${INK};">${esc(v as string)}</td>
      </tr>`,
    )
    .join("");

  const issued = new Date(code.created_at).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:${GROUND};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};">
    <tr><td align="center" style="padding:28px 14px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <tr><td style="padding:0 4px 14px;">
          <div style="font:600 13px ${SANS};color:${MUTE};text-transform:uppercase;letter-spacing:0.18em;">NutriBiotic · new order request</div>
          <div style="font:600 30px ${SERIF};color:${INK};padding-top:6px;">${esc(order.company ?? "New account")}</div>
          <div style="font:14px ${SANS};color:${MUTE};padding-top:4px;">
            wants the <strong style="color:${INK};">${esc(clientTypeLabel(code.snapshot.client_type))}</strong> offer
            · code <span style="font-family:monospace;font-weight:600;color:${INK};">${esc(code.display_code)}</span>
          </div>
        </td></tr>

        <tr><td style="background:#FFFFFF;border:1px solid ${LINE};border-radius:10px;padding:20px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${contact}</table>
        </td></tr>

        <tr><td style="height:12px;"></td></tr>

        <tr><td style="background:#FFFFFF;border:1px solid ${LINE};border-radius:10px;padding:20px 22px;">
          <div style="font:600 12px ${SANS};color:${MUTE};text-transform:uppercase;letter-spacing:0.14em;padding-bottom:8px;">They are ordering</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
          ${offerLine ? `<div style="font:13.5px ${SANS};color:${MUTE};padding-top:10px;">Offer applied: <strong style="color:${INK};">${esc(offerLine)}</strong></div>` : ""}
          ${code.bonus_label ? `<div style="font:13.5px ${SANS};color:${MUTE};padding-top:3px;">Bonus: <strong style="color:${INK};">${esc(code.bonus_label)}</strong></div>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:2px solid ${INK};">
            <tr>
              <td style="padding-top:10px;font:14px ${SANS};color:${MUTE};">They pay, on invoice</td>
              <td style="padding-top:10px;font:600 26px ${SERIF};color:${INK};text-align:right;">${order.totals ? money(order.totals.you_pay) : ""}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="height:12px;"></td></tr>

        <tr><td style="background:#FFFFFF;border:1px solid ${LINE};border-radius:10px;padding:20px 22px;">
          <div style="font:600 12px ${SANS};color:${MUTE};text-transform:uppercase;letter-spacing:0.14em;">The terms, in plain words</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${terms}</table>
        </td></tr>

        ${order.notes ? `
        <tr><td style="height:12px;"></td></tr>
        <tr><td style="background:#FBF6E9;border:1px solid #E5D9BF;border-radius:10px;padding:16px 22px;">
          <div style="font:600 12px ${SANS};color:#8A6D2F;text-transform:uppercase;letter-spacing:0.14em;padding-bottom:4px;">Their note to you</div>
          <div style="font:14px/1.5 ${SANS};color:${INK};">${esc(order.notes)}</div>
        </td></tr>` : ""}

        <tr><td style="height:16px;"></td></tr>

        <tr><td align="center">
          <a href="https://juanarenas.bio/nutribiotic/phone"
             style="display:inline-block;background:${INK};color:${GROUND};font:600 15px ${SANS};text-decoration:none;padding:13px 30px;border-radius:8px;">
            Open in the OS
          </a>
        </td></tr>

        <tr><td style="height:20px;"></td></tr>

        <tr><td style="padding:0 4px;">
          <div style="font:12px/1.7 ${SANS};color:${MUTE};">
            Issued ${issued} to ${esc(code.client_name ?? "no name")} · margin ${code.show_margin ? "shown" : "hidden"} · Net 30, no payment collected.
          </div>
        </td></tr>

        <tr><td style="height:14px;"></td></tr>

        <tr><td style="background:#FFFFFF;border:1px dashed ${LINE};border-radius:10px;padding:14px 18px;">
          <div style="font:600 11px ${SANS};color:${MUTE};text-transform:uppercase;letter-spacing:0.14em;padding-bottom:6px;">Copy-paste block for the orders team</div>
          <pre style="margin:0;font:12px/1.6 'SF Mono', Menlo, Consolas, monospace;color:${INK};white-space:pre-wrap;">${esc(relayText(order, code))}</pre>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Wrap base64 at 76 chars per RFC 2045 so no MIME line exceeds limits. */
const b64lines = (s: string): string =>
  Buffer.from(s).toString("base64").replace(/(.{76})/g, "$1\r\n");

export async function sendOrderNotification(order: PromoOrder, code: PromoCode): Promise<boolean> {
  if (!emailConfigured()) return false;

  const plain = [
    relayText(order, code),
    "",
    `Code ${code.display_code} · ${clientTypeLabel(code.snapshot.client_type)} · issued to ${code.client_name ?? "no name"}`,
    order.totals ? `Total ${money(order.totals.you_pay)}` : null,
    "In the OS: https://juanarenas.bio/nutribiotic/phone",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const subject = `Order request · ${order.company ?? "unknown"} · ${order.totals ? money(order.totals.you_pay) : code.display_code}`;
  const boundary = "nbpromo_" + Date.now().toString(36);

  const rfc822 = [
    `To: ${process.env.NB_ORDER_EMAIL_TO}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64lines(plain),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64lines(buildHtml(order, code)),
    `--${boundary}--`,
  ].join("\r\n");

  try {
    const token = await accessToken();
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(rfc822).toString("base64url") }),
    });
    if (!res.ok) throw new Error(`gmail send -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return true;
  } catch (e) {
    console.error("promo order notification failed:", e);
    return false;
  }
}
