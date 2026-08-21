/**
 * Shared UI primitives.
 *
 * House rules, per the agency standing direction:
 *   - Editorial SVG icons only. Never emoji. Never a spark/sparkle/star-burst.
 *   - No em dashes in any UI copy.
 *   - One accent; signals live in labels, not in a rainbow of colors.
 *   - Every one-tap confirm (a candidate pill, a "YES!", an "Approve") ends in
 *     SuccessNote below, inline, in place, never a silent success or a toast
 *     that can be missed. Agency-wide rule, Juan 2026-08-19: see
 *     AccountMatchResolver in ./new-account-ui.tsx for the reference use.
 */

import type { ReactNode } from "react";
import type { CustomStopKind } from "./dal";

/** What a non-account route stop is called on screen. One noun, no adjectives. */
export const CUSTOM_STOP_LABEL: Record<CustomStopKind, string> = {
  lunch: "Lunch",
  hotel: "Hotel",
  stop: "Stop",
};

const ICONS: Record<string, ReactNode> = {
  today: <><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.3 1.4" /></>,
  pipeline: <><path d="M2 4h12M4 8h8M6 12h4" /></>,
  accounts: <><rect x="2.2" y="3" width="11.6" height="10" rx="1.4" /><path d="M2.2 6.4h11.6M6 6.4V13" /></>,
  route: <><circle cx="4" cy="4" r="1.8" /><circle cx="12" cy="12" r="1.8" /><path d="M4 5.8v3.4a2.8 2.8 0 0 0 2.8 2.8h3.4" /></>,
  outbound: <><path d="M2.4 4.2h11.2v7.6H2.4z" /><path d="m2.4 4.6 5.6 4 5.6-4" /></>,
  support: <><circle cx="8" cy="8" r="6.2" /><path d="M6.3 6.3a1.8 1.8 0 1 1 2.3 2.3c-.5.2-.6.6-.6 1M8 11.4h.01" /></>,
  metrics: <><path d="M2.5 13V8.4M6.2 13V4.2M9.8 13V6.8M13.5 13V3" /></>,
  clock: <><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.3 1.4" /></>,
  pin: <><path d="M8 14s4.6-4.2 4.6-7.4A4.6 4.6 0 0 0 3.4 6.6C3.4 9.8 8 14 8 14Z" /><circle cx="8" cy="6.5" r="1.7" /></>,
  wand: <><path d="M3 13 11 5M9.6 3.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5zM13 8.4l.35.9.9.35-.9.35-.35.9-.35-.9-.9-.35.9-.35z" /></>,
  alert: <><path d="M8 2.6 14.2 13H1.8L8 2.6Z" /><path d="M8 6.6v3M8 11.4h.01" /></>,
  check: <><path d="m3 8.4 3.2 3.2L13 4.8" /></>,
  close: <><path d="m3.6 3.6 8.8 8.8M12.4 3.6l-8.8 8.8" /></>,
  mail: <><path d="M2.4 4.2h11.2v7.6H2.4z" /><path d="m2.4 4.6 5.6 4 5.6-4" /></>,
  globe: <><circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4M8 1.8c2.1 1.9 2.1 10.5 0 12.4M8 1.8c-2.1 1.9-2.1 10.5 0 12.4" /></>,
  instagram: (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="3" />
      <circle cx="8" cy="8" r="3.1" />
      <circle cx="11.5" cy="4.5" r="0.55" fill="currentColor" stroke="none" />
    </>
  ),
  facebook: <><rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2.4" /><path d="M9.6 13V8.3h1.5l.3-1.9H9.6V5.2c0-.6.2-.9.9-.9h.9V2.5c-.2 0-.9-.1-1.5-.1-1.6 0-2.6.9-2.6 2.7v1.3H5.9v1.9h1.4V13" /></>,
  linkedin: <><rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2.4" /><circle cx="5.4" cy="5.5" r="0.85" fill="currentColor" stroke="none" /><path d="M5.4 7.6V12M8.3 12V9.3c0-1.1.9-1.7 1.8-1.7s1.7.6 1.7 1.7V12M8.3 7.6V12" /></>,
  mic: <><rect x="5.6" y="1.8" width="4.8" height="8" rx="2.4" /><path d="M3.2 7.6a4.8 4.8 0 0 0 9.6 0M8 12.4v1.8M5.8 14.2h4.4" /></>,
  stop: <><rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.6" /></>,
  review: <><path d="M3.4 2.6h9.2v10.8H3.4z" /><path d="M5.8 6.2h4.4M5.8 8.6h4.4M5.8 11h2.6" /></>,
  flag: <><path d="M3.8 14.2V2.2" /><path d="M3.8 2.8h8.4l-1.9 2.8 1.9 2.8H3.8" /></>,
  book: <><path d="M8 3.4C6.9 2.5 5 2.2 3 2.2v10.2c2 0 3.9.3 5 1.2 1.1-.9 3-1.2 5-1.2V2.2c-2 0-3.9.3-5 1.2Z" /><path d="M8 3.4v10.2" /></>,
  locate: <><circle cx="8" cy="8" r="2.3" /><path d="M8 1.6v2.5M8 11.9v2.5M1.6 8h2.5M11.9 8h2.5" /></>,
  // Route reordering (0029). Bare chevrons, no shaft: at 13px a full arrow
  // turns to mud, and these sit four-abreast in a row of small controls.
  "chevron-up": <><path d="m4 10 4-4 4 4" /></>,
  "chevron-down": <><path d="m4 6 4 4 4-4" /></>,
  phone: <><path d="M5.6 2.6H3.4c-.7 0-1.3.6-1.2 1.3.3 5.2 4.7 9.6 9.9 9.9.7.1 1.3-.5 1.3-1.2v-2.2l-2.8-.9-1.2 1.4a9.4 9.4 0 0 1-4.1-4.1l1.4-1.2z" /></>,
  tag: <><path d="M2.6 2.6h5.2l5.6 5.6c.5.5.5 1.3 0 1.8l-3.4 3.4c-.5.5-1.3.5-1.8 0L2.6 7.8z" /><circle cx="5.7" cy="5.7" r="0.6" fill="currentColor" stroke="none" /></>,
  external: <><path d="M9 2.6h4.4V7" /><path d="M13.4 2.6 7.6 8.4" /><path d="M11.8 9.4v3.2c0 .5-.4.9-.9.9H3.4c-.5 0-.9-.4-.9-.9V5.1c0-.5.4-.9.9-.9h3.2" /></>,
  whatsapp: <><path d="M2.6 3.4h10.8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6.4l-2.8 2.3v-2.3H2.6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" /><path d="M5.2 6.4h5.6M5.2 8.6h3.6" /></>,
  imessage: <><path d="M8 2.4c3.5 0 6.2 2.3 6.2 5.2S11.5 12.8 8 12.8c-.6 0-1.2-.07-1.7-.2l-2.9 1.6.6-2.6C2.7 10.6 1.8 9.2 1.8 7.6 1.8 4.7 4.5 2.4 8 2.4Z" /></>,
  plus: <><path d="M8 2.6v10.8M2.6 8h10.8" /></>,
  camera: <><path d="M2.4 5.4h2.2l1-1.6h4.8l1 1.6h2.2v7.2H2.4z" /><circle cx="8" cy="9" r="2.3" /></>,
  gauge: <><circle cx="8" cy="8.6" r="5.8" /><path d="M8 8.6 10.6 6M5.4 8.6h5.2" strokeLinecap="round" /></>,
  receipt: <><path d="M4 2.4h8v11.2l-1.4-1-1.4 1-1.2-1-1.2 1-1.4-1-1.4 1z" /><path d="M6 5.6h4M6 8h4M6 10.4h2.6" /></>,
  more: <><circle cx="4" cy="8" r="1.15" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1.15" fill="currentColor" stroke="none" /></>,
};

