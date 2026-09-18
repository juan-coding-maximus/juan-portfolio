"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { QuadrantMatrix, cards, loadScores } from "../lib";

export function MatrixView() {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setScores(loadScores());
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  const scored = cards.filter((c) => c.slug in scores);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <h1 className="font-display text-4xl text-cream sm:text-5xl">Priority matrix</h1>
      <p className="mt-2 text-sm text-sage">Effort vs yield, scored rules</p>

      {scored.length === 0 ? (
        <p className="mt-8 text-[15px] text-cream/60">
          Nothing scored yet.{" "}
          <Link href="/agencypriorities" className="text-sage underline underline-offset-4 hover:text-cream">
            Score the deck
          </Link>{" "}
          first.
        </p>
      ) : (
        <div className="mt-8">
          <QuadrantMatrix cards={scored} scores={scores} />
        </div>
      )}

      <Link
        href="/agencypriorities"
        className="mt-10 inline-block text-sm text-sage underline underline-offset-4 hover:text-cream"
      >
        Back to the deck
      </Link>
    </div>
  );
}
