"use client";

import { useState, useTransition } from "react";
import { forgetDevice } from "../lib/device-actions";

/**
 * Two taps, no browser dialog. `confirm()` is a modal that blocks the page and
 * reads like a bug on a phone; a button that changes its own label to the
 * consequence is clearer and reversible by tapping anywhere else.
 */
export function ForgetButton({ id, isCurrent }: { id: string; isCurrent: boolean }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="shrink-0 rounded-md border border-[#E2DFD5] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
      >
        Forget
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        disabled={pending}
        onClick={() => start(() => forgetDevice(id))}
        className="rounded-md bg-[#8A3324] px-3 py-1.5 text-[12.5px] font-medium text-[#F7F6F1] disabled:opacity-50"
      >
        {pending ? "Forgetting" : isCurrent ? "Forget this one" : "Confirm"}
      </button>
      <button
        onClick={() => setArmed(false)}
        className="rounded-md px-2 py-1.5 text-[12.5px] text-[#8A928C]"
      >
        Cancel
      </button>
    </div>
  );
}
