"use client";

import { useRef, useState, useTransition } from "react";
import { decideCalendarProposal } from "./calendar-actions";
import { NewBusinessResolver } from "./new-account-ui";
import { recordTouchpoint, type RecordTouchpointResult } from "./touchpoint";
import { Ico } from "./ui";

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
 * One capture surface, typed or spoken, for whatever just happened. Both
 * paths land in the same recordTouchpoint() extractor (see lib/touchpoint.ts),
 * so a typed note and a transcribed one are parsed identically; this
 * component is presentation only.
 *
 * DELIBERATELY QUIET (2026-08-17, Juan: "it looks like a wall of text").
 * Earlier versions explained the pipeline in three separate paragraphs
 * before he'd typed a word. The only copy left is the placeholder and
 * whatever feedback a result actually produces. The record button carries
 * no label at all: red and round is the whole affordance, same convention
 * as every voice-memo and camera app.
 */
export function TouchpointCapture({ accountIdHint }: { accountIdHint?: string | null }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RecordTouchpointResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [voice, setVoice] = useState<"idle" | "recording" | "uploading" | "error">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const t0Ref = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 420)}px`;
  }

  function submit() {
    const value = text;
    if (!value.trim() || pending) return;
    startTransition(async () => {
      const res = await recordTouchpoint(value, accountIdHint);
      setResult(res);
      if (res.ok) {
        setText("");
        requestAnimationFrame(() => textareaRef.current && autosize(textareaRef.current));
      }
    });
  }

  async function finishRecording() {
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
      setVoice("error");
      setVoiceError("Recording was empty.");
      return;
    }

    setVoice("uploading");
    try {
      const form = new FormData();
      form.set("audio", blob, "visit");
      form.set("started_at", startedAt);
      form.set("ended_at", endedAt);
      if (accountIdHint) form.set("account_id_hint", accountIdHint);
      const res = await fetch("/nutribiotic/api/visits/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Upload failed.");
      setVoice("idle");
    } catch (err) {
      setVoice("error");
      setVoiceError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function startRecording() {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mtMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      t0Ref.current = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = finishRecording;
      recRef.current = rec;
      streamRef.current = stream;
      rec.start(1000);
      setVoice("recording");
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - t0Ref.current), 1000);
    } catch {
      setVoice("error");
      setVoiceError("Microphone unavailable or permission denied.");
    }
  }

  function stopRecording() {
    recRef.current?.stop();
  }

  const recording = voice === "recording";
  const uploading = voice === "uploading";

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="rounded-xl border border-[#E2DFD5] bg-white p-4 sm:p-5">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autosize(e.target);
            }}
            placeholder="What just happened?"
            rows={5}
            className="min-h-[132px] w-full resize-none border-none bg-transparent p-0 pr-14 text-[16px] leading-relaxed text-[#14201B] placeholder:text-[#A9AFA9] focus:outline-none"
          />

          {recording && (
            <span className="pointer-events-none absolute bottom-1 right-[60px] text-[12.5px] font-medium tabular-nums text-[#8A2E2E]">
              {fmtTimer(elapsedMs)}
            </span>
          )}

          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            aria-label={recording ? "Stop recording" : "Record a visit"}
            className={`absolute bottom-0 right-0 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all disabled:opacity-50 ${
              recording ? "scale-105 bg-[#B23B3B]" : "bg-[#8A2E2E] hover:opacity-90"
            }`}
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Ico name={recording ? "stop" : "mic"} size={17} />
            )}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="min-h-[1em] text-[12px] leading-relaxed text-[#8A6D2F]">{voiceError}</span>
          <button
            onClick={submit}
            disabled={pending || !text.trim()}
            className="shrink-0 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {pending ? "Logging…" : "Log"}
          </button>
        </div>
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
              <>Logged, couldn&apos;t confidently match an account.</>
            ) : (
              <>
                <span className="font-medium">{result.accountName}</span>: {result.summary}
                {(result.peopleAdded > 0 || result.peopleUpdated > 0) && (
                  <>
                    {" · "}
                    {result.peopleAdded > 0 && `${result.peopleAdded} contact${result.peopleAdded === 1 ? "" : "s"} added`}
                    {result.peopleAdded > 0 && result.peopleUpdated > 0 && ", "}
                    {result.peopleUpdated > 0 && `${result.peopleUpdated} updated`}
                  </>
                )}
                {result.calendarProposals > 0 && ` · ${result.calendarProposals} follow-up${result.calendarProposals === 1 ? "" : "s"} waiting below`}
              </>
            )
          ) : (
            result.error
          )}
        </div>
      )}

      {result?.ok && !result.needsAccount && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-[12px] leading-relaxed ${
            result.hubspotFiled ? "text-[#8A928C]" : "text-[#8A6D2F]"
          }`}
        >
          <Ico name={result.hubspotFiled ? "check" : "alert"} size={12} />
          {result.hubspotFiled
            ? `Filed to HubSpot${result.hubspotNoteId ? ` (${result.hubspotNoteId})` : ""}`
            : `Not filed yet: ${result.hubspotError ?? "unknown error"}. Waiting below to retry.`}
        </div>
      )}

      {result?.ok && result.needsAccount && (
        <NewBusinessResolver touchpointId={result.touchpoint_id} nameGuess={result.businessNameGuess} />
      )}
    </div>
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
