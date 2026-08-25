"use client";

/**
 * The hand-built route, between the map and the ten-closest list.
 *
 * Juan's ask 2026-08-05: a pin's card gets "add to route", the stops collect in
 * a list under the map, each stop moves up and down or X's out, and the list
 * stays until he removes something rather than resetting when he reloads.
 *
 * WHAT THIS IS NOT: plan_week.py's computed week. That one is derived from
 * cadence and drive time and is rebuilt from scratch on every run. This one is
 * whatever Juan tapped, in the order he tapped it, and nothing recomputes it
 * behind him. The two are kept in different places on purpose (see migration
 * 0029) so a planner run can never eat a list he assembled by hand.
 *
 * ORDER IS JUAN'S UNLESS HE ASKS OTHERWISE. Nothing here reorders his list on
 * its own. "Optimize route" (2026-08-23) is the one exception, and it is
 * exactly that: a button he presses, not something that runs behind him. It
 * solves the graph problem, shortest total driving for the day's stops, via
 * route-optimize.ts, and only ever replaces the WHOLE order in one commit --
 * never a silent partial reorder. "Add to route" drops a new stop into the
 * cheapest gap in the existing order rather than always last, same math,
 * same never-partial rule.
 *
 * DRIVE TIME AND A CLOCK, added 2026-08-17 on his ask to see the day he plans
 * in chat on the map itself. The original rule that kept them off this screen
 * was not "times are unwanted", it was "this screen has no router, and a
 * straight-line mile dressed up as a drive estimate is read as one". That rule
 * still holds. What changed is drive-actions.ts, which routes on the real
 * street network, so the number now has something real behind it.
 *
 * Three things keep it honest, and they are load-bearing:
 *   1. The router returns FREE-FLOW time and is scaled by a single traffic
 *      factor, so the panel says "planning estimate", never "ETA".
 *   2. If the router is unreachable the schedule disappears and the panel falls
 *      back to the straight-line hops it always had, saying so. It never
 *      invents a leg to keep the layout tidy.
 *   3. Arrivals are DERIVED from order + departure + dwell on every render.
 *      Nothing is stored, so a time can never disagree with the list above it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CallEntry, CustomStop, CustomStopKind, RouteEndpoint, RouteSchedulePrefs } from "../lib/dal";
import { dayLabel } from "../lib/field-week";
import { appleMapsUrl, CUSTOM_STOP_LABEL, fullAddress, Ico, prettyPhone, ReachLinks, TierChip } from "../lib/ui";
import { AccountLink } from "../lib/modal";
import { resolveStopAddress } from "../lib/stop-actions";
import { CallSearchField } from "./CallSearchField";
import { DayMoveMenu } from "./DayMoveMenu";
import { routeDriveLegs, type DriveLeg } from "./drive-actions";
import type { RouteStopView } from "./MapScreen";
import { RouteEndpointField } from "./RouteEndpointField";

/* Money, at the grain a rep reads at a door. No cents: the difference between
   $1,518 and $1,518.00 is noise on a phone held at arm's length, and rounding
   the display never touches the stored figure. */
function usd(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/* "2026-03-27" -> "Mar 2026". Day precision implies the rep should know which
   Tuesday; month is the true resolution of "when did they last buy". Parsed as
   parts rather than new Date(s), which would read the bare date as UTC midnight
   and render the previous month in Los Angeles for anything dated the 1st. */
function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : iso;
}

// Straight-line miles, same haversine the ten-closest list uses. Duplicated
// rather than shared because the two screens are free to diverge later and a
// six-line formula is a cheaper thing to keep in step than a coupling.
function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// The clock (migration 0037)
//
// A day is: leave at `depart`, drive each leg, spend `dwell` at each account,
// `lunchMinutes` at a lunch stop, and nothing at a hotel (it is where the day
// ends, not a call). Everything below is arithmetic on that sentence.
// ---------------------------------------------------------------------------

/** "09:30" -> 570. Wall-clock minutes; no date and no zone is involved, which
    is the point: the route is planned in the time the car is driving in. */
function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 30);
}

