"use client";

/**
 * The queue of logged activities that have not yet crossed into HubSpot.
 * Every activity, Juan's own dictated note or an enrichment finding, now
 * files itself the moment lib/touchpoint.ts records it, no click (see that
 * file's autoFileEngagement). What lands here is only the activities that
 * failed to auto-file: a scope block, a missing company link, a HubSpot
 * error. The preview is the exact same deterministic output
 * hubspot_notes.py would print (see lib/hubspot-engagement.ts), so Juan can
 * read why before retrying by hand.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { fileEngagement, previewEngagement, type EngagementOutcome } from "./engagement-actions";
import { Card, Ico } from "./ui";
import type { EngagementActivity } from "./dal";

const AUTO_FILE_ACTOR = "enrichment";

export function EngagementQueue({ activities }: { activities: EngagementActivity[] }) {
  if (activities.length === 0) return null;
  const auto = activities.filter((a) => a.actor === AUTO_FILE_ACTOR);
  const manual = activities.filter((a) => a.actor !== AUTO_FILE_ACTOR);
  return (
    <section>
      {auto.length > 0 && <AutoFiler activities={auto} />}
      {manual.length > 0 && (
        <>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Ready to file to HubSpot
          </h2>
          <div className="flex flex-col gap-3">
            {manual.map((a) => (
              <EngagementRow key={a.id} activity={a} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Files enrichment activities the moment they land here, no card, no click.
 * A failure that Juan can't act on from here (a scope block, a plain
 * HubSpot error, one already filed) is just noise on the screen he opens
 * first; only a failure that resolves to an actual "File to HubSpot" button
 * is worth a card. See EngagementRow's `actionableOnly`. */
function AutoFiler({ activities }: { activities: EngagementActivity[] }) {
  const fired = useRef(new Set<number>());
  const [failed, setFailed] = useState<EngagementActivity[]>([]);

  useEffect(() => {
    for (const a of activities) {
      if (fired.current.has(a.id)) continue;
      fired.current.add(a.id);
      fileEngagement(a.id).then((res) => {
        if (!res.ok) setFailed((f) => [...f, a]);
      });
    }
  }, [activities]);

  if (failed.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-3">
      {failed.map((a) => (
        <EngagementRow key={a.id} activity={a} actionableOnly />
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
}: {
  activity: EngagementActivity;
  actionableOnly?: boolean;
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

  return (
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
            <div className="mt-3 flex items-center gap-1.5 text-[13px] text-[#2C6A46]">
              <Ico name="check" size={13} />
              Filed as {shown.result.otype.toLowerCase()} {shown.result.noteId}
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
  );
}
