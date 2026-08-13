"use client";

/**
 * The queue of logged activities that have not yet crossed into HubSpot, and
 * the review-then-file card for each. This is the browser's stand-in for
 * clientos's "read the dry output yourself, then write" step: the preview
 * below is the exact same deterministic output hubspot_notes.py would print
 * (see lib/hubspot-engagement.ts), rendered automatically, so Juan is always
 * the one reading it before the File button becomes the thing that writes.
 */

import { useEffect, useState, useTransition } from "react";
import { fileEngagement, previewEngagement, type EngagementOutcome } from "./engagement-actions";
import { Card, Ico } from "./ui";
import type { EngagementActivity } from "./dal";

export function EngagementQueue({ activities }: { activities: EngagementActivity[] }) {
  if (activities.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
        Ready to file to HubSpot
      </h2>
      <div className="flex flex-col gap-3">
        {activities.map((a) => (
          <EngagementRow key={a.id} activity={a} />
        ))}
      </div>
    </section>
  );
}

function EngagementRow({ activity }: { activity: EngagementActivity }) {
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

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-medium">{(activity.kind || "").replace(/_/g, " ")}</span>
        <span className="text-[12px] text-[#8A928C]">{(activity.at ?? "").slice(0, 16).replace("T", " ")}</span>
      </div>
      {activity.detail && <p className="mt-1 text-[13px] leading-relaxed text-[#5B6560]">{activity.detail}</p>}

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
          <div className="mt-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3 text-[12.5px] leading-relaxed text-[#3D4A44]">
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-[#8A928C]">
              Will file to {shown.result.accountName} as a {shown.result.otype.toLowerCase()}
              {shown.result.otype !== shown.result.etype && " (typed engagement not built yet, falls back to a note)"}
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
