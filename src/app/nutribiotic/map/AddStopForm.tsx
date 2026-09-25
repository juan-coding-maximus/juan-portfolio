"use client";

/**
 * Pulled out of RoutePanel.tsx (2026-09-24) so AddPlaceSheet's map-wide "+"
 * flow (MapScreen.tsx) opens the exact same search-and-insert control
 * RoutePanel has always used, rather than a second one that could drift from
 * it. Nothing about the two rows below changed in the move.
 *
 * TWO ROWS, NOT ONE BUTTON WITH TABS (Juan, 2026-09-23). A client used to be a
 * fourth pill inside the same "Add a client, lunch, hotel or other stop"
 * button as lunch/hotel/stop, which meant reaching a client, the thing he adds
 * by hand nearly every time, cost a tab-switch first. AddClientRow and
 * AddCustomStopRow below are two independent controls, stacked, each opening
 * its own inline form -- no shared pill selector, no default arm to switch off
 * of. A client still goes into route_draft as the bare nb_accounts.id string
 * it has always been (see dal.ts RouteDraftEntry), resolved against the live
 * account on every render, so a rename or a move upstream is reflected rather
 * than frozen into the draft.
 */

import { useState } from "react";
import type { CustomStop, CustomStopKind } from "../lib/dal";
import { CUSTOM_STOP_LABEL, Ico } from "../lib/ui";
import { resolveStopAddress } from "../lib/stop-actions";
import { ClientSearchField, type ClientSearchAccount } from "./ClientSearchField";

/**
 * A day is not only accounts (Juan, 2026-08-05). Lunch between two clusters and
 * the hotel at the end of a sleep-away run are stops in the same sense: they
 * take time, they sit in a position, and they belong in the one list the phone
 * navigates from. Anything with an address can be one, which is why the third
 * kind is just "Stop" (a warehouse, a parking garage, a friend's office).
 *
 * THE ADDRESS IS RESOLVED, NOT TYPED THROUGH. Google Places answers with a real
 * place or with nothing (see lib/stop-actions.ts). A stop that cannot be placed
 * is not saved, because a stop with no coordinates is a row with a dead GO
 * button, and finding that out in a parking lot is the worst time to find it.
 */
const KINDS: { value: CustomStopKind; hint: string }[] = [
  { value: "lunch", hint: "e.g. In-N-Out Tustin" },
  { value: "hotel", hint: "e.g. Hampton Inn Carlsbad" },
  { value: "stop", hint: "Any address or place name" },
];

function AddClientRow({
  accounts,
  inRoute,
  onAddAccount,
}: {
  accounts: ClientSearchAccount[];
  inRoute: Set<string>;
  onAddAccount: (account: ClientSearchAccount) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
      >
        <Ico name="accounts" size={13} />
        Add a client
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[#E2DFD5] bg-white p-3.5">
      {/* A client is searched, not typed through Google Places: it is already a
          row of Juan's, with its own coordinates and its own history. Picking
          one from the list IS the add, so this has no "Add to route" step. */}
      <ClientSearchField
        accounts={accounts}
        inRoute={inRoute}
        onPick={(a) => {
          onAddAccount(a);
          setOpen(false);
        }}
      />
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#8A928C] transition-colors hover:text-[#3D4A44]"
        >
          Cancel
        </button>
        <span className="text-[12px] text-[#8A928C]">
          Your accounts and prospects. Pick one to put it on this day.
        </span>
      </div>
    </div>
  );
}

function AddCustomStopRow({ onAdd }: { onAdd: (stop: Omit<CustomStop, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CustomStopKind>("stop");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setQuery("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    // A THROWN server action, not just an { ok: false } answer, used to reach
    // Next's error.tsx and take the whole route panel down with it (Juan,
    // 2026-09-16). resolveStopAddress can throw on a bad deploy or a dropped
    // connection same as any other network call, and that is exactly the
    // moment a field-level message matters most.
    let res;
    try {
      res = await resolveStopAddress(query);
    } catch {
      setBusy(false);
      setError("Couldn't reach the lookup. Try again.");
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAdd({
      kind,
      label: res.place.label,
      address: res.place.address,
      lat: res.place.lat,
      lng: res.place.lng,
    });
    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setKind("stop");
          reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
      >
        <Ico name="pin" size={13} />
        Add a stop
      </button>
    );
  }

  const hint = KINDS.find((k) => k.value === kind)?.hint ?? "";

  return (
    <form onSubmit={submit} className="rounded-lg border border-[#E2DFD5] bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => {
              setKind(k.value);
              reset();
            }}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              kind === k.value
                ? "bg-[#14201B] text-[#F7F6F1]"
                : "border border-[#E2DFD5] text-[#5B6560] hover:bg-[#FAF9F5]"
            }`}
          >
            {CUSTOM_STOP_LABEL[k.value]}
          </button>
        ))}
      </div>

      <div className="mt-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={hint}
          autoFocus
          className="w-full min-w-0 rounded-md border border-[#E2DFD5] bg-[#FCFBF7] px-3 py-2 text-[13.5px] outline-none placeholder:text-[#A9AFA9] focus:border-[#8A928C]"
        />
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || query.trim().length < 3}
          className="rounded-md bg-[#2C6A46] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Finding..." : "Add to route"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#8A928C] transition-colors hover:text-[#3D4A44]"
        >
          Cancel
        </button>
        <span className="text-[12px] text-[#8A928C]">
          {error ? <span className="text-[#B5372A]">{error}</span> : "Address or place name, looked up before it is added."}
        </span>
      </div>
    </form>
  );
}

/** The two rows, stacked, client on top of stop -- see the comment above. */
export function AddStopForm({
  onAdd,
  accounts,
  inRoute,
  onAddAccount,
}: {
  onAdd: (stop: Omit<CustomStop, "id">) => void;
  accounts: ClientSearchAccount[];
  inRoute: Set<string>;
  onAddAccount: (account: ClientSearchAccount) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <AddClientRow accounts={accounts} inRoute={inRoute} onAddAccount={onAddAccount} />
      <AddCustomStopRow onAdd={onAdd} />
    </div>
  );
}
