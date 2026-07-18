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

export function TierChip({ tier }: { tier: string | null }) {
  const t = tier ?? "?";
  // One accent. Tier reads from the letter, not from a color code, so the list
  // stays legible to anyone and survives being printed.
  const strong = t === "A";
  return (
    <span
      className={`inline-flex h-[21px] w-[21px] items-center justify-center rounded text-[12px] font-semibold ${
        strong ? "bg-[#14201B] text-[#F7F6F1]" : "bg-[#ECEAE1] text-[#3D4A44]"
      }`}
      title={`Tier ${t}`}
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

export function money(n: number | null | undefined): string {
  if (n == null) return "not known";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