function clock(mins: number): string {
  const t = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** "1h 25m" for a total, "6 min" for a leg. Nobody reads "85 minutes". */
function duration(mins: number): string {
  const m = Math.round(mins);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
}

type ScheduleRow = { arrive: number; leave: number; stay: number };

/**
 * `legs` is the router's answer for the path START -> every stop in order ->
 * END, START and END each present only when that side is known (0040: either
 * can be the waypoint, an overridden address, or absent). Whichever ends are
 * known bound the schedule, because that is what "leave at 09:30, back by
 * 16:45" measures, and a day whose first drive is invisible reads as thirty
 * free minutes that do not exist.
 *
 * The waypoint account (Juan's apartment, migration 0029) and any overridden
 * start/end get no dwell for the same reason neither is a customer: nothing
 * is sold there.
 */
function buildSchedule(
  stops: RouteStopView[],
  legs: DriveLeg[],
  hasStart: boolean,
  hasEnd: boolean,
  prefs: RouteSchedulePrefs,
): { rows: ScheduleRow[]; finish: number; toFirst: DriveLeg | null; end: DriveLeg | null } {
  const toFirst = hasStart ? legs[0] ?? null : null;
  const endLeg = hasEnd ? legs[legs.length - 1] ?? null : null;
  /* Between consecutive stops: drop the leading/trailing legs that belong to
     the start/end rather than to a stop-to-stop hop. */
  const between = legs.slice(hasStart ? 1 : 0, legs.length - (hasEnd ? 1 : 0));

  const rows: ScheduleRow[] = [];
  let t = minutesOfDay(prefs.depart) + (toFirst?.minutes ?? 0);
  stops.forEach((s, i) => {
    if (i > 0) t += between[i - 1]?.minutes ?? 0;
    const kind = s.type === "custom" ? s.custom.kind : null;
    const stay =
      kind === "lunch" ? prefs.lunchMinutes : kind === "hotel" ? 0 : prefs.dwellMinutes;
    rows.push({ arrive: t, leave: t + stay, stay });
    t += stay;
  });
  return { rows, finish: t + (endLeg?.minutes ?? 0), toFirst, end: endLeg };
}

/**
 * One Apple Maps URL for the whole route: the last stop is the destination and
 * everything before it rides along as waypoints, so Juan gets one tap to a real
 * turn-by-turn instead of navigating stop by stop. Apple Maps caps the query it
 * will accept, so this stays a link rather than something that claims to be a
 * plan, and each stop keeps its own GO next to it as the reliable path.
 */
function appleMapsRouteUrl(stops: { lat: number; lng: number }[]): string {
  const daddr = stops.map((s) => `${s.lat},${s.lng}`).join("+to:");
  return `https://maps.apple.com/?daddr=${daddr}`;
}

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

function AddStopForm({ onAdd }: { onAdd: (stop: Omit<CustomStop, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CustomStopKind>("lunch");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setQuery("");
    setName("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await resolveStopAddress(query);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAdd({
      kind,
      // Juan's own name for it wins over Google's, which is often the street
      // number when what was typed was an address.
      label: name.trim() || res.place.label,
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
      >
        <Ico name="pin" size={13} />
        Add lunch, hotel or other stop
      </button>
    );
  }

  const hint = KINDS.find((k) => k.value === kind)?.hint ?? "";

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-[#E2DFD5] bg-white p-3.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
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

      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={hint}
          autoFocus
          className="min-w-0 flex-[2] rounded-md border border-[#E2DFD5] bg-[#FCFBF7] px-3 py-2 text-[13.5px] outline-none placeholder:text-[#A9AFA9] focus:border-[#8A928C]"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Call it something (optional)"
          className="min-w-0 flex-1 rounded-md border border-[#E2DFD5] bg-[#FCFBF7] px-3 py-2 text-[13.5px] outline-none placeholder:text-[#A9AFA9] focus:border-[#8A928C]"
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

/**
 * The calls on this day (migration 0041): phone-only follow-ups, no address,
 * no drive position, added and removed the same way a lunch/hotel stop is but
 * never among them, never costed against traffic, never part of Optimize
 * route's reorder maths. Sits between the day tabs and the stop list, where
 * Juan asked for it: between the map above and the list of places to hit
 * below.
 */
function AddCallForm({ onAdd }: { onAdd: (call: Omit<CallEntry, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  function reset() {
    setLabel("");
    setPhone("");
    setNote("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !phone.trim()) return;
    onAdd({ label: label.trim(), phone: phone.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
      >
        <Ico name="phone" size={13} />
        Add a call
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-[#E2DFD5] bg-white p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* HUBSPOT SEARCH (2026-08-25): typing here searches the shared
            portal for a contact or a company by name; picking a result fills
            phone too (contact's own, else their company's, else -- for a
            company result with none of its own -- a contact of theirs). See
            CallSearchField and lib/hubspot-people-search.ts. Free typing
            still works exactly as before; this only ever offers a shortcut. */}
        <CallSearchField
          label={label}
          onChangeLabel={setLabel}
          onPick={(r) => {
            setLabel(r.label);
            if (r.phone) setPhone(r.phone);
          }}
          autoFocus
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          className="min-w-0 flex-1 rounded-md border border-[#E2DFD5] bg-[#FCFBF7] px-3 py-2 text-[13.5px] tabular-nums outline-none placeholder:text-[#A9AFA9] focus:border-[#8A928C]"
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why you're calling (optional)"
        rows={2}
        className="mt-2 w-full resize-none rounded-md border border-[#E2DFD5] bg-[#FCFBF7] px-3 py-2 text-[13px] outline-none placeholder:text-[#A9AFA9] focus:border-[#8A928C]"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="submit"
          disabled={!label.trim() || !phone.trim()}
          className="rounded-md bg-[#2C6A46] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add call
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
      </div>
    </form>
  );
}

function CallsList({
  calls,
  onRemove,
  days,
  active,
  onMoveDay,
}: {
  calls: CallEntry[];
  onRemove: (id: string) => void;
  days: string[];
  active: string;
  onMoveDay: (id: string, day: string) => void;
}) {
  if (calls.length === 0) return null;
  return (
    <ul className="divide-y divide-[#EEECE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
      {calls.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2C6A46] text-[#F7F6F1]">
            <Ico name="phone" size={12} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate text-[14px] font-medium leading-snug">{c.label}</span>
              <a
                href={`tel:${c.phone}`}
                className="text-[12.5px] font-medium tabular-nums text-[#3D4A44] underline-offset-2 hover:underline"
              >
                {prettyPhone(c.phone)}
              </a>
            </div>
            {c.note && <p className="mt-0.5 text-[12.5px] leading-snug text-[#5B6560]">{c.note}</p>}
          </div>
          {/* MOVE TO A DAY (2026-08-25): a call is Juan's own follow-up, same
              as a stop, and he can plan one on the wrong tab just as easily.
              Same picker the stop rows use, days.length > 1 guards the case
              of a single-day horizon where there is nowhere else to move it. */}
          {days.length > 1 && (
            <DayMoveMenu
              days={days}
              active={active}
              onPick={(day) => onMoveDay(c.id, day)}
              label={`Move ${c.label} to a day`}
              icon="chevrons-right"
            />
          )}
          <button
            type="button"
            onClick={() => onRemove(c.id)}
            aria-label={`Remove ${c.label}`}
            className="shrink-0 rounded-md p-1.5 text-[#A9AFA9] transition-colors hover:bg-[#FAF9F5] hover:text-[#B5372A]"
          >
            <Ico name="close" size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CallsSection({
  calls,
  onAdd,
  onRemove,
  days,
  active,
  onMoveDay,
}: {
  calls: CallEntry[];
  onAdd: (call: Omit<CallEntry, "id">) => void;
  onRemove: (id: string) => void;
  days: string[];
  active: string;
  onMoveDay: (id: string, day: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13.5px] font-semibold text-[#3D4A44]">Calls</h3>
        {calls.length > 0 && (
          <span className="text-[11.5px] text-[#8A928C]">
            {calls.length} call{calls.length === 1 ? "" : "s"}, no drive
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <CallsList calls={calls} onRemove={onRemove} days={days} active={active} onMoveDay={onMoveDay} />
        <AddCallForm onAdd={onAdd} />
      </div>
    </div>
  );
}

/**
 * The strip above the list: where the day starts, where it ends, and the four
 * inputs that turn that into a clock. Editable in place because the
 * alternative is a settings screen for numbers he changes more often than he
 * changes anything else.
 *
 * ALWAYS ON SCREEN, EVEN WITH NO STOPS (Juan's ask 2026-08-24): a day with
 * nothing planned yet is exactly when he's most likely to be setting up where
 * it starts and ends, so this used to live only inside the stop-list card,
 * which meant an empty day showed no way to touch start/end at all. It now
 * renders for every day, stops or not; only the clock summary at the bottom
 * needs an actual leg to measure and stays hidden without one (`hasStops`).
 *
 * ONE EDITABLE COPY. Start and end used to have a second, editable picker
 * repeated in the rows above/below the stop list -- same fact, two places to
 * touch it, so this is now the only one that writes. Those rows still show
 * the resolved name, just as plain text next to the leg's drive time.
 */
function DayBar({
  prefs,
  onChange,
  start,
  startFallback,
  end,
  home,
  onChangeStart,
  onChangeEnd,
  finish,
  driveMinutes,
  driveMiles,
  state,
  endLabel,
  hasStops,
}: {
  prefs: RouteSchedulePrefs;
  onChange: (p: RouteSchedulePrefs) => void;
  /** This day's own start override, or null (see startFallback). */
  start: RouteEndpoint | null;
  /** What Leave shows/resolves to with no override: the PREVIOUS day's end
      for every day after the first (2026-08-24: they are literally the same
      fact, where Juan slept, so editing either one writes the other), else
      home on the first tab. */
  startFallback: RouteEndpoint | null;
  /** This day's own end override, or null -- end never chains forward from a
      day that hasn't happened yet, so its fallback is always home. */
  end: RouteEndpoint | null;
  home: RouteEndpoint | null;
  onChangeStart: (ep: RouteEndpoint | null) => void;
  onChangeEnd: (ep: RouteEndpoint | null) => void;
  finish: number | null;
  driveMinutes: number | null;
  driveMiles: number | null;
  state: "loading" | "ok" | "unavailable";
  /** The end location's own name ("Home", or an overridden hotel/address). */
  endLabel: string;
  /** Whether the day has stops to measure a schedule from. */
  hasStops: boolean;
}) {
  const over =
    finish !== null && prefs.returnBy !== null && finish > minutesOfDay(prefs.returnBy);

  const field =
    "rounded-md border border-[#E2DFD5] bg-[#FCFBF7] px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-[#8A928C]";

  return (
    <div className="mb-2 rounded-lg border border-[#E2DFD5] bg-white p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
          Leave
          <RouteEndpointField value={start} fallback={startFallback} home={home} onChange={onChangeStart} />
          at
          <input
            type="time"
            value={prefs.depart}
            onChange={(e) => onChange({ ...prefs, depart: e.target.value })}
            className={field}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
          <input
            type="number"
            min={1}
            max={240}
            value={prefs.dwellMinutes}
            onChange={(e) => onChange({ ...prefs, dwellMinutes: Number(e.target.value) })}
            className={`${field} w-[4.5rem]`}
          />
          min per stop
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
          <input
            type="number"
            min={0}
            max={240}
            value={prefs.lunchMinutes}
            onChange={(e) => onChange({ ...prefs, lunchMinutes: Number(e.target.value) })}
            className={`${field} w-[4.5rem]`}
          />
          min lunch
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
          Arrive
          <RouteEndpointField value={end} fallback={home} home={home} onChange={onChangeEnd} />
          by
          <input
            type="time"
            value={prefs.returnBy ?? ""}
            onChange={(e) => onChange({ ...prefs, returnBy: e.target.value || null })}
            className={field}
          />
        </label>
      </div>

      {hasStops && (
        <div className="mt-2.5 border-t border-[#EEECE3] pt-2.5 text-[12.5px]">
          {state === "loading" && <span className="text-[#8A928C]">Working out drive times...</span>}

          {/* The router is down, so the day has no clock. Say that, rather than
              leaving yesterday's numbers on screen or filling in straight lines. */}
          {state === "unavailable" && (
            <span className="text-[#8A928C]">
              Drive times unavailable right now, so there are no arrival times below. The order and
              the straight-line hops are unaffected.
            </span>
          )}

          {state === "ok" && finish !== null && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={over ? "font-semibold text-[#B5372A]" : "font-semibold text-[#2C6A46]"}>
                {over ? "Back " : endLabel === "Home" ? "Back home " : `Back at ${endLabel} `}
                <span className="tabular-nums">{clock(finish)}</span>
              </span>
              {over && prefs.returnBy && (
                <span className="text-[#B5372A]">
                  {duration(finish - minutesOfDay(prefs.returnBy))} past {prefs.returnBy}
                </span>
              )}
              {!over && prefs.returnBy && (
                <span className="text-[#5B6560]">
                  {duration(minutesOfDay(prefs.returnBy) - finish)} spare
                </span>
              )}
              {driveMinutes !== null && (
                <span className="text-[#5B6560]">
                  <span className="tabular-nums">{duration(driveMinutes)}</span> driving
                  {driveMiles !== null && (
                    <>
                      {" · "}
                      <span className="tabular-nums">{driveMiles.toFixed(1)} mi</span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The toggle at the top of Route: a rolling ten-weekday horizon, Monday
 * through Friday, always (2026-08-23, extended to a real rolling window
 * 2026-08-24 after four fixed Mon-Thu tabs turned out to be a wall -- Juan
 * postponing off Thursday had nowhere to land). Switching tabs switches which
 * day every control below acts on -- add, reorder, postpone, optimize, all of
 * it. Always ten tabs, even on a day with nothing planned yet, so an empty
 * day further out is still one tap away rather than looking like it doesn't
 * exist.
 */
function DayTabs({
  days,
  active,
  onSelect,
}: {
  days: string[];
  active: string;
  onSelect: (day: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Route day" className="mb-2 flex flex-wrap items-center gap-1.5">
      {days.map((day) => {
        const { weekday, short } = dayLabel(day);
        const isActive = day === active;
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(day)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              isActive
                ? "bg-[#14201B] text-[#F7F6F1]"
                : "border border-[#E2DFD5] bg-white text-[#5B6560] hover:bg-[#FAF9F5]"
            }`}
          >
            {weekday} <span className="tabular-nums opacity-80">{short}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RoutePanel({
  stops,
  home,
  prefs,
  onChangePrefs,
  start: startOverride,
  startFallback,
  end: endOverride,
  onChangeStart,
  onChangeEnd,
  onMove,
  onMoveToTop,
  onReorder,
  onRemove,
  onClear,
  onShowInMap,
  onAddCustomStop,
  calls,
  onAddCall,
  onRemoveCall,
  onMoveCallDay,
  days,
  activeDay,
  onSelectDay,
  onMoveStopDay,
  onOptimize,
  busy,
}: {
  stops: RouteStopView[];
  /** Juan's apartment, the waypoint account (0029), the ultimate default for
      both ends. Null if it is not on the map, in which case a day with no
      override and no chained default simply has no drive out and/or back. */
  home: RouteEndpoint | null;
  prefs: RouteSchedulePrefs;
  onChangePrefs: (p: RouteSchedulePrefs) => void;
  /** This day's own start override (0040), day-partitioned (2026-08-23). Null
      means "use startFallback", not "use home" -- see startFallback. */
  start: RouteEndpoint | null;
  /** Where this day starts when it has no override of its own: the previous
      field-day tab's resolved end, or home on the first tab. */
  startFallback: RouteEndpoint | null;
  /** This day's own end override. Null means "use home" -- end never chains
      forward from a day that hasn't happened yet. */
  end: RouteEndpoint | null;
  onChangeStart: (ep: RouteEndpoint | null) => void;
  onChangeEnd: (ep: RouteEndpoint | null) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onMoveToTop: (id: string) => void;
  /** Reorder the whole day to an exact id order -- both Optimize route and
      the drag handle below call this, the former with the router's answer,
      the latter with wherever the pointer let go. */
  onReorder: (idsInOrder: string[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onShowInMap: (id: string) => void;
  onAddCustomStop: (stop: Omit<CustomStop, "id">) => void;
  /** This day's calls (0041): phone-only, no drive position. */
  calls: CallEntry[];
  onAddCall: (call: Omit<CallEntry, "id">) => void;
  onRemoveCall: (id: string) => void;
  /** Move one call to any day on the horizon (2026-08-25). */
  onMoveCallDay: (id: string, day: string) => void;
  /** The rolling ten-weekday horizon (Mon-Fri), the one Juan's on, and the switch. */
  days: string[];
  activeDay: string;
  onSelectDay: (day: string) => void;
  /** Move one stop to any day on the horizon (2026-08-25): opens a day
      picker rather than always pushing to the next tab. */
  onMoveStopDay: (id: string, day: string) => void;
  /** Reorder the whole day for the least total driving (route-optimize.ts). */
  onOptimize: () => void;
  /** True while a smart-insert or an optimize is computing. */
  busy: boolean;
}) {
  const [legs, setLegs] = useState<DriveLeg[] | null>(null);
  const [legState, setLegState] = useState<"loading" | "ok" | "unavailable">("loading");

  // DRAG TO REORDER (2026-08-25), alongside the up/down chevrons, not instead
  // of them -- the comment on the chevron button below still holds (one-
  // handed in a parked car), this is for the times two hands and a longer
  // list make a drag faster than eight taps of the single-step button.
  //
  // POINTER CAPTURE ON THE HANDLE, not a window listener: setPointerCapture
  // keeps move/up events firing on the handle itself even once the finger has
  // left it, which is exactly what a drag needs and is simpler than manually
  // adding/removing window listeners on every drag start/end.
  //
  // NO LIVE REFLOW WHILE DRAGGING. The dragged row dims and an insertion line
  // shows where it would land; the actual array only reorders once on drop,
  // one onReorder call, same all-or-nothing contract Optimize route uses --
  // never a silent partial reorder mid-drag.
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: string; dropIndex: number } | null>(null);

  function dropIndexAt(clientY: number, excludeId: string): number {
    const items = listRef.current
      ? Array.from(listRef.current.querySelectorAll<HTMLLIElement>("li[data-stop-id]"))
      : [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].dataset.stopId === excludeId) continue;
      const rect = items[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return items.length;
  }

  function handleGripDown(e: React.PointerEvent<HTMLButtonElement>, id: string, index: number) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, dropIndex: index });
  }

  function handleGripMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    e.preventDefault();
    const next = dropIndexAt(e.clientY, drag.id);
    if (next !== drag.dropIndex) setDrag({ ...drag, dropIndex: next });
  }

  function handleGripUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const ids = stops.map((s) => s.id);
    const from = ids.indexOf(drag.id);
    const filtered = ids.filter((id) => id !== drag.id);
    let insertAt = drag.dropIndex;
    if (from !== -1 && from < drag.dropIndex) insertAt -= 1;
    insertAt = Math.max(0, Math.min(filtered.length, insertAt));
    filtered.splice(insertAt, 0, drag.id);
    setDrag(null);
    if (filtered.some((id, i) => id !== ids[i])) onReorder(filtered);
  }

  /* Where the day actually starts/ends (0040): Juan's override if he picked
     one at either end, else the chain default for start / the waypoint for
     end. Independent of each other. */
  const start = startOverride ?? startFallback;
  const end = endOverride ?? home;

  /* THE ROUTER IS CALLED ON THE PATH, NOT ON EVERY PAIR: one request for
     start -> stops in order -> end. Keyed on the coordinates rather than on
     the stops array so a re-render that does not move anything does not
     re-ask. */
  const pathKey = useMemo(
    () =>
      [
        start ? `s:${start.lat},${start.lng}` : "s:-",
        ...stops.map((s) => `${s.lat},${s.lng}`),
        end ? `e:${end.lat},${end.lng}` : "e:-",
      ].join("|"),
    [stops, start, end],
  );

  useEffect(() => {
    if (stops.length < 1) {
      setLegs(null);
      setLegState("ok");
      return;
    }
    const points = [...(start ? [start] : []), ...stops, ...(end ? [end] : [])];
    if (points.length < 2) {
      setLegs(null);
      setLegState("ok");
      return;
    }
    let live = true;
    setLegState("loading");
    routeDriveLegs(points.map((p) => ({ lat: p.lat, lng: p.lng })))
      .then((res) => {
        if (!live) return;
        setLegs(res);
        setLegState(res ? "ok" : "unavailable");
      })
      .catch(() => {
        if (!live) return;
        setLegs(null);
        setLegState("unavailable");
      });
    return () => {
      live = false;
    };
    // pathKey is the real dependency: it changes exactly when a coordinate does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  const schedule = useMemo(
    () => (legs ? buildSchedule(stops, legs, start !== null, end !== null, prefs) : null),
    [legs, stops, start, end, prefs],
  );

  const legBetween = (i: number): DriveLeg | null => {
    if (!legs || i < 1) return null;
    return legs.slice(start ? 1 : 0, legs.length - (end ? 1 : 0))[i - 1] ?? null;
  };

  const driveMinutes = legs ? legs.reduce((s, l) => s + l.minutes, 0) : null;
  const driveMiles = legs ? legs.reduce((s, l) => s + l.miles, 0) : null;
  const endLabel = end?.label ?? "Home";

  const header = (
    <div className="mb-3 mt-6 flex items-baseline justify-between">
      <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
        Route
      </h2>
      <span className="text-[12px] text-[#8A928C]">
        {stops.length === 0
          ? "built by hand, kept until you clear it"
          : `${stops.length} stop${stops.length === 1 ? "" : "s"}, in your order`}
      </span>
    </div>
  );

  const callsSection = (
    <CallsSection
      calls={calls}
      onAdd={onAddCall}
      onRemove={onRemoveCall}
      days={days}
      active={activeDay}
      onMoveDay={onMoveCallDay}
    />
  );

  const dayBar = (
    <DayBar
      prefs={prefs}
      onChange={onChangePrefs}
      start={startOverride}
      startFallback={startFallback}
      end={endOverride}
      home={home}
      onChangeStart={onChangeStart}
      onChangeEnd={onChangeEnd}
      finish={schedule?.finish ?? null}
      driveMinutes={driveMinutes}
      driveMiles={driveMiles}
      state={legState}
      endLabel={endLabel}
      hasStops={stops.length > 0}
    />
  );

  if (stops.length === 0) {
    return (
      <>
        {header}
        <DayTabs days={days} active={activeDay} onSelect={onSelectDay} />
        {callsSection}
        {dayBar}
        <div className="rounded-lg border border-dashed border-[#E2DFD5] bg-white p-5 text-[13.5px] leading-relaxed text-[#5B6560]">
          Nothing planned for {dayLabel(activeDay).weekday} yet. Tap a pin on the map and choose{" "}
          <span className="font-medium text-[#3D4A44]">Add to route</span> to start one, or add a
          lunch or hotel stop below. The list stays put until you remove a stop, so a route you
          build in the morning is still here later.
        </div>
        <div className="mt-2">
          <AddStopForm onAdd={onAddCustomStop} />
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      <DayTabs days={days} active={activeDay} onSelect={onSelectDay} />

      {callsSection}

      {dayBar}

      {/* OPTIMIZE ROUTE, above stop 1 (Juan's ask 2026-08-23): the graph
          problem solved on demand, never automatically. Needs three stops to
          have anything worth reordering -- two stops have exactly one order. */}
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onOptimize}
          disabled={busy || stops.length < 3}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Ico name="gauge" size={13} />
          {busy ? "Working it out..." : "Optimize route"}
        </button>
        {stops.length > 0 && stops.length < 3 && (
          <span className="text-[11.5px] text-[#8A928C]">Needs 3+ stops to reorder</span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
        {/* The drive out. Not a stop, so it is a rule above the first one
            rather than a numbered row, but it is the reason stop 1 is not at
            09:30 and leaving it off makes the morning look longer than it is.
            Read-only here: DayBar above is the one place that edits start. */}
        {start && (
          <div className="flex items-baseline justify-between border-b border-[#EEECE3] bg-[#FAF9F5] px-4 py-2 text-[12.5px] text-[#5B6560]">
            <span className="inline-flex items-center gap-1">
              Leave {start.label}{" "}
              <span className="font-medium tabular-nums text-[#3D4A44]">{prefs.depart}</span>
            </span>
            {schedule?.toFirst && (
              <span className="tabular-nums text-[#8A928C]">
                {duration(schedule.toFirst.minutes)} · {schedule.toFirst.miles.toFixed(1)} mi
              </span>
            )}
          </div>
        )}
        <ul ref={listRef} className="divide-y divide-[#EEECE3]">
          {stops.map((s, i) => {
            const prev = i > 0 ? stops[i - 1] : null;
            const a = s.type === "account" ? s.account : null;
            const c = s.type === "custom" ? s.custom : null;
            const title = a ? a.name : c!.label;
            // CONTROLS DROP TO THEIR OWN ROW ON A PHONE. Five buttons beside
            // the text left the name as "DIRECTLY FR..." and the address as
            // "621 RUSHING C..." in Juan's 2026-08-05 screenshot, which is a
            // stop you cannot identify next to controls you do not need until
            // you have. Below sm the text gets the full width and the buttons
            // sit under it, right-aligned.
            //
            // THE INSERTION LINE (2026-08-25): while a drag is live, the row
            // at drag.dropIndex gets a top border and the dragged row itself
            // dims, rather than reflowing the whole list on every pointer
            // move -- see the drag handlers above for why.
            const dropBefore = drag && drag.dropIndex === i && drag.id !== s.id;
            const dropAtEnd = drag && drag.dropIndex === stops.length && i === stops.length - 1;
            return (
              <li
                key={s.id}
                data-stop-id={s.id}
                className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 ${
                  drag?.id === s.id ? "opacity-40" : ""
                } ${dropBefore ? "border-t-2 border-[#2C6A46]" : ""} ${
                  dropAtEnd ? "border-b-2 border-[#2C6A46]" : ""
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                {/* An amber square for a lunch or hotel stop, the same shape and
                    colour it gets on the map, so the list and the map agree at a
                    glance about which stops are not accounts. */}
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span
                    className={`mt-0.5 flex h-6 w-6 items-center justify-center text-[11.5px] font-semibold tabular-nums text-[#F7F6F1] ${
                      c ? "rounded-[4px] bg-[#A0762C]" : "rounded-full bg-[#14201B]"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {/* When he is there, in the column he is already scanning for
                      "which stop is this". Absent, not zeroed, when the router
                      could not answer. */}
                  {schedule && (
                    <span className="whitespace-nowrap text-[10.5px] leading-tight tabular-nums text-[#8A928C]">
                      {clock(schedule.rows[i].arrive)}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {c ? (
                    <>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate text-[14px] font-medium leading-snug">{c.label}</span>
                        <span className="rounded bg-[#F6EEDD] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-[#7A5A1E]">
                          {CUSTOM_STOP_LABEL[c.kind]}
                        </span>
                        {/* Lunch is the one stop whose length is not the dwell
                            everything else uses, so it says how long it is. */}
                        {schedule && schedule.rows[i].stay > 0 && c.kind !== "stop" && (
                          <span className="text-[11.5px] tabular-nums text-[#8A928C]">
                            {clock(schedule.rows[i].arrive)}-{clock(schedule.rows[i].leave)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px] text-[#5B6560]">{c.address}</div>
                    </>
                  ) : (
                  <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <AccountLink
                      id={a!.id}
                      className="truncate text-[14px] font-medium leading-snug hover:underline"
                    >
                      {a!.name}
                    </AccountLink>
                    {a!.tier && <TierChip tier={a!.tier} scale="hq" />}
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-[#5B6560]">
                    {a!.street}
                    {a!.city ? `, ${a!.city}` : ""}
                  </div>

                  {/* THE TRADING FACTS, Juan's ask 2026-08-05: last order, what
                      they spent over twelve months and on what, and lifetime.
                      Each one is omitted when it is unknown rather than shown
                      as a zero, because "$0 in 12m" and "we hold no orders for
                      this account" are different sentences and only one of them
                      is true here. 313 of the 459 accounts have no loaded order
                      history at all, so the empty case is the common case. */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-[#5B6560]">
                    {a!.last_order_at ? (
                      <span>
                        last order{" "}
                        <span className="font-medium text-[#3D4A44]">
                          {monthYear(a!.last_order_at)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[#A9AFA9]">never ordered</span>
                    )}
                    {a!.trailing_12m_revenue !== null && (
                      <span>
                        12m{" "}
                        <span className="font-medium tabular-nums text-[#3D4A44]">
                          {usd(a!.trailing_12m_revenue)}
                        </span>
                      </span>
                    )}
                    {a!.lifetime_revenue !== null && (
                      <span>
                        lifetime{" "}
                        <span className="font-medium tabular-nums text-[#3D4A44]">
                          {usd(a!.lifetime_revenue)}
                        </span>
                      </span>
                    )}
                    {/* 12m category when they have bought this year, else the
                        lifetime one marked as historic, so "Dietary Supplement"
                        never silently means "back in 2024". */}
                    {a!.top_category_12m ? (
                      <span className="font-medium text-[#2C6A46]">{a!.top_category_12m}</span>
                    ) : a!.top_category_lifetime ? (
                      <span className="text-[#8A928C]">
                        {a!.top_category_lifetime} <span className="text-[#A9AFA9]">(historic)</span>
                      </span>
                    ) : (
                      <span className="text-[#A9AFA9]">no orders on file</span>
                    )}
                  </div>

                  {/* HUBSPOT, SITE, PHONE ON EVERY STOP (Juan, 2026-08-05).
                      A stop is decided at the curb: the portal record for what
                      HQ knows, the site for what they sell, the number for
                      "are you open / is the buyer in today". All three were a
                      tap-through into the profile before this, which is the one
                      thing a phone in a car should not have to do. */}
                  <ReachLinks
                    className="mt-1"
                    hubspotId={a!.hubspot_company_id}
                    website={a!.website}
                    phone={a!.phone}
                  />
                  </>
                  )}

                  {/* The leg in, then the window. Falls back to the original
                      straight-line hop whenever the router gave us nothing, so
                      the row never goes blank and never claims a drive time it
                      does not have. */}
                  {prev &&
                    (legBetween(i) ? (
                      <div className="mt-0.5 text-[12px] text-[#8A928C]">
                        <span className="tabular-nums">{duration(legBetween(i)!.minutes)}</span>{" "}
                        drive ·{" "}
                        <span className="tabular-nums">{legBetween(i)!.miles.toFixed(1)} mi</span>{" "}
                        from stop {i}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[12px] text-[#8A928C]">
                        <span className="tabular-nums">{haversineMiles(prev, s).toFixed(1)} mi</span>{" "}
                        straight-line from stop {i}
                      </div>
                    ))}
                </div>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-1">
                  {/* DRAG HANDLE (2026-08-25), first in the row so it sits
                      right against the stop's own text rather than among the
                      tap targets: grab and drop anywhere in the list, no
                      per-position tap count. Alongside the chevrons below,
                      not instead of them -- see the drag-state comment above
                      for why both stay. touchAction: none stops the page
                      itself from scrolling while a finger is mid-drag. */}
                  <button
                    type="button"
                    onPointerDown={(e) => handleGripDown(e, s.id, i)}
                    onPointerMove={handleGripMove}
                    onPointerUp={handleGripUp}
                    onPointerCancel={() => setDrag(null)}
                    aria-label={`Drag ${title} to reorder`}
                    style={{ touchAction: "none" }}
                    className="cursor-grab rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] active:cursor-grabbing"
                  >
                    <Ico name="grip" size={13} />
                  </button>
                  {/* MOVE TO TOP (2026-08-21): a stop found deep on the
                      ten-closest list otherwise costs one tap of the chevron
                      per position to become the day's first door. Same
                      disabled-at-the-top rule as the single-step button next
                      to it, since "move to top" from the top is a no-op. */}
                  <button
                    type="button"
                    onClick={() => onMoveToTop(s.id)}
                    disabled={i === 0}
                    aria-label={`Move ${title} to the top of the route`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Ico name="chevrons-up" size={13} />
                  </button>
                  {/* Up/down rather than drag: this is used one-handed in a
                      parked car, where a 44px button beats a drag target. */}
                  <button
                    type="button"
                    onClick={() => onMove(s.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${title} earlier`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Ico name="chevron-up" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(s.id, 1)}
                    disabled={i === stops.length - 1}
                    aria-label={`Move ${title} later`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Ico name="chevron-down" size={13} />
                  </button>
                  {/* MOVE TO A DAY (2026-08-25): was a plain postpone-to-
                      tomorrow button, now opens a picker over the whole
                      horizon -- see DayMoveMenu. Hidden rather than disabled
                      on a single-day horizon, since there is nowhere for it
                      to open onto. */}
                  {days.length > 1 && (
                    <DayMoveMenu
                      days={days}
                      active={activeDay}
                      onPick={(day) => onMoveStopDay(s.id, day)}
                      label={`Move ${title} to a day`}
                      icon="chevrons-right"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onShowInMap(s.id)}
                    aria-label={`Show ${title} on the map`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
                  >
                    <Ico name="locate" size={13} />
                  </button>
                  <a
                    href={appleMapsUrl({
                      address: c ? c.address : fullAddress(a!),
                      lat: s.lat,
                      lng: s.lng,
                    })}
                    className="rounded-md bg-[#2C6A46] px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    GO
                  </a>
                  <button
                    type="button"
                    onClick={() => onRemove(s.id)}
                    aria-label={`Remove ${title} from the route`}
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#8A928C] transition-colors hover:border-[#D8B3AC] hover:bg-[#FBF4F2] hover:text-[#B5372A]"
                  >
                    <Ico name="close" size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* The drive back, for the same reason the drive out is there: the day
            is not over when the last door closes. Read-only, same as the
            drive-out row above -- DayBar is the one place that edits end. */}
        {end && schedule?.end && (
          <div className="flex items-baseline justify-between border-t border-[#EEECE3] bg-[#FAF9F5] px-4 py-2 text-[12.5px] text-[#5B6560]">
            <span className="inline-flex items-center gap-1">
              {end.label}
              <span className="font-medium tabular-nums text-[#3D4A44]">{clock(schedule.finish)}</span>
            </span>
            <span className="tabular-nums text-[#8A928C]">
              {duration(schedule.end.minutes)} · {schedule.end.miles.toFixed(1)} mi
            </span>
          </div>
        )}
      </div>

      <div className="mt-2">
        <AddStopForm onAdd={onAddCustomStop} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-[62ch] text-[12px] leading-relaxed text-[#8A928C]">
          {legState === "ok" && legs
            ? "Road distances and times, scaled for typical daytime traffic. A planning estimate, not a live ETA. Order is yours; Optimize route only runs when you tap it."
            : "Straight-line hops, not drive time. Order is yours; Optimize route only runs when you tap it."}
        </p>
        <div className="flex items-center gap-2">
          {stops.length > 1 && (
            <a
              href={appleMapsRouteUrl(stops)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
            >
              <Ico name="pin" size={13} />
              Open all in Maps
            </a>
          )}
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#8A928C] transition-colors hover:border-[#D8B3AC] hover:text-[#B5372A]"
          >
            Clear route
          </button>
        </div>
      </div>
    </>
  );
}