/**
 * The one place a HubSpot company record's URL is built.
 *
 * app-eu1, not app.hubspot.com: portal 148711228 lives in HubSpot's EU data
 * region and the generic .com host lands on a chooser rather than the record.
 * 0-2 is HubSpot's own object type id for companies, not something this app
 * assigns. Was copy-pasted in three screens until 2026-08-05; a wrong host
 * here is a dead link in a parked car, so it is worth having exactly once.
 */
export const HUBSPOT_COMPANY_URL = (hubspotId: string) =>
  `https://app-eu1.hubspot.com/contacts/148711228/record/0-2/${hubspotId}`;

/**
 * The one place a GO button's destination is built, for the same reason the
 * HubSpot URL has one: a dead deep link is discovered in a parked car.
 *
 * BY ADDRESS WHEN THERE IS ONE (Juan, 2026-08-14). A coordinate pair drops an
 * unnamed pin in the middle of a parking lot: exact to the metre and no help at
 * all in confirming you are at the right door. An address resolves to the
 * business card, with the name, the hours, and Maps' own call button on it. The
 * addresses this passes are Places-verified for exactly the accounts that have
 * a pin at all (see geocode.py's corroboration rule), so this is not precision
 * traded away for a guess, and coordinates remain the fallback when a record is
 * missing a street or a city.
 *
 * A MULTI-STOP ROUTE STILL USES COORDINATES. Apple caps the query it accepts,
 * and a dozen spelled-out addresses blow past it; see RoutePanel.
 */
