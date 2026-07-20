"use client";

import { useState, useTransition } from "react";
import { decideCalendarProposal } from "./calendar-actions";
import { recordTouchpoint, type RecordTouchpointResult } from "./touchpoint";
import { Card, Ico } from "./ui";

export function TouchpointCapture() {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RecordTouchpointResult | null>(null);

  function submit() {
    const value = text;
    if (!value.trim() || pending) return;
    startTransition(async () => {
      const res = await recordTouchpoint(value);
      setResult(res);
      if (res.ok) setText("");
    });
  }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
        <Ico name="pin" size={13} />
        Record a touchpoint
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What just happened? e.g. Stopped by Lindberg, talked to Dana (assistant manager), she wants to try the probiotic line, following up Thursday at 2pm with samples."
        rows={3}
        className="w-full resize-none rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3 text-[13.5px] leading-relaxed text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="max-w-[46ch] text-[11.5px] leading-snug text-[#8A928C]">
          Becomes an activity log entry and contact detail right away. Any follow-up it hears goes below for you to
          approve before it touches your calendar.
        </p>
        <button
          onClick={submit}
          disabled={pending || !text.trim()}
          className="shrink-0 rounded-md bg-[#14201B] px-3.5 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Recording..." : "Record"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 rounded-md border px-3 py-2.5 text-[13px] leading-relaxed ${
            result.ok
              ? "border-[#E2DFD5] bg-[#FAF9F5] text-[#3D4A44]"
              : "border-[#E5D9BF] bg-[#FBF6E9] text-[#8A6D2F]"
          }`}
        >
          {result.ok ? (
            result.needsAccount ? (
              <>Logged, but couldn&apos;t confidently match an account. Add it by hand from the Accounts screen for now.</>
            ) : (
              <>
                Logged to <span className="font-medium">{result.accountName}</span>: {result.summary}
                {(result.peopleAdded > 0 || result.peopleUpdated > 0) && (
                  <>
                    {" · "}
                    {result.peopleAdded > 0 && `${result.peopleAdded} contact${result.peopleAdded === 1 ? "" : "s"} added`}
                    {result.peopleAdded > 0 && result.peopleUpdated > 0 && ", "}
                    {result.peopleUpdated > 0 && `${result.peopleUpdated} updated`}
                  </>
                )}
                {result.calendarProposals > 0 && (
                  <>
                    {" · "}
                    {result.calendarProposals} follow-up{result.calendarProposals === 1 ? "" : "s"} drafted below,
                    waiting on your approval
                  </>
                )}
              </>
            )
          ) : (
            result.error
          )}
        </div>
      )}
    </Card>
  );
}

export type ProposalRowData = {
  id: string;
  title: string;
  kind: string;
  starts_at: string | null;
  notes: string | null;
};

export function CalendarProposalRow({ proposal }: { proposal: ProposalRowData }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function decide(decision: "approved" | "dismissed") {
    startTransition(async () => {
      await decideCalendarProposal(proposal.id, decision);
      setDone(true);
    });
  }

  if (done) return null;

  const when = proposal.starts_at
    ? new Date(proposal.starts_at).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "no time stated";

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{proposal.title}</div>
        <div className="mt-0.5 truncate text-[12px] text-[#8A928C]">
          {proposal.kind} · {when}
          {proposal.notes ? ` · ${proposal.notes}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => decide("dismissed")}
          disabled={pending}
          className="rounded-md border border-[#E2DFD5] px-2.5 py-1.5 text-[12px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
        >
          Dismiss
        </button>
        <button
          onClick={() => decide("approved")}
          disabled={pending}
          className="rounded-md bg-[#14201B] px-2.5 py-1.5 text-[12px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Approve
        </button>
      </div>
    </li>
  );
}
