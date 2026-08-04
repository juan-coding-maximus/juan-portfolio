/**
 * Shared UI primitives.
 *
 * House rules, per the agency standing direction:
 *   - Editorial SVG icons only. Never emoji. Never a spark/sparkle/star-burst.
 *   - No em dashes in any UI copy.
 *   - One accent; signals live in labels, not in a rainbow of colors.
 */

import type { ReactNode } from "react";

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
};

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
  if (!value) return <span className="text-[13.5px] text-[#8A928C]">not known</span>;

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

export function money(n: number | null | undefined): string {
  if (n == null) return "not known";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
