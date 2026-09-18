"use client";

import { useCallback, useEffect, useState } from "react";

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

const STORE = "agency-priorities-v1";

const ENFORCEMENT_LABEL: Record<string, string> = {
  script: "A checker refuses the publish",
  context: "Nothing checks it",
  review: "Caught on inspection",
};

function kb(bytes: number): string {
  return bytes >= 1000 ? `${(bytes / 1000).toFixed(1)} KB` : `${bytes} B`;
}

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-cream/12">
      <div
        className="h-1.5 rounded-full bg-gold transition-[width] duration-300"
        style={{ width: `${(done / total) * 100}%` }}
      />
    </div>
  );
}

type Quadrant = "I" | "II" | "III" | "IV";

const QUADRANT_META: Record<
  Quadrant,
  { label: string; fill: string; zone: string }
> = {
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

function QuadrantMatrix({
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
    const y =
      PAD + ((10 - score) / 9) * (100 - 2 * PAD) + jitter(c.slug + "y", 1.2);
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

// The deck is imported here rather than handed down as a prop from the server
// page: 35 rules is ~31KB, and crossing the RSC boundary would serialize all of
// it into the HTML payload on top of the client chunk that already holds it.
const cards = deck.cards as Card[];

export default function PriorityGame() {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [at, setAt] = useState(0);
  const [sent, setSent] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const [failure, setFailure] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"list" | "matrix">("list");

  // Nothing here is worth losing to a closed tab mid-deck, and a half-scored
  // deck is exactly when he would close it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, number>;
        setScores(saved);
        const next = cards.findIndex((c) => !(c.slug in saved));
        setAt(next === -1 ? cards.length : next);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(scores));
    } catch {}
  }, [scores, loaded]);

  const score = useCallback(
    (value: number) => {
      const card = cards[at];
      if (!card) return;
      setScores((prev) => ({ ...prev, [card.slug]: value }));
      setAt((i) => i + 1);
    },
    [at],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (at >= cards.length) return;
      if (e.key >= "1" && e.key <= "9") score(Number(e.key));
      else if (e.key === "0") score(10);
      else if (e.key === "Backspace" && at > 0) setAt((i) => i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, score]);

  const submit = async () => {
    setSent("sending");
    try {
      const res = await fetch("/agencypriorities/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scores }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setFailure(body.error ?? `HTTP ${res.status}`);
        setSent("failed");
        return;
      }
      setSent("done");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "network");
      setSent("failed");
    }
  };

  if (!loaded) return null;

  const card = cards[at];
  const ranked = [...cards]
    .filter((c) => c.slug in scores)
    .sort((a, b) => scores[b.slug] - scores[a.slug] || a.title.localeCompare(b.title));

  if (!card) {
    const bytesLow = ranked
      .filter((c) => scores[c.slug] <= 4)
      .reduce((sum, c) => sum + c.bytes, 0);
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
        <h1 className="font-display text-4xl text-cream sm:text-5xl">Scored</h1>
        <p className="mt-2 text-sm text-sage">
          {ranked.length} rules, {kb(bytesLow)} marked low
        </p>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => setView("list")}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              view === "list" ? "bg-gold text-ink" : "border border-cream/20 text-cream/70 hover:border-cream/50"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView("matrix")}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              view === "matrix" ? "bg-gold text-ink" : "border border-cream/20 text-cream/70 hover:border-cream/50"
            }`}
          >
            Matrix
          </button>
        </div>

        {view === "list" ? (
          <ol className="mt-6 space-y-2">
            {ranked.map((c) => (
              <li
                key={c.slug}
                className="flex items-center gap-4 rounded-2xl border border-cream/10 bg-cream/[0.04] px-4 py-3"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-base ${
                    scores[c.slug] >= 8
                      ? "bg-gold text-ink"
                      : scores[c.slug] <= 4
                        ? "bg-cream/10 text-cream/50"
                        : "bg-sage/25 text-cream"
                  }`}
                >
                  {scores[c.slug]}
                </span>
                <span className="flex-1 text-[15px] leading-snug text-cream/90">{c.title}</span>
                <span className="shrink-0 text-xs text-cream/35">{kb(c.bytes)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-6">
            <QuadrantMatrix cards={ranked} scores={scores} />
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button
            onClick={() => setAt(0)}
            className="text-sm text-sage underline underline-offset-4 hover:text-cream"
          >
            Start over
          </button>
          {sent !== "done" && (
            <button
              onClick={submit}
              disabled={sent === "sending"}
              className="rounded-full bg-gold px-8 py-3.5 text-base font-medium text-ink transition hover:bg-gold/85 active:scale-95 disabled:opacity-50"
            >
              {sent === "sending" ? "Sending" : "Send to the Librarian"}
            </button>
          )}
        </div>

        {sent === "done" && (
          <p className="mt-5 flex items-center gap-2 text-sm text-sage">
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
              <path
                d="M3 8.5l3.2 3.2L13 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sent. The Librarian rewrites them in this order.
          </p>
        )}
        {sent === "failed" && (
          <p className="mt-5 text-sm text-cream/70">
            Not sent: {failure}. Your scores are saved here, press again anytime.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:pt-10">
      <div className="mb-5 flex items-center gap-4">
        <span className="shrink-0 text-sm text-cream/45">
          {at + 1} of {cards.length}
        </span>
        <Bar done={at} total={cards.length} />
        <span className="shrink-0 text-sm text-cream/45">{kb(card.bytes)}</span>
      </div>

      <div className="rounded-3xl border border-cream/10 bg-cream/[0.04] p-6 sm:p-9">
        <p className="text-[13px] text-gold">
          {ENFORCEMENT_LABEL[card.enforcement] ?? card.enforcement}
        </p>
        <h1 className="mt-3 font-display text-[28px] leading-tight text-cream sm:text-4xl">
          {card.title}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-cream/90 sm:text-[17px]">{card.rule}</p>
        {card.why && (
          <p className="mt-5 rounded-2xl bg-ink/50 p-4 text-sm leading-relaxed text-sage sm:text-[15px]">
            {card.why}
          </p>
        )}
      </div>

      <div className="mt-7 grid grid-cols-5 gap-2.5 sm:grid-cols-10 sm:gap-3">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => score(n)}
            aria-label={`Score ${n}`}
            className={`aspect-square rounded-full font-display text-xl transition active:scale-95 sm:text-2xl ${
              scores[card.slug] === n
                ? "bg-gold text-ink"
                : "bg-cream/10 text-cream hover:bg-sage hover:text-ink"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-cream/45">Cut it</span>
        {at > 0 && (
          <button
            onClick={() => setAt((i) => i - 1)}
            className="rounded-full border border-cream/20 px-4 py-1.5 text-cream/70 transition hover:border-cream/50 hover:text-cream"
          >
            Back
          </button>
        )}
        <span className="text-cream/45">Keep it sharp</span>
      </div>
    </div>
  );
}
