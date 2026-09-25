"use client";

/**
 * The map's own "+" (Juan, 2026-09-24, replacing what used to open the global
 * QuickCapture "log a visit" box here -- see lib/QuickCapture.tsx's suppressed
 * list). Standing on the map, the thing he wants next is not to log what
 * already happened, it is to put a NEW place somewhere on a day: find the
 * name, find its location, find where it fits in that day's drive. Route or
 * SDR and which day are both decided at the top, before the search, so the
 * search itself never has to ask.
 *
 * NO SECOND INSERTION LOGIC. Route mode renders the exact AddStopForm
 * RoutePanel has always used (search an existing client, or resolve any new
 * place through Google Places as a custom stop), wired to the SAME
 * cheapest-gap callbacks MapScreen already computed for RoutePanel
 * (onAddAccount/onAddCustomStop). Picking a day here just moves activeDay --
 * the one piece of state every add-to-route control on this screen already
 * keys off -- rather than teaching a second path what "today's cheapest gap"
 * means. SDR mode reuses the same account search plus AccountsMap's own
 * SDR_PRIORITIES/addAccountToSdr, the identical two-tap shape its pin-card
 * control (AddToSdr) already uses.
 */

import { useState } from "react";
import type { CustomStop, SdrPriority } from "../lib/dal";
import { Ico } from "../lib/ui";
import { addAccountToSdr } from "../lib/sdr-actions";
import { AddStopForm } from "./AddStopForm";
import { SDR_PRIORITIES } from "./AccountsMap";
import { ClientSearchField, type ClientSearchAccount } from "./ClientSearchField";
import { DayTabs } from "./DayTabs";

type Mode = "route" | "sdr";

function AddSdrRow({
  accounts,
  day,
  onDone,
}: {
  accounts: ClientSearchAccount[];
  day: string;
  onDone: (label: string) => void;
}) {
  const [account, setAccount] = useState<ClientSearchAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function queue(priority: SdrPriority) {
    if (!account || busy) return;
    setBusy(true);
    setError(null);
    const res = await addAccountToSdr(account.id, priority, day);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone(account.name);
  }

  if (!account) {
    return (
      <div className="rounded-lg border border-[#E2DFD5] bg-white p-3.5">
        <ClientSearchField accounts={accounts} inRoute={new Set()} onPick={setAccount} />
        <p className="mt-2.5 text-[12px] text-[#8A928C]">A call, not a drive-to stop.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#E2DFD5] bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-[#14201B]">{account.name}</span>
        <button
          type="button"
          onClick={() => setAccount(null)}
          className="shrink-0 text-[12px] font-medium text-[#8A928C] hover:text-[#3D4A44]"
        >
          Change
        </button>
      </div>
      <div className="mt-2.5 flex items-center gap-1">
        {SDR_PRIORITIES.map((p) => (
          <button
            key={p.value}
            type="button"
            disabled={busy}
            onClick={() => queue(p.value)}
            className={`flex-1 rounded-md px-2 py-2 text-[12px] font-semibold transition-colors disabled:opacity-40 ${p.tone}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-[#B5372A]">{error}</p>}
    </div>
  );
}

export function AddPlaceSheet({
  accounts,
  inRoute,
  days,
  activeDay,
  onSelectDay,
  onAddAccount,
  onAddCustomStop,
}: {
  accounts: ClientSearchAccount[];
  inRoute: Set<string>;
  days: string[];
  activeDay: string;
  onSelectDay: (day: string) => void;
  onAddAccount: (account: ClientSearchAccount) => void;
  onAddCustomStop: (stop: Omit<CustomStop, "id">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("route");
  const [confirmed, setConfirmed] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setMode("route");
    setConfirmed(null);
  }

  function confirmAndClose(label: string) {
    setConfirmed(label);
    setTimeout(close, 1000);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add a place to a route"
        title="Add a place to a route"
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
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-xl border-b border-[#E2DFD5] bg-[#F7F6F1] px-5 py-4">
              <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] leading-none font-semibold tracking-tight">
                Add a place
              </h2>
              <button
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1.5 text-[#8A928C] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B]"
              >
                <Ico name="close" size={16} />
              </button>
            </div>

            <div className="overflow-x-hidden px-5 py-5">
              {confirmed ? (
                <div className="flex items-center gap-1.5 rounded-md bg-[#EEECE3] px-3 py-2.5 text-[13px] font-semibold text-[#3D6B4A]">
                  <Ico name="check" size={14} />
                  Added {confirmed}
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMode("route")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                        mode === "route"
                          ? "bg-[#14201B] text-[#F7F6F1]"
                          : "border border-[#E2DFD5] bg-white text-[#5B6560] hover:bg-[#FAF9F5]"
                      }`}
                    >
                      <Ico name="route" size={13} />
                      Route
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("sdr")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                        mode === "sdr"
                          ? "bg-[#14201B] text-[#F7F6F1]"
                          : "border border-[#E2DFD5] bg-white text-[#5B6560] hover:bg-[#FAF9F5]"
                      }`}
                    >
                      <Ico name="phone" size={13} />
                      SDR
                    </button>
                  </div>

                  <DayTabs days={days} active={activeDay} onSelect={onSelectDay} />

                  {mode === "route" ? (
                    <AddStopForm
                      accounts={accounts}
                      inRoute={inRoute}
                      onAddAccount={(a) => {
                        onAddAccount(a);
                        confirmAndClose(a.name);
                      }}
                      onAdd={(stop) => {
                        onAddCustomStop(stop);
                        confirmAndClose(stop.label);
                      }}
                    />
                  ) : (
                    <AddSdrRow accounts={accounts} day={activeDay} onDone={confirmAndClose} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
