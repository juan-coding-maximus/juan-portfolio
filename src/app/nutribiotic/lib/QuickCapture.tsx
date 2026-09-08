"use client";

/**
 * Capture from anywhere in the OS.
 *
 * Juan, field note fn_d8ea70: "Need more ways to input notes of opportunities
 * in, to make this screen the real home screen." Half of that was already
 * true, /nutribiotic has redirected to /visit since 2026-08-19 and the
 * ClientOS tile launches straight into it. The other half was not: the
 * capture box existed on exactly ONE screen, so noticing something while
 * standing on the Map, an account card, or the expenses screen meant leaving
 * what you were looking at to go file it. In practice that means it does not
 * get filed.
 *
 * So the box is now reachable from every OS screen without navigating: a
 * floating button that opens the SAME TouchpointCapture, in a sheet over
 * whatever you were doing, and drops you back where you were when it lands.
 *
 * ONE CAPTURE SURFACE, NOT TWO. This deliberately mounts the existing
 * component rather than reimplementing a "lite" version of it. Both doors
 * therefore run the one extractor (lib/touchpoint.ts), file identically, and
 * share the localStorage draft key, so a note started here is the note /visit
 * restores. A second capture path with its own parsing would be a second
 * source of truth for what happened at a door, which is exactly what root
 * AGENTS.md P4 forbids.
 *
 * IT COSTS THE SHELL NOTHING. The layout's standing rule is that it carries no
 * data and holds no stream open (see layout.tsx). This renders a button and
 * nothing else; TouchpointCapture and its recorder are behind a dynamic import
 * that does not resolve until the button is actually pressed, so the screens
 * that never capture never pay for it.
 */

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Ico, SkeletonBar } from "./ui";

const TouchpointCapture = dynamic(
  () => import("./touchpoint-ui").then((m) => m.TouchpointCapture),
  {
    ssr: false,
    loading: () => <SkeletonBar className="h-[286px] w-full rounded-xl" />,
  },
);

/**
 * Where the button would be redundant or wrong.
 *
 * /visit already IS the box, so a button that opens the box on top of the box
 * is noise. The promo routes are the buyer's surface, rendered bare on
 * purpose, and nothing belonging to the rep's own tooling goes on a screen a
 * customer is looking at. /gate is pre-session.
 */
function suppressed(pathname: string): boolean {
  return (
    pathname === "/nutribiotic/visit" ||
    pathname === "/nutribiotic/gate" ||
    pathname.startsWith("/nutribiotic/promo")
  );
}

export function QuickCapture() {
  const pathname = usePathname();
  /* The sheet is open FOR A SCREEN, not open in the abstract. Storing the
     pathname it was opened on rather than a boolean means a navigation
     underneath it (a link inside a filed result) closes it during render,
     with no effect that calls setState and no cascading re-render. */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;
  const hidden = suppressed(pathname ?? "");

  const close = useCallback(() => setOpenedOn(null), []);
  const setOpen = useCallback(
    (next: boolean) => setOpenedOn(next ? (pathname ?? "") : null),
    [pathname],
  );

  // Escape closes; "n" opens, but never while something is being typed into.
  // A shortcut that eats a keystroke in the middle of a note is worse than no
  // shortcut, so anything focus-bearing wins the key.
  useEffect(() => {
    if (hidden) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, setOpen]);

  // A sheet over the page must not let the page behind it scroll under the
  // thumb. Same treatment the account modal uses.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (hidden) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Capture a note"
        title="Capture a note (n)"
        /* Above the mobile tab bar below 2xl (the bar is fixed at 64px plus the
           safe-area inset), bottom-right of the shell once the sidebar is back.
           z-40 sits under the account modal's z-50 on purpose: with a profile
           open, the profile is what the tap is for. */
        className="fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#14201B] text-[#F7F6F1] shadow-lg transition-transform active:scale-95 2xl:right-7 2xl:bottom-7"
      >
        <Ico name="plus" size={22} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#14201B]/40 px-4 py-8 backdrop-blur-[2px] sm:py-14"
          onClick={close}
        >
          <div
            className="w-full max-w-[600px] rounded-xl border border-[#E2DFD5] bg-[#F7F6F1] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#E2DFD5] px-5 py-4">
              <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] leading-none font-semibold tracking-tight">
                Capture
              </h2>
              <button
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1.5 text-[#8A928C] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B]"
              >
                <Ico name="close" size={16} />
              </button>
            </div>
            <div className="max-h-[78vh] overflow-x-hidden overflow-y-auto px-5 py-5">
              <TouchpointCapture />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