export function appleMapsUrl(dest: { address?: string | null; lat: number; lng: number }): string {
  const address = dest.address?.trim();
  return `https://maps.apple.com/?daddr=${address ? encodeURIComponent(address) : `${dest.lat},${dest.lng}`}`;
}

/**
 * "621 RUSHING CREEK PL, THOUSAND OAKS, CA, 91360", or null when the record is
 * too thin to name a place. Street AND city are both required: "CA, 91360"
 * alone geocodes to a postal centroid, which is the very thing the coordinate
 * fallback is better at.
 */
export function fullAddress(a: {
  street: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
}): string | null {
  if (!a.street || !a.city) return null;
  return [a.street, a.city, a.state, a.postal].filter(Boolean).join(", ");
}

/**
 * The confirmation beat every "YES!"-style write ends in (Juan, 2026-08-19:
 * a one-tap confirm button is only trustworthy if the tap visibly did
 * something). Inline, in the surface the tap happened on, never a toast that
 * can be missed. `hubspotFiled` is optional: some confirms (a calendar
 * approval, a dismiss) never touch the portal at all, and the HubSpot line
 * only renders when the caller passes it.
 */
export function SuccessNote({
  title,
  detail,
  hubspotFiled,
  hubspotId,
  hubspotError,
  hubspotFiledLabel,
  hubspotErrorLabel,
  meta,
}: {
  title: string;
  detail?: string | null;
  hubspotFiled?: boolean;
  hubspotId?: string | null;
  hubspotError?: string | null;
  /** Overrides the default "Filed to HubSpot" line, for confirms that aren't
   * filing a touchpoint (e.g. pushing a single property). */
  hubspotFiledLabel?: string;
  /** Overrides the default "queue below to retry" line, which is only true
   * for touchpoint filing. */
  hubspotErrorLabel?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-3 py-2.5 text-[13px] leading-relaxed text-[#3D4A44]">
      <div className="flex items-center gap-1.5 font-medium text-[#2C6A46]">
        <Ico name="check" size={13} />
        {title}
      </div>
      {detail && <div className="mt-1 text-[#5B6560]">{detail}</div>}
      {hubspotFiled !== undefined && (
        <div className={`mt-1.5 flex items-center gap-1.5 text-[12px] ${hubspotFiled ? "text-[#8A928C]" : "text-[#8A6D2F]"}`}>
          <Ico name={hubspotFiled ? "check" : "alert"} size={11} />
          {hubspotFiled
            ? (hubspotFiledLabel ?? `Filed to HubSpot${hubspotId ? ` (${hubspotId})` : ""}.`)
            : (hubspotErrorLabel ?? `Not filed to HubSpot yet: ${hubspotError ?? "unknown error"}. It's waiting in the queue below to retry.`)}
        </div>
      )}
      {meta}
    </div>
  );
}

export function Ico({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {ICONS[name] ?? ICONS.today}
    </svg>
  );
}

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-[family-name:var(--font-fraunces)] text-[27px] leading-tight font-semibold tracking-tight">
        {title}
      </h1>
      {sub && <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-[#5B6560]">{sub}</p>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[#E2DFD5] bg-white p-5 ${className}`}>{children}</div>
  );
}

/**
 * A grade letter, ALWAYS carrying the scale it was measured on.
 *
 * TWO DIFFERENT LETTERS EXIST IN THIS OS and they answer different questions.
 * Juan, 2026-08-02: an account read "C" in HubSpot and "A" here, which looks
 * like a sync bug and is not one. Verified the same day against all 273 live
 * company records: nb_accounts.potential_hq equals HubSpot's potential__cloned_
 * on 273 of 273, zero drift. What differs is the QUESTION:
 *
 *   scale="os"  nb_v_account_tier.tier, A-D. Fit x engagement, computed by
 *               score.py. "Is this account worth the drive this week."
 *   scale="hq"  nb_accounts.potential_hq, A-G, mirrored from HubSpot and owned
 *               there (hubspot_fields.json marks it mirror:true). "How big could
 *               this account ever be, on HQ's own scale."
 *
 * A large dormant grocery account is OS tier A (big lifetime spend, long overdue)
 * and HQ potential C on the same day. Both are right. 214 of the 273 accounts
 * disagree by design, so an unlabelled letter beside another unlabelled letter is
 * not a small ambiguity, it is the common case. Hence: no bare letter without its
 * scale, anywhere. (No account named here: this repo is public, and AGENTS.md
 * HARD RULE 9 keeps the employer's customer names out of git.)
 */
export function TierChip({ tier, scale = "os" }: { tier: string | null; scale?: "os" | "hq" }) {
  const t = tier ?? "?";
  // One accent. The grade reads from the letter, not from a color code, so the
  // list stays legible to anyone and survives being printed.
  const strong = t === "A";
  return (
    <span
      className={`inline-flex h-[21px] w-[21px] items-center justify-center rounded text-[12px] font-semibold ${
        strong ? "bg-[#14201B] text-[#F7F6F1]" : "bg-[#ECEAE1] text-[#3D4A44]"
      }`}
      title={
        scale === "hq"
          ? `HQ potential ${t} (A-G, HubSpot's own grade, mirrored)`
          : `OS tier ${t} (A-D, fit x engagement). Not HQ's potential grade.`
      }
    >
      {t}
    </span>
  );
}

/**
 * Confidence, rendered as a first-class value rather than metadata.
 *
 * This exists because a fit score computed from one measured input out of three
 * looks exactly like a fully-measured one on screen, and acting on the first as
 * though it were the second is the most likely way this OS misleads its user.
 * Low-confidence values are visually demoted and always show their input count.
 */
export function Confidence({
  value,
  known,
  total,
}: {
  value: number | null;
  known?: number | null;
  total?: number | null;
}) {
  const c = value ?? 0;
  const low = c < 0.5;
  return (
    <span
      className={`inline-flex items-baseline gap-1 text-[12px] ${low ? "text-[#A79878]" : "text-[#5B6560]"}`}
      title={
        low
          ? "Low confidence. Most inputs are unmeasured, so this ranking is weak evidence and cannot enter route band 1."
          : "Confidence: share of scoring inputs actually measured rather than defaulted."
      }
    >
      {known != null && total != null ? `${known} of ${total} inputs` : `${(c * 100).toFixed(0)}%`}
      {low && <span className="font-medium">· low</span>}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  caution,
}: {
  label: string;
  value: string;
  hint?: string;
  caution?: string;
}) {
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">{label}</div>
      <div className="mt-2 font-[family-name:var(--font-fraunces)] text-[30px] leading-none font-semibold tracking-tight">
        {value}
      </div>
      {hint && <div className="mt-2 text-[12.5px] text-[#5B6560]">{hint}</div>}
      {caution && (
        <div className="mt-2 flex items-start gap-1.5 text-[12px] text-[#A0762C]">
          <Ico name="alert" size={13} />
          <span>{caution}</span>
        </div>
      )}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Card className="text-[14px] text-[#5B6560]">{children}</Card>
  );
}

