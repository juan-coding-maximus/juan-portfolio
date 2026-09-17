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
    <div className="h-px w-full bg-cream/15">
      <div
        className="h-px bg-gold transition-[width] duration-300"
        style={{ width: `${(done / total) * 100}%` }}
      />
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

        <ol className="mt-10 space-y-px">
          {ranked.map((c) => (
            <li
              key={c.slug}
              className="flex items-baseline gap-4 border-b border-cream/10 py-2.5"
            >
              <span
                className={`w-7 shrink-0 text-right font-display text-lg ${
                  scores[c.slug] >= 8
                    ? "text-gold"
                    : scores[c.slug] <= 4
                      ? "text-cream/35"
                      : "text-cream"
                }`}
              >
                {scores[c.slug]}
              </span>
              <span className="flex-1 text-[15px] leading-snug text-cream/90">{c.title}</span>
              <span className="shrink-0 text-xs text-cream/35">{kb(c.bytes)}</span>
            </li>
          ))}
        </ol>

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
              className="rounded-full bg-gold px-6 py-2.5 text-sm font-medium text-ink transition hover:bg-gold/85 disabled:opacity-50"
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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4">
      <div className="pt-8">
        <div className="mb-3 flex items-baseline justify-between text-xs text-cream/40">
          <span>
            {at + 1} of {cards.length}
          </span>
          <span>{kb(card.bytes)}</span>
        </div>
        <Bar done={at} total={cards.length} />
      </div>

      <div className="flex flex-1 flex-col justify-center py-10">
        <p className="text-xs tracking-wide text-gold/80">
          {ENFORCEMENT_LABEL[card.enforcement] ?? card.enforcement}
        </p>
        <h1 className="mt-3 font-display text-3xl leading-tight text-cream sm:text-4xl">
          {card.title}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-cream/90 sm:text-base">{card.rule}</p>
        {card.why && (
          <p className="mt-4 border-l border-cream/15 pl-4 text-sm leading-relaxed text-sage">
            {card.why}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 bg-ink pb-8 pt-3">
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => score(n)}
              className={`rounded py-3 font-display text-base transition ${
                scores[card.slug] === n
                  ? "bg-gold text-ink"
                  : "bg-cream/8 text-cream/80 hover:bg-cream/15"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-cream/35">
          <span>Cut it</span>
          {at > 0 ? (
            <button onClick={() => setAt((i) => i - 1)} className="hover:text-cream">
              Back
            </button>
          ) : (
            <span />
          )}
          <span>Keep it sharp</span>
        </div>
      </div>
    </div>
  );
}
