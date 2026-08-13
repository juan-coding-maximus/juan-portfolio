"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketingFile } from "./dal";
import { Ico } from "./ui";

function sameFile(a: MarketingFile, b: MarketingFile): boolean {
  return a.folder === b.folder && a.name === b.name;
}

/**
 * The one attachment control, shared by the WhatsApp composer and every
 * email draft card. Neither Outlook Web's compose deep-link nor a wa.me
 * chat link can carry a file through the URL, that's a real platform limit
 * on both, not something to build around. What IS possible: force a real
 * download the moment a file is picked (see dal.ts's `&download=` fix,
 * without it these open inline instead of saving), so by the time Juan
 * opens Outlook or WhatsApp the file is already sitting in Downloads, one
 * drag away. Selecting also hands the picked files back to the caller so
 * the draft text can say what's coming.
 */
export function AttachmentButton({
  files,
  selected,
  onChange,
}: {
  files: MarketingFile[];
  selected: MarketingFile[];
  onChange: (files: MarketingFile[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (files.length === 0) return null;

  function toggle(f: MarketingFile) {
    const isOn = selected.some((s) => sameFile(s, f));
    const next = isOn ? selected.filter((s) => !sameFile(s, f)) : [...selected, f];
    onChange(next);
    // Downloading is the whole point of picking one: stage it in Downloads
    // right away rather than making Juan come back and click again.
    if (!isOn) triggerDownload(f);
  }

  function downloadAllAgain() {
    selected.forEach((f, i) => setTimeout(() => triggerDownload(f), i * 250));
  }

  const marketing = files.filter((f) => f.folder === "marketing");
  const field = files.filter((f) => f.folder === "field");

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] transition-colors ${
          selected.length > 0
            ? "border-[#14201B] text-[#14201B]"
            : "border-[#D8D4C8] text-[#3D4A44] hover:bg-[#FAF9F5]"
        }`}
      >
        <Ico name="plus" size={11} />
        {selected.length > 0 ? `Attachments (${selected.length})` : "Attach"}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-[#E2DFD5] bg-white p-2 shadow-lg">
          {[
            ["Marketing", marketing],
            ["Field materials", field],
          ].map(([label, group]) =>
            (group as MarketingFile[]).length > 0 ? (
              <div key={label as string} className="mb-2 last:mb-0">
                <div className="mb-1 px-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#8A928C]">
                  {label as string}
                </div>
                <ul className="max-h-56 overflow-y-auto">
                  {(group as MarketingFile[]).map((f) => {
                    const isOn = selected.some((s) => sameFile(s, f));
                    return (
                      <li key={`${f.folder}/${f.name}`}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-[#FAF9F5]">
                          <input type="checkbox" checked={isOn} onChange={() => toggle(f)} />
                          <span className="truncate">{f.label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null,
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={downloadAllAgain}
              className="mt-1 w-full rounded-md border border-[#E2DFD5] px-2 py-1.5 text-[12px] text-[#3D4A44] hover:bg-[#FAF9F5]"
            >
              Re-download {selected.length} file{selected.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function triggerDownload(f: MarketingFile): void {
  const a = document.createElement("a");
  a.href = f.url;
  a.download = f.name;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** One line naming what's attached, appended to a draft's own text at send
 *  time (never mutated into the editable textarea itself, so toggling a
 *  file on and off can never duplicate or corrupt what Juan actually wrote). */
export function attachmentNote(selected: MarketingFile[]): string {
  if (selected.length === 0) return "";
  const names = selected.map((f) => f.label).join(", ");
  return `\n\n(Attaching: ${names})`;
}