/** One pulsing placeholder bar, for loading.tsx skeletons. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#EDEBE3] ${className}`} />;
}

/**
 * A loading.tsx skeleton for a title plus a stack of card-shaped bars. Used
 * across the bottom-nav routes so each gets a real Suspense boundary: without
 * one, Next prefetches the whole dynamic page and holds it client-side until
 * the app reloads, which is why the tab bar's targets need this, not polish.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <SkeletonBar className="mb-4 h-7 w-40" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBar key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function daysAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 60) return `${d}d ago`;
  if (d < 730) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

/**
 * The one phone number on a profile that matters: dial-ready at a glance from
 * the car. Digit groups are visibly larger than the "+1" and the dashes so the
 * number itself is what the eye lands on, not the punctuation around it.
 */
export function PhoneDisplay({ value }: { value: string | null }) {
  if (!value) return null;

  const m = value.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (!m) {
    return (
      <span className="font-[family-name:var(--font-fraunces)] text-[17px] font-bold text-[#14201B]">{value}</span>
    );
  }
  const [, area, mid, last] = m;
  return (
    <a
      href={`tel:${value}`}
      className="font-[family-name:var(--font-fraunces)] font-bold text-[#14201B] transition-opacity hover:opacity-80"
    >
      <span className="text-[13px]">+1</span>{" "}
      <span className="text-[23px] tracking-tight tabular-nums">{area}</span>
      <span className="mx-[3px] text-[13px]">-</span>
      <span className="text-[23px] tracking-tight tabular-nums">{mid}</span>
      <span className="mx-[3px] text-[13px]">-</span>
      <span className="text-[23px] tracking-tight tabular-nums">{last}</span>
    </a>
  );
}

