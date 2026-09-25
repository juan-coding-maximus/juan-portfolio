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
import { Reorder, useDragControls } from "motion/react";
import type { CallEntry, CustomStop, RouteEndpoint, RouteSchedulePrefs } from "../lib/dal";
import { appleMapsUrl, CUSTOM_STOP_LABEL, fullAddress, Ico, prettyPhone, ReachLinks, TierChip } from "../lib/ui";
import { AccountLink } from "../lib/modal";
import { useRoute } from "../lib/route-context";
import { AddStopForm } from "./AddStopForm";
import { CallSearchField } from "./CallSearchField";
import type { ClientSearchAccount } from "./ClientSearchField";
import { DayMoveMenu } from "./DayMoveMenu";
import { DayTabs } from "./DayTabs";
import { routeDriveLegs, type DriveLeg } from "./drive-actions";
import { BAND_STYLE, driveBand, likelyDriveMinutes } from "./traffic";
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
  dayISO: string,
  /**
   * Stop id -> "HH:MM", the times a human STATED for particular stops
   * (migration 0065). Juan's routing rule, 2026-09-03: "a stop with a stated
   * time is an anchor. The day is built around it... the next leg starts when
   * it ends." So an anchored stop's arrival is held AT its clock rather than
   * wherever the drive-time walk happened to land, and everything after it is
   * measured from there.
   *
   * IT ONLY EVER PUSHES THE CLOCK FORWARD. Arriving early at a 12:30
   * appointment means waiting until 12:30, which is what the anchor asserts.
   * Arriving LATE is a real conflict and the schedule says so plainly by
   * keeping the honest later time rather than rewinding to a clock the drive
   * cannot make: a route that quietly prints 12:30 for a stop it reaches at
   * 13:10 is exactly the fabricated number principle 2 exists to stop. The
   * panel flags that stop instead.
   */
  anchors: Record<string, string> = {},
): {
  rows: ScheduleRow[];
  /** Stop ids whose stated time the day cannot make: the drive gets there
   *  after the clock Juan wrote down. Named, never silently corrected. */
  missedAnchors: string[];
  finish: number;
  toFirst: DriveLeg | null;
  end: DriveLeg | null;
  /** Every leg repriced at the hour it is actually driven, same indexing as
   *  the `legs` that came in. This is what the panel AND the map both read, so
   *  a segment can never say 52 minutes in one place and 38 in the other. */
  priced: DriveLeg[];
} {
  /**
   * PRICED FORWARD, ONE PASS.
   *
   * A leg's cost depends on when it departs, and when it departs depends on
   * every leg before it, so the clock has to be walked rather than summed. The
   * old version multiplied every leg by a flat 1.35 regardless of hour, which
   * under-counted the 17:00 leg home and over-counted the 07:30 leg out, and
   * on a ten-stop day those errors compounded into the one number Juan
   * actually plans around. See traffic.ts.
   */
  const price = (leg: DriveLeg | undefined, atMinutes: number): DriveLeg | null => {
    if (!leg) return null;
    const at = new Date(`${dayISO}T00:00:00`);
    at.setMinutes(at.getMinutes() + atMinutes);
    return { ...leg, minutes: likelyDriveMinutes(leg.freeFlowMinutes, at) };
  };

  const priced: DriveLeg[] = new Array(legs.length);
  const depart = minutesOfDay(prefs.depart);

  const toFirst = hasStart ? price(legs[0], depart) : null;
  if (hasStart && toFirst) priced[0] = toFirst;

  /* Between consecutive stops: drop the leading/trailing legs that belong to
     the start/end rather than to a stop-to-stop hop. */
  const betweenOffset = hasStart ? 1 : 0;
  const between = legs.slice(betweenOffset, legs.length - (hasEnd ? 1 : 0));

  const rows: ScheduleRow[] = [];
  const missedAnchors: string[] = [];
  let t = depart + (toFirst?.minutes ?? 0);
  stops.forEach((s, i) => {
    if (i > 0) {
      // Departing the previous stop is when this hop is actually driven.
      const hop = price(between[i - 1], t);
      if (hop) priced[betweenOffset + i - 1] = hop;
      t += hop?.minutes ?? 0;
    }
    // The anchor, applied before the dwell so the whole rest of the day is
    // measured from the stated time rather than from the drive's own guess.
    const anchor = anchors[s.id];
    if (anchor) {
      const at = minutesOfDay(anchor);
      if (at >= t) t = at;
      else missedAnchors.push(s.id);
    }
    const kind = s.type === "custom" ? s.custom.kind : null;
    const stay =
      kind === "lunch" ? prefs.lunchMinutes : kind === "hotel" ? 0 : prefs.dwellMinutes;
    rows.push({ arrive: t, leave: t + stay, stay });
    t += stay;
  });

  const endLeg = hasEnd ? price(legs[legs.length - 1], t) : null;
  if (hasEnd && endLeg) priced[legs.length - 1] = endLeg;

  // Any leg the walk never reached (a stop with no coordinates upstream) keeps
  // its flat-factor value rather than becoming undefined. Never a blank.
  for (let i = 0; i < legs.length; i++) if (!priced[i]) priced[i] = legs[i];

  return { rows, missedAnchors, finish: t + (endLeg?.minutes ?? 0), toFirst, end: endLeg, priced };
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
              <span className="font-semibold text-[#2C6A46]">
                {endLabel === "Home" ? "Back home " : `Back at ${endLabel} `}
                <span className="tabular-nums">{clock(finish)}</span>
              </span>
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
/**
 * One stop, its own component rather than an inline .map() body (2026-09-23):
 * Reorder.Item needs its own useDragControls() so the grip button starts the
 * gesture and nothing else on the row does, and a hook can only be called
 * once per component instance, not once per loop iteration.
 *
 * scheduleRow/leg arrive pre-resolved by id and by pair (RoutePanel's
 * scheduleById/legByPair) rather than by position, so a row never shows
 * another stop's arrival time or drive leg while a drag has it sitting
 * somewhere its committed index does not match -- see those maps' comments.
 */
function StopRow({
  stop: s,
  index: i,
  prevStop: prev,
  title,
  isDone,
  scheduleRow,
  missedAnchor,
  stopTime,
  onSetStopTime,
  leg,
  onToggleDone,
  onShowInMap,
  onRemove,
  days,
  activeDay,
  onMoveStopDay,
  onRowDragStart,
  onRowDragEnd,
}: {
  stop: RouteStopView;
  index: number;
  prevStop: RouteStopView | null;
  title: string;
  isDone: boolean;
  scheduleRow: ScheduleRow | null;
  missedAnchor: boolean;
  stopTime: string | undefined;
  onSetStopTime: (id: string, at: string | null) => void;
  leg: DriveLeg | null;
  onToggleDone: (id: string) => void;
  onShowInMap: (id: string) => void;
  onRemove: (id: string) => void;
  days: string[];
  activeDay: string;
  onMoveStopDay: (id: string, day: string) => void;
  onRowDragStart: () => void;
  onRowDragEnd: () => void;
}) {
  const a = s.type === "account" ? s.account : null;
  const c = s.type === "custom" ? s.custom : null;
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={s.id}
      as="li"
      dragListener={false}
      dragControls={dragControls}
      onDragStart={onRowDragStart}
      onDragEnd={onRowDragEnd}
      layout
      // Damping 1.0 / response 0.4 (apple-design's own "move / reposition"
      // default): a row sliding into the gap settles smoothly, no bounce --
      // bounce is reserved for a released flick, and nothing here is thrown.
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      // The lifted row itself, while held: a small raise and shadow, same
      // language a dragged card gets anywhere else in this OS, gone the
      // instant it is let go rather than settling out slowly.
      whileDrag={{ scale: 1.01, boxShadow: "0 10px 28px rgba(20,32,27,0.16)", zIndex: 1 }}
      // flex-wrap (2026-08-30): the button cluster below (drag, done,
      // day-move, locate, GO, remove) is shrink-0 -- it never gets narrower --
      // so on a route column too skinny to hold both it and the stop's own
      // text on one line, it now drops to its own line under the text instead
      // of forcing the row past the column's width.
      className={`flex flex-col flex-wrap gap-2 bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-3 ${
        isDone ? "opacity-50" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
      {/* An amber square for a lunch or hotel stop, the same shape and
          colour it gets on the map, so the list and the map agree at a
          glance about which stops are not accounts. Done (0042) swaps
          the position number for a checkmark -- the fact that a stop
          is #4 stops mattering the moment it's crossed off. */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span
          className={`mt-0.5 flex h-6 w-6 items-center justify-center text-[11.5px] font-semibold tabular-nums text-[#F7F6F1] ${
            c ? "rounded-[4px] bg-[#A0762C]" : "rounded-full bg-[#14201B]"
          }`}
        >
          {isDone ? <Ico name="check" size={12} /> : i + 1}
        </span>
        {/* When he is there, in the column he is already scanning for
            "which stop is this". Absent, not zeroed, when the router
            could not answer. */}
        {scheduleRow && (
          <span className="whitespace-nowrap text-[10.5px] leading-tight tabular-nums text-[#8A928C]">
            {clock(scheduleRow.arrive)}
          </span>
        )}
        {/* A STATED TIME, and it is a control, not a caption (0065).
            The day is built around it: the schedule above holds this
            stop at this clock and starts the next leg from it. Tap it
            to change it, clear it to hand the stop back to the
            ordering. Amber when the drive cannot make it, because a
            route that quietly printed the stated time for a stop it
            reaches forty minutes later would be inventing the one
            number Juan plans around. */}
        {stopTime && (
          <button
            type="button"
            onClick={() => {
              const next = window.prompt(
                "Stated time for this stop (HH:MM). Leave empty to clear it.",
                stopTime,
              );
              if (next === null) return;
              const trimmed = next.trim();
              if (!trimmed) return onSetStopTime(s.id, null);
              if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) onSetStopTime(s.id, trimmed);
            }}
            title={
              missedAnchor && scheduleRow
                ? `Asked for ${stopTime}, but this order gets there at ${clock(scheduleRow.arrive)}`
                : `Anchored at ${stopTime}. Tap to change or clear.`
            }
            className={`whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium tabular-nums ${
              missedAnchor
                ? "bg-[#F6E4DF] text-[#8A3B2E]"
                : "bg-[#F3E3C6] text-[#8A6D2F]"
            }`}
          >
            {stopTime}
          </button>
        )}
      </div>

      {/* min-w-[10rem] not min-w-0 (2026-08-31): min-w-0 let this
          shrink all the way to nothing instead of ever wrapping the
          button cluster onto its own line -- flex-wrap only kicks
          in once a child truly can't shrink any further, and a
          flex-1 item with no floor can always "fit" by crushing the
          stop's name down to a couple of letters. 160px is enough
          for a truncated name to still read as a name. */}
      <div className="min-w-[10rem] flex-1">
        {c ? (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={`truncate text-[14px] font-medium leading-snug ${isDone ? "line-through" : ""}`}>
                {c.label}
              </span>
              <span className="rounded bg-[#F6EEDD] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-[#7A5A1E]">
                {CUSTOM_STOP_LABEL[c.kind]}
              </span>
              {/* Lunch is the one stop whose length is not the dwell
                  everything else uses, so it says how long it is. */}
              {scheduleRow && scheduleRow.stay > 0 && c.kind !== "stop" && (
                <span className="text-[11.5px] tabular-nums text-[#8A928C]">
                  {clock(scheduleRow.arrive)}-{clock(scheduleRow.leave)}
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
            className={`truncate text-[14px] font-medium leading-snug hover:underline ${isDone ? "line-through" : ""}`}
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

        {/* The leg in, then the window. Falls back to the straight-line
            hop whenever the router gave us nothing for this exact pair
            (either it is down, or a live drag has made this pair
            adjacent before the router has ever seen it), so the row
            never goes blank and never claims a drive time it does not
            have. */}
        {prev &&
          (leg ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[#8A928C]">
              {/* The same band the map draws this leg in (traffic.ts),
                  so the two panes of the dashboard describe one day
                  rather than two. A dot, not a word: the row already
                  carries the exact minutes right beside it. */}
              <span
                aria-hidden
                title={BAND_STYLE[driveBand(leg.minutes)].title}
                className="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-[#14201B]/40"
                style={{ backgroundColor: BAND_STYLE[driveBand(leg.minutes)].color }}
              />
              <span>
                <span className="tabular-nums">{duration(leg.minutes)}</span>{" "}
                drive ·{" "}
                <span className="tabular-nums">{leg.miles.toFixed(1)} mi</span>{" "}
                from stop {i}
                {driveBand(leg.minutes) === "walk" && (
                  <span className="ml-1 font-medium text-[#2C6A46]">walkable</span>
                )}
              </span>
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
        {/* DRAG HANDLE, THE ONLY WAY TO REORDER (2026-08-25, drag-only since
            2026-09-23 on Juan's ask -- the up/down/move-to-top buttons that
            used to sit here are gone; a grip and a full-height drag target
            replace all three). dragControls.start fires the gesture from
            this button alone, so GO/remove/day-move stay taps. touchAction:
            none stops the page itself from scrolling while a finger is
            mid-drag. */}
        <button
          type="button"
          onPointerDown={(e) => dragControls.start(e)}
          aria-label={`Drag ${title} to reorder`}
          style={{ touchAction: "none" }}
          className="cursor-grab rounded-md border border-[#E2DFD5] bg-white px-2 py-2 text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] active:cursor-grabbing"
        >
          <Ico name="grip" size={13} />
        </button>
        {/* DONE (0042, 2026-08-26): crosses the stop off without
            removing it, so the mileage/finish clock above still
            reflects the whole day, not just what's left. Toggle,
            not a one-way mark, so a mis-tap costs one more tap. */}
        <button
          type="button"
          onClick={() => onToggleDone(s.id)}
          aria-label={isDone ? `Mark ${title} not done` : `Mark ${title} done`}
          aria-pressed={isDone}
          className={`rounded-md border px-2 py-2 transition-colors ${
            isDone
              ? "border-[#2C6A46] bg-[#2C6A46] text-white hover:opacity-90"
              : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
          }`}
        >
          <Ico name="check" size={13} />
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
    </Reorder.Item>
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
  onReorder,
  onRemove,
  onClear,
  onShowInMap,
  onAddCustomStop,
  accounts,
  inRoute,
  onAddAccount,
  calls,
  onAddCall,
  onRemoveCall,
  onMoveCallDay,
  done,
  onToggleDone,
  stopTimes,
  onSetStopTime,
  days,
  activeDay,
  onSelectDay,
  onMoveStopDay,
  onOptimize,
  busy,
  onLegsChange,
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
  /** Reorder the whole day to an exact id order -- both Optimize route and
      the drag handle below call this, the former with the router's answer,
      the latter with wherever the drag let go. Called exactly once per
      commit, never mid-gesture (see the drag-to-reorder comment below). */
  onReorder: (idsInOrder: string[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onShowInMap: (id: string) => void;
  onAddCustomStop: (stop: Omit<CustomStop, "id">) => void;
  /** Juan's whole owned book, for the "Client" search in the add-stop row
   *  (2026-09-14). The same array MapScreen resolves a draft entry against, so
   *  anything pickable here is something the route can actually draw. */
  accounts: ClientSearchAccount[];
  /** Stop ids already on the active day, so the search can say so rather than
   *  offering an add that does nothing. */
  inRoute: Set<string>;
  /** Put an account on this day. Goes into route_draft as its nb_accounts.id,
   *  never as a copied address. */
  onAddAccount: (account: ClientSearchAccount) => void;
  /** This day's calls (0041): phone-only, no drive position. */
  calls: CallEntry[];
  onAddCall: (call: Omit<CallEntry, "id">) => void;
  onRemoveCall: (id: string) => void;
  /** Move one call to any day on the horizon (2026-08-25). */
  onMoveCallDay: (id: string, day: string) => void;
  /** Stop ids marked done today (0042). Crossed off, never removed. */
  done: Set<string>;
  onToggleDone: (id: string) => void;
  /** Stated arrival times for THIS day's stops, stop id -> "HH:MM" (0065).
      A stop with one is an anchor: the schedule below holds its arrival at
      that clock and measures the rest of the day from it. Absent means no
      time was stated, which is the normal case. */
  stopTimes: Record<string, string>;
  /** Set a stop's stated time, or clear it with null. */
  onSetStopTime: (id: string, at: string | null) => void;
  /** The rolling ten-weekday horizon (Mon-Fri), the one Juan's on, and the switch. */
  days: string[];
  activeDay: string;
  onSelectDay: (day: string) => void;
  /** Move one stop to any day on the horizon (2026-08-25): opens a day
      picker rather than always pushing to the next tab. */
  onMoveStopDay: (id: string, day: string) => void;
  /** Reorder the whole day for the least total driving (route-optimize.ts). */
  onOptimize: () => void;
  /** Publishes the legs this panel is DISPLAYING, already priced at the hour
   *  each one is driven, so the map can draw the same day the list describes.
   *  The panel owns this computation because it owns the schedule; a second
   *  copy in MapScreen is a second answer waiting to disagree. */
  onLegsChange?: (legs: DriveLeg[] | null) => void;
  /** True while a smart-insert or an optimize is computing. */
  busy: boolean;
}) {
  const [legs, setLegs] = useState<DriveLeg[] | null>(null);
  const [legState, setLegState] = useState<"loading" | "ok" | "unavailable">("loading");
  // A save that got optimistically drawn and then quietly reverted used to
  // say nothing at all (Juan, 2026-09-16). Read straight off RouteProvider
  // rather than threaded through from MapScreen, since every write it can
  // report on already lives there.
  const { writeError, dismissWriteError } = useRoute();

  // DRAG TO REORDER, REAL-TIME REFLOW (2026-08-25, rebuilt 2026-09-23 on
  // Juan's ask: drag-only, no up/down buttons, and the list has to actually
  // move under the finger rather than show a static insertion line). Built on
  // Motion's Reorder.Group/Reorder.Item (motion/react, apple-design's own
  // recommended tool for a live drag-reorder list): each row is a
  // Reorder.Item with `layout` on, so a row sliding out of the way animates
  // continuously via a FLIP transform rather than jumping to its new slot.
  //
  // ORDER IS LOCAL AND VISUAL UNTIL DROP. `orderIds` is what is on screen; it
  // is driven every frame by Reorder.Group's onReorder while a drag is live,
  // but the real `onReorder` prop -- the one write that touches route_draft --
  // fires exactly once, in handleRowDragEnd, same all-or-nothing contract
  // Optimize route uses. `draggingRef` stops the sync effect below from
  // overwriting the order the finger is actively setting if a server refresh
  // (see route-context.tsx's arrival-effect) lands mid-gesture.
  const [orderIds, setOrderIds] = useState<string[]>(() => stops.map((s) => s.id));
  const draggingRef = useRef(false);
  const orderIdsRef = useRef(orderIds);
  orderIdsRef.current = orderIds;

  useEffect(() => {
    if (draggingRef.current) return;
    setOrderIds(stops.map((s) => s.id));
  }, [stops]);

  function handleRowDragStart() {
    draggingRef.current = true;
  }

  function handleRowDragEnd() {
    draggingRef.current = false;
    const ids = orderIdsRef.current;
    // Guards a stale drop racing a stop being added/removed mid-gesture: only
    // ever commits a full, matching permutation, never a partial one.
    if (ids.length === stops.length && ids.some((id, i) => id !== stops[i]?.id)) onReorder(ids);
  }

  const stopsById = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);
  const displayStops = orderIds
    .map((id) => stopsById.get(id))
    .filter((s): s is RouteStopView => s !== undefined);

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
    () => (legs ? buildSchedule(stops, legs, start !== null, end !== null, prefs, activeDay, stopTimes) : null),
    [legs, stops, start, end, prefs, activeDay, stopTimes],
  );

  // The priced legs, not the raw ones: what the row shows must be the number
  // the finish clock was actually computed from.
  const shownLegs = schedule?.priced ?? legs;

  useEffect(() => {
    onLegsChange?.(shownLegs);
    // shownLegs is derived from legs+schedule; onLegsChange is a stable setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownLegs]);

  const legBetween = (i: number): DriveLeg | null => {
    if (!shownLegs || i < 1) return null;
    return shownLegs.slice(start ? 1 : 0, shownLegs.length - (end ? 1 : 0))[i - 1] ?? null;
  };

  // A drive leg belongs to a PAIR of adjacent stops, keyed here by that pair's
  // ids rather than by position. During a drag, the visual order can put two
  // stops next to each other the router was never asked about; looked up by
  // id, that pair simply has no entry and the row falls back to its
  // straight-line hop (see the render loop) -- correct, not a stale number
  // attached to the wrong pair, and never a fabricated one either.
  const legByPair = useMemo(() => {
    const m = new Map<string, DriveLeg>();
    stops.forEach((s, i) => {
      if (i === 0) return;
      const leg = legBetween(i);
      if (leg) m.set(`${stops[i - 1].id}:${s.id}`, leg);
    });
    return m;
    // legBetween closes over shownLegs/start/end; stops is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, shownLegs]);

  // Same reasoning, keyed by id: a stop's own arrival/leave clock is always
  // attributable to that stop no matter where the drag has visually moved it
  // to, even if the minutes themselves are a beat behind the new order until
  // the drop recomputes them.
  const scheduleById = useMemo(() => {
    if (!schedule) return null;
    const m = new Map<string, ScheduleRow>();
    stops.forEach((s, i) => m.set(s.id, schedule.rows[i]));
    return m;
  }, [schedule, stops]);

  const driveMinutes = shownLegs ? shownLegs.reduce((s, l) => s + l.minutes, 0) : null;
  const driveMiles = shownLegs ? shownLegs.reduce((s, l) => s + l.miles, 0) : null;
  const endLabel = end?.label ?? "Home";

  const header = (
    <div className="mb-3 mt-6 flex items-baseline justify-between">
      <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
        Route
      </h2>
      {stops.length > 0 && (
        <span className="text-[12px] text-[#8A928C]">
          {stops.length} stop{stops.length === 1 ? "" : "s"}, in your order
        </span>
      )}
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
        {/* ADD A CLIENT / ADD A STOP, between Calls and the Leave-at bar
            (Juan's ask 2026-09-23): the two stacked rows sit here in both the
            empty-day and has-stops layouts, so the position never moves
            depending on whether anything is planned yet. No heading above
            them -- see AddStopForm's own comment for why the client and stop
            arms are two rows rather than one button with tabs. */}
        <div className="mb-2">
          <AddStopForm
            onAdd={onAddCustomStop}
            accounts={accounts}
            inRoute={inRoute}
            onAddAccount={onAddAccount}
          />
        </div>
        {dayBar}
      </>
    );
  }

  return (
    <>
      {header}

      {writeError && (
        <p className="mb-3 text-[12.5px] text-[#B5372A]">
          {writeError}{" "}
          <button type="button" onClick={dismissWriteError} className="underline hover:no-underline">
            Dismiss
          </button>
        </p>
      )}

      <DayTabs days={days} active={activeDay} onSelect={onSelectDay} />

      {callsSection}

      {/* ADD A CLIENT / ADD A STOP, between Calls and the Leave-at bar (Juan's
          ask 2026-09-23), same position as the empty-day layout above. */}
      <div className="mb-2">
        <AddStopForm
          onAdd={onAddCustomStop}
          accounts={accounts}
          inRoute={inRoute}
          onAddAccount={onAddAccount}
        />
      </div>

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
        <Reorder.Group
          as="ul"
          axis="y"
          values={orderIds}
          onReorder={setOrderIds}
          className="divide-y divide-[#EEECE3]"
        >
          {displayStops.map((s, i) => {
            const prev = i > 0 ? displayStops[i - 1] : null;
            const a = s.type === "account" ? s.account : null;
            const c = s.type === "custom" ? s.custom : null;
            const title = a ? a.name : c!.label;
            const isDone = done.has(s.id);
            const leg = prev ? legByPair.get(`${prev.id}:${s.id}`) ?? null : null;
            return (
              <StopRow
                key={s.id}
                stop={s}
                index={i}
                prevStop={prev}
                title={title}
                isDone={isDone}
                scheduleRow={scheduleById?.get(s.id) ?? null}
                missedAnchor={schedule?.missedAnchors.includes(s.id) ?? false}
                stopTime={stopTimes[s.id]}
                onSetStopTime={onSetStopTime}
                leg={leg}
                onToggleDone={onToggleDone}
                onShowInMap={onShowInMap}
                onRemove={onRemove}
                days={days}
                activeDay={activeDay}
                onMoveStopDay={onMoveStopDay}
                onRowDragStart={handleRowDragStart}
                onRowDragEnd={handleRowDragEnd}
              />
            );
          })}
        </Reorder.Group>

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
