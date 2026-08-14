"use client";

import { useRef, useState, useTransition } from "react";
import { decideCalendarProposal } from "./calendar-actions";
import { NewBusinessResolver } from "./new-account-ui";
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
          Log what just happened, typed or recorded. It becomes an activity log entry and contact detail right
          away; any follow-up it hears waits below for your approval before it touches your calendar or HubSpot.
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
              <>Logged, but couldn&apos;t confidently match an account.</>
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

      {result?.ok && result.needsAccount && (
        <NewBusinessResolver touchpointId={result.touchpoint_id} nameGuess={result.businessNameGuess} />
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

function mtMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Voice capture, same fields as TouchpointCapture just spoken instead of
 * typed: it uploads audio and files an nb_visit_recordings row (see
 * dal.ts / migration 0012). bridges/nutribiotic/visits.py transcribes it on
 * the Mac (reusing bridges/lib/stt.py, the JobHunt meetings recorder's own
 * transcription module) and hands the text to /api/visits/transcript, which
 * runs it through the exact same recordTouchpoint() extraction a typed note
 * uses. Nothing here parses anything; this is capture only.
 */
export function RecordVisit({ accountIdHint }: { accountIdHint?: string | null }) {
  const [state, setState] = useState<"idle" | "recording" | "uploading" | "done" | "error">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const t0Ref = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function finish() {
    if (timerRef.current) clearInterval(timerRef.current);
    const startedAt = new Date(t0Ref.current).toISOString();
    const endedAt = new Date().toISOString();
    const mime = recRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];

    if (blob.size < 1000) {
      setState("error");
      setMessage("Recording was empty.");
      return;
    }

    setState("uploading");
    try {
      const form = new FormData();
      form.set("audio", blob, "visit");
      form.set("started_at", startedAt);
      form.set("ended_at", endedAt);
      if (accountIdHint) form.set("account_id_hint", accountIdHint);
      const res = await fetch("/nutribiotic/api/visits/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Upload failed.");
      setState("done");
      setMessage(
        "Filed. The Mac transcribes it and runs it through the same parse a typed note gets, check back here for any follow-up to approve.",
      );
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function start() {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mtMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      t0Ref.current = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = finish;
      recRef.current = rec;
      streamRef.current = stream;
      rec.start(1000);
      setState("recording");
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - t0Ref.current), 1000);
    } catch {
      setState("error");
      setMessage("Microphone unavailable or permission denied.");
    }
  }

  function stop() {
    recRef.current?.stop();
  }

  const recording = state === "recording";

  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
          <Ico name="mic" size={13} />
          Or record the visit
        </div>
        {recording && <span className="text-[12.5px] tabular-nums text-[#8A6D2F]">{fmtTimer(elapsedMs)}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="max-w-[46ch] text-[11.5px] leading-snug text-[#8A928C]">
          Recording others can require their consent. Tell whoever is in the room, and record only where you are
          permitted. Audio is transcribed then deleted, only the text stays.
        </p>
        {recording ? (
          <button
            onClick={stop}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#8A2E2E] px-3.5 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90"
          >
            <Ico name="stop" size={12} />
            Stop
          </button>
        ) : (
          <button
            onClick={start}
            disabled={state === "uploading"}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#E2DFD5] px-3.5 py-2 text-[13px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
          >
            <Ico name="mic" size={13} />
            {state === "uploading" ? "Filing..." : "Record a visit"}
          </button>
        )}
      </div>
      {message && (
        <div
          className={`mt-3 rounded-md border px-3 py-2.5 text-[13px] leading-relaxed ${
            state === "error"
              ? "border-[#E5D9BF] bg-[#FBF6E9] text-[#8A6D2F]"
              : "border-[#E2DFD5] bg-[#FAF9F5] text-[#3D4A44]"
          }`}
        >
          {message}
        </div>
      )}
    </Card>
  );
}
