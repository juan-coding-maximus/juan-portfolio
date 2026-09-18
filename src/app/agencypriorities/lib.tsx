"use client";

import { useState } from "react";

import deck from "./cards.json";

export type Card = {
  slug: string;
  title: string;
  enforcement: string;
  type: string;
  rule: string;
  why: string;
  session_note: string;
  bytes: number;
};

export const STORE = "agency-priorities-v1";

// The deck is imported here rather than handed down as a prop from a server
// page: 35 rules is ~31KB, and crossing the RSC boundary would serialize all of
// it into the HTML payload on top of the client chunk that already holds it.
export const cards = deck.cards as Card[];

export function kb(bytes: number): string {
  return bytes >= 1000 ? `${(bytes / 1000).toFixed(1)} KB` : `${bytes} B`;
}

export function loadScores(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

type Quadrant = "I" | "II" | "III" | "IV";

const QUADRANT_META: Record<Quadrant, { label: string; fill: string; zone: string }> = {
  I: { label: "Do first", fill: "fill-[#C9A24B]", zone: "fill-[#C9A24B]/[0.06]" },
  II: { label: "Worth it", fill: "fill-[#9FC4AE]", zone: "fill-[#9FC4AE]/[0.06]" },
  III: { label: "Low stakes", fill: "fill-[#F2EFE6]/40", zone: "fill-[#F2EFE6]/[0.03]" },
  IV: { label: "Cut it", fill: "fill-[#F2EFE6]/20", zone: "fill-transparent" },
};

// One dot per rule: bytes rank on x (percentile, so the median effort always
// falls at the centerline), the 1-10 score on y (the scale's own anchors, so
// 10 sits at the top and 1 at the bottom). Quadrant is derived from those same
// two numbers, never assigned by hand.
const PAD = 10;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function jitter(slug: string, range: number): number {
  const n = ((hash(slug) % 1000) + 1000) % 1000;
  return (n / 1000 - 0.5) * 2 * range;
}

function quadrantOf(x: number, score: number): Quadrant {
  const lowEffort = x < 50;
  const highYield = score >= 5.5;
  if (lowEffort && highYield) return "I";
  if (!lowEffort && highYield) return "II";
  if (lowEffort && !highYield) return "III";
  return "IV";
}

export function QuadrantMatrix({
  cards,
  scores,
}: {
  cards: Card[];
  scores: Record<string, number>;
}) {
  const [pinned, setPinned] = useState<string | null>(null);

  const byBytes = [...cards].sort((a, b) => a.bytes - b.bytes);
  const points = cards.map((c) => {
    const rank = byBytes.findIndex((b) => b.slug === c.slug);
    const score = scores[c.slug];
    const x = PAD + (rank / (cards.length - 1)) * (100 - 2 * PAD) + jitter(c.slug, 1.2);
    const y = PAD + ((10 - score) / 9) * (100 - 2 * PAD) + jitter(c.slug + "y", 1.2);
    return { card: c, score, x, y, quadrant: quadrantOf(x, score) };
  });

  const counts: Record<Quadrant, number> = { I: 0, II: 0, III: 0, IV: 0 };
  for (const p of points) counts[p.quadrant]++;

  const active = points.find((p) => p.card.slug === pinned) ?? null;

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {(Object.keys(QUADRANT_META) as Quadrant[]).map((q) => (
          <span
            key={q}
            className="flex items-center gap-1.5 rounded-full border border-cream/10 bg-cream/[0.04] px-3 py-1 text-xs text-cream/60"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
              <circle cx="4" cy="4" r="4" className={QUADRANT_META[q].fill} />
            </svg>
            {q} &middot; {QUADRANT_META[q].label} &middot; {counts[q]}
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <span className="flex w-6 shrink-0 items-center justify-center text-[11px] tracking-wide text-cream/35 [writing-mode:vertical-lr]">
          Yield
        </span>
        <svg viewBox="0 0 100 100" className="aspect-square w-full touch-manipulation">
          <rect x="0" y="0" width="50" height="50" className={QUADRANT_META.I.zone} />
          <rect x="50" y="0" width="50" height="50" className={QUADRANT_META.II.zone} />
          <rect x="0" y="50" width="50" height="50" className={QUADRANT_META.III.zone} />
          <rect x="50" y="50" width="50" height="50" className={QUADRANT_META.IV.zone} />
          <line x1="50" y1="0" x2="50" y2="100" className="stroke-[#F2EFE6]/12" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
          <line x1="0" y1="50" x2="100" y2="50" className="stroke-[#F2EFE6]/12" strokeWidth="0.4" strokeDasharray="1.5 1.5" />

          {(Object.keys(QUADRANT_META) as Quadrant[]).map((q) => {
            const pos: Record<Quadrant, [number, number]> = {
              I: [3, 8],
              II: [97, 8],
              III: [3, 96],
              IV: [97, 96],
            };
            const [qx, qy] = pos[q];
            return (
              <text
                key={q}
                x={qx}
                y={qy}
                textAnchor={qx < 50 ? "start" : "end"}
                className="fill-[#F2EFE6]/20 font-display"
                style={{ fontSize: "6px" }}
              >
                {q}
              </text>
            );
          })}

          {points.map((p) => (
            <g key={p.card.slug} onClick={() => setPinned(p.card.slug)} className="cursor-pointer">
              <circle cx={p.x} cy={p.y} r="4" fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={pinned === p.card.slug ? "2.4" : "1.7"}
                className={`${QUADRANT_META[p.quadrant].fill} stroke-[#13201A]/50 transition-[r]`}
                strokeWidth="0.3"
              >
                <title>
                  {p.card.title} &middot; {p.score}/10 &middot; {kb(p.card.bytes)}
                </title>
              </circle>
            </g>
          ))}
        </svg>
      </div>
      <p className="ml-8 mt-1.5 text-center text-[11px] tracking-wide text-cream/35">Effort</p>

      <div className="mt-4 min-h-[3.5rem] rounded-2xl border border-cream/10 bg-cream/[0.04] px-4 py-3">
        {active ? (
          <>
            <p className="text-[13px] text-gold">
              {active.quadrant} &middot; {QUADRANT_META[active.quadrant].label}
            </p>
            <p className="mt-1 text-[15px] text-cream/90">{active.card.title}</p>
            <p className="mt-0.5 text-xs text-cream/45">
              {active.score}/10 &middot; {kb(active.card.bytes)}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-cream/35">Tap a rule to see it</p>
        )}
      </div>
    </div>
  );
}
