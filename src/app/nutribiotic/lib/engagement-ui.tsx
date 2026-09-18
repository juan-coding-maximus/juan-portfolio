"use client";

/**
 * The queue of logged activities that have not yet crossed into HubSpot.
 * Every activity, Juan's own dictated note or an enrichment finding, now
 * files itself the moment lib/touchpoint.ts records it, no click (see that
 * file's autoFileEngagement). This queue is the safety net for whatever
 * didn't: it fires the same auto-file attempt again the instant it renders,
 * for every activity regardless of who/what logged it (2026-09-16, Juan:
 * "it should either file immediately or not at all", after actor==="juan"
 * activities — the Visit tab, the clientos door whose /api/touchpoint call
 * opts out of insert-time auto-file on purpose so this queue is the actual
 * gate — sat forever behind a manual "File to HubSpot" button even when the
 * note was already complete and clean). What's left on screen after that
 * retry is only the activities that still failed: a scope block, a missing
 * company link, a real HubSpot error. The preview is the exact same
 * deterministic output hubspot_notes.py would print (see
 * lib/hubspot-engagement.ts), so Juan can read why before retrying by hand.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { fileEngagement, previewEngagement, type EngagementOutcome } from "./engagement-actions";
import { ResolvingRow } from "./queue-ui";
import { Card, Ico, SuccessNote } from "./ui";
import type { EngagementActivity } from "./dal";

export function EngagementQueue({ activities }: { activities: EngagementActivity[] }) {
  if (activities.length === 0) return null;
  return (
    <section>
      <AutoFiler activities={activities} />
    </section>
  );
}

/** Files every activity the moment it lands here, no card, no click. A
 * failure that Juan can't act on from here (a scope block, a plain
 * HubSpot error, one already filed) is just noise on the screen he opens
 * first; only a failure that resolves to an actual "File to HubSpot" button
 * is worth a card. See EngagementRow's `actionableOnly`. */
function AutoFiler({ activities }: { activities: EngagementActivity[] }) {
  const fired = useRef(new Set<number>());
  const [failed, setFailed] = useState<EngagementActivity[]>([]);
  // Rows that have since filed by hand and finished their exit. A card whose
  // whole job was "this one still needs filing" has no reason to stay once it
  // is filed (Juan, 2026-09-17).
  const [gone, setGone] = useState<Set<number>>(new Set());

  useEffect(() => {
    for (const a of activities) {
      if (fired.current.has(a.id)) continue;
      fired.current.add(a.id);
      fileEngagement(a.id).then((res) => {
        if (!res.ok) setFailed((f) => [...f, a]);
      });
    }
  }, [activities]);

  const open = failed.filter((a) => !gone.has(a.id));
  if (open.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-3">
      {open.map((a) => (
        <EngagementRow
          key={a.id}
          activity={a}
          actionableOnly
          onGone={() => setGone((prev) => new Set(prev).add(a.id))}
        />
      ))}
    </div>
  );
}

/** `actionableOnly`: render nothing unless there's a "File to HubSpot" button
 * to click, or Juan already clicked it. A card that only ever says "here's
 * an error" or "already filed" gives no decision to make; it's noise on the
 * screen he opens first. Once he's interacted (pending/filed), the result
 * of that click stays visible regardless. */
function EngagementRow({
  activity,
  actionableOnly = false,
  onGone,
}: {
  activity: EngagementActivity;
  actionableOnly?: boolean;
  /** Called once the row has confirmed the filing and finished leaving. */
  onGone?: () => void;
}) {
  const [preview, setPreview] = useState<EngagementOutcome | null>(null);
  const [filed, setFiled] = useState<EngagementOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    previewEngagement(activity.id).then((res) => {
      if (live) setPreview(res);
    });
    return () => {
      live = false;
    };
  }, [activity.id]);

  function file() {
    startTransition(async () => {
      setFiled(await fileEngagement(activity.id));
    });
  }

  const shown = filed ?? preview;
  const interacted = pending || filed !== null;
  const hasAction = shown?.ok && !shown.result.alreadyFiledId && !shown.result.wrote;

  if (actionableOnly && !interacted && !hasAction) return null;

  // Filed by hand: confirm, then go. Only a filing the server confirmed
  // (`wrote`) counts; an error or a scope block keeps the card exactly where
  // it is, because that is work still to do.
  const filedNow = Boolean(filed?.ok && filed.result.wrote);

  return (
    <ResolvingRow resolved={filedNow} onGone={() => onGone?.()}>
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-medium">{(activity.kind || "").replace(/_/g, " ")}</span>
        <span className="text-[12px] text-[#8A928C]">{(activity.at ?? "").slice(0, 16).replace("T", " ")}</span>
      </div>
      {/* Once the preview box below has loaded it's the actual filing text,
          a superset of this raw detail, so this line steps aside for it
          rather than repeating the same paragraph twice. */}
      {activity.detail && !(shown?.ok && !shown.result.alreadyFiledId) && (
        <p className="mt-1 text-[13px] leading-relaxed text-[#5B6560]">{activity.detail}</p>
      )}

      {!shown && <div className="mt-3 text-[12.5px] text-[#8A928C]">Checking HubSpot...</div>}

      {shown && !shown.ok && (
        <div className="mt-3 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[13px] text-[#8A6D2F]">
          {shown.error}
        </div>
      )}

      {shown?.ok && shown.result.alreadyFiledId && (
        <div className="mt-3 flex items-center gap-1.5 text-[13px] text-[#5B6560]">
          <Ico name="check" size={13} />
          Already filed as {shown.result.otype.toLowerCase()} {shown.result.alreadyFiledId}
        </div>
      )}

      {shown?.ok && !shown.result.alreadyFiledId && (
        <>
          <div className="mt-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-2.5 text-[12.5px] leading-relaxed text-[#3D4A44]">
            <div className="mb-1 text-[11px] text-[#8A928C]">
              → {shown.result.accountName} · {shown.result.otype.toLowerCase()}
              {shown.result.otype !== shown.result.etype && " (falls back to a note)"}
            </div>
            {shown.result.lines.map((ln, i) => (
              <div key={i}>{ln || " "}</div>
            ))}
          </div>

          {shown.result.unmatchedPeople.length > 0 && (
            <div className="mt-2 text-[12px] text-[#8A6D2F]">
              {shown.result.unmatchedPeople.length} {shown.result.unmatchedPeople.length === 1 ? "person" : "people"} in
              the note {shown.result.unmatchedPeople.length === 1 ? "isn't" : "aren't"} in your contacts yet, not
              auto-created.
            </div>
          )}
          {shown.result.contactErrors.length > 0 && (
            <div className="mt-2 text-[12px] text-[#8A6D2F]">
              Contact lookup/creation failed ({shown.result.contactErrors[0]}); filing the {shown.result.otype.toLowerCase()}{" "}
              without it.
            </div>
          )}

          {shown.result.wrote ? (
            <div className="mt-3">
              <SuccessNote
                title={`Filed: ${shown.result.accountName}`}
                hubspotFiled
                hubspotId={shown.result.noteId}
              />
            </div>
          ) : (
            <button
              onClick={file}
              disabled={pending}
              className="mt-3 rounded-md bg-[#14201B] px-3.5 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Filing..." : "File to HubSpot"}
            </button>
          )}
        </>
      )}
    </Card>
    </ResolvingRow>
  );
}