/** "+13105551234" -> "(310) 555-1234". Anything else is shown as stored. */
export function prettyPhone(value: string): string {
  const m = value.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : value;
}

/** "https://www.store.com/shop" -> "store.com/shop", for a link label. */
export function prettyUrl(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

/**
 * Stored sites are inconsistently schemed ("islavistafood.coop" as often as
 * "https://islavistafood.coop"). An `href` without a scheme resolves as a
 * path on this site rather than an external link, which is a redirect to a
 * 404 disguised as a working button. Always use this for an `<a href>` built
 * from a stored `website`, never the raw column value.
 */
export function absoluteUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * "unknown" is a seed default meaning nobody has classified this account yet,
 * not a real channel. It must read as absent, not as a value, so callers
 * treat it like null rather than printing the literal word.
 */
export function realChannel(channel: string | null | undefined): string | null {
  return channel && channel !== "unknown" ? channel : null;
}

/**
 * The three ways to reach a stop before you drive to it: the HubSpot record,
 * the site, the phone. Juan's ask 2026-08-05, for every stop on a route.
 *
 * WHAT IS MISSING IS SAID OUT LOUD, in muted type, rather than left blank. A
 * missing link and a link nobody has looked for are the same silence on screen
 * otherwise, and "no site on file" is the line that sends someone to go find
 * one. Each absent piece is one short phrase, never a sentence.
 */
export function ReachLinks({
  hubspotId,
  website,
  phone,
  className = "",
}: {
  hubspotId: string | null;
  website: string | null;
  phone: string | null;
  className?: string;
}) {
  const link =
    "inline-flex items-center gap-1 font-medium text-[#3D4A44] underline-offset-2 hover:text-[#14201B] hover:underline";
  const absent = "inline-flex items-center gap-1 text-[#A9AFA9]";

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] ${className}`}>
      {hubspotId ? (
        <a href={HUBSPOT_COMPANY_URL(hubspotId)} target="_blank" rel="noopener noreferrer" className={link}>
          <Ico name="external" size={12} />
          HubSpot
        </a>
      ) : (
        <span className={absent}>not in HubSpot</span>
      )}

      {website ? (
        <a href={absoluteUrl(website)} target="_blank" rel="noopener noreferrer" className={`${link} min-w-0`}>
          <Ico name="globe" size={12} />
          <span className="max-w-[22ch] truncate">{prettyUrl(website)}</span>
        </a>
      ) : (
        <span className={absent}>no site on file</span>
      )}

      {phone ? (
        <a href={`tel:${phone}`} className={`${link} tabular-nums`}>
          <Ico name="phone" size={12} />
          {prettyPhone(phone)}
        </a>
      ) : (
        <span className={absent}>no phone on file</span>
      )}
    </div>
  );
}

export function money(n: number | null | undefined): string {
  if (n == null) return "$0";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** "2026-07-16" -> "Jul 16, 2026". The exact date, not a relative one; see
 * daysAgo() for "how long ago" instead. */
export function exactDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
