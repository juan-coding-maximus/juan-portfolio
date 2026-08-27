"use client";

/**
 * The hand-built route (migration 0029), as app-wide state rather than a
 * MapScreen-local one. Originally this lived entirely inside MapScreen, which
 * worked as long as "Add to route" only ever appeared on a map pin's card. It
 * moved here 2026-08-11 so the same action can appear on an account's profile
 * too, opened from anywhere in the app via the modal (see modal.tsx) or the
 * standalone /account/[id] page, not only from the map.
 *
 * Lives above ModalProvider in layout.tsx, not inside MapScreen, because the
 * modal's dialog renders as a sibling of `children` inside ModalProvider, not
 * nested under whatever page mounted it: a provider scoped to MapScreen would
 * never wrap the modal's own contents.
 *
 * DAY-PARTITIONED since 2026-08-23 (Juan's ask: plan the whole horizon, one
 * toggle to switch which day he's editing, a way to push a stop to the next
 * one). `routeDraft` below is a VIEW onto the active day's slice of
 * `draftByDay`, kept for every existing caller that only ever knew one route.
 * `addToRoute` and `addCustomStop` take an optional insert index -- MapScreen
 * computes the cheapest gap (route-optimize.ts) when it has coordinates to
 * work with and passes it in; a caller with no coordinates in hand (the
 * account profile page) omits it and gets the old behaviour, appended last.
 *
 * ROLLING HORIZON, not a fixed week (2026-08-24, Juan's ask: postponing off
 * the last tab hit a wall with only four). `days` is the next ten weekdays
 * from today, Monday-Friday, always -- see field-week.ts. It slides forward
 * with the calendar rather than snapping to "this week"/"next week", so a
 * stop can always be postponed one more tab over.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  CallEntry,
  CustomStop,
  RouteCallsByDay,
  RouteDoneByDay,
  RouteDraftByDay,
  RouteDraftEntry,
  RouteState,
} from "./dal";
import { defaultActiveDay, planningHorizonDates } from "./field-week";
import { saveRouteCalls, saveRouteDone, saveRouteDraft } from "./prefs-actions";

type RouteCtx = {
  routeDraft: RouteDraftEntry[];
  inRoute: Set<string>;
  days: string[];
  activeDay: string;
  setActiveDay: (day: string) => void;
  /** True once the server read has landed. Distinguishes "no stops" from
   *  "not loaded yet", which look identical and mean opposite things. */
  hydrated: boolean;
  addToRoute: (id: string, atIndex?: number) => void;
  addCustomStop: (stop: Omit<CustomStop, "id">, atIndex?: number) => void;
  removeFromRoute: (id: string) => void;
  moveInRoute: (id: string, dir: -1 | 1) => void;
  moveToTop: (id: string) => void;
  reorderRoute: (idsInOrder: string[]) => void;
  /** Move one stop from the active day to any day on the horizon (2026-08-25,
   *  generalizes the old "postpone to next day only" button into a day
   *  picker). A no-op moving to the day it is already on. */
  moveStopToDay: (id: string, day: string) => void;
  clearRoute: () => void;
  /** The active day's calls (0041): phone-only, no drive position, never
   *  reordered, never part of route_draft. See dal.ts's CallEntry. */
  calls: CallEntry[];
  addCall: (call: Omit<CallEntry, "id">) => void;
  removeCall: (id: string) => void;
  /** Move one call to any day on the horizon (2026-08-25), same shape as
   *  moveStopToDay but over the calls column. */
  moveCallToDay: (id: string, day: string) => void;
  /** Stop ids marked done today (0042). A done stop stays IN routeDraft --
   *  this is a separate overlay, never a filter, so the schedule/mileage
   *  below never changes when Juan crosses a stop off. */
  done: Set<string>;
  toggleDone: (id: string) => void;
};

const Ctx = createContext<RouteCtx | null>(null);

function entryId(e: RouteDraftEntry): string {
  return typeof e === "string" ? e : e.id;
}

/**
 * The route state, handed over as a PROMISE the layout never awaits.
 *
 * This provider sits above every NutriBiotic screen, because "Add to route"
 * has to work from an account modal opened anywhere. The cost of that reach
 * used to be that the layout blocked on reading nb_ui_prefs before ANY page
 * could render, /visit included, and /visit is the screen Juan opens standing
 * in a doorway with a customer waiting. It never reads a route.
 *
 * So the read is started on the server and consumed here: the shell paints
 * immediately, and the route fills in a beat later on the one or two screens
 * that show it. Nothing renders a wrong route in the meantime, it renders an
 * empty one, and `hydrated` says which of the two it is so a caller can tell
 * "no stops yet" from "not loaded yet".
 *
 * activeDay is seeded once, when the data actually lands, and only if the user
 * has not already picked a day. Overriding a deliberate tap because a fetch
 * resolved late is worse than defaulting a beat later.
 */
export function RouteProvider({ children }: { children: ReactNode }) {
  const days = useMemo(() => planningHorizonDates(), []);
  const [draftByDay, setDraftByDay] = useState<RouteDraftByDay>({});
  const [activeDay, setActiveDay] = useState<string>(() => defaultActiveDay({}, days));
  const [callsByDay, setCallsByDay] = useState<RouteCallsByDay>({});
  const [doneByDay, setDoneByDay] = useState<RouteDoneByDay>({});
  const [hydrated, setHydrated] = useState(false);
  const dayTouchedRef = useRef(false);
  const hydratedRef = useRef(false);

  /**
   * FETCHES ITSELF, AND HYDRATES EXACTLY ONCE.
   *
   * This used to arrive as a prop. As an awaited value it blocked every screen
   * on data most of them never use; as an un-awaited promise it still held the
   * RSC stream open until nb_ui_prefs answered, because that is what handing a
   * promise across the server/client boundary does. An open stream on a
   * saturated phone connection is what iOS reports as "This page couldn't
   * load". See api/route-state/route.ts.
   *
   * ONCE is deliberate. RefreshOnForeground fires router.refresh() on every
   * return to the foreground; re-reading here would let a response that raced
   * ahead of its own save revert an optimistic local edit (commitDay writes the
   * list first and saves after), and Juan would watch a stop he just added
   * disappear on switching back from Maps.
   */
  useEffect(() => {
    if (hydratedRef.current) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);

    fetch("/nutribiotic/api/route-state", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok && !r.redirected ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((state: RouteState & { ok: boolean }) => {
        if (hydratedRef.current || !state.ok) return;
        hydratedRef.current = true;
        setDraftByDay(state.draft);
        setCallsByDay(state.calls);
        setDoneByDay(state.done);
        if (!dayTouchedRef.current) setActiveDay(defaultActiveDay(state.draft, days));
        setHydrated(true);
      })
      .catch(() => {
        // An unreachable route leaves an empty one, and `hydrated` staying
        // false is how a caller tells that apart from "no stops today".
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [days]);

  const routeDraft = useMemo(() => draftByDay[activeDay] ?? [], [draftByDay, activeDay]);
  const calls = useMemo(() => callsByDay[activeDay] ?? [], [callsByDay, activeDay]);
  const done = useMemo(() => new Set(doneByDay[activeDay] ?? []), [doneByDay, activeDay]);

  // Optimistic, same as every other prefs write on this OS: the list moves
  // now and the row catches up, reverted if the write fails. Always the whole
  // week's object, because that is the row's one column.
  function commitDay(day: string, next: RouteDraftEntry[]) {
    const prev = draftByDay;
    const nextByDay = { ...draftByDay, [day]: next };
    setDraftByDay(nextByDay);
    saveRouteDraft(nextByDay).catch(() => setDraftByDay(prev));
  }

  const inRoute = useMemo(() => new Set(routeDraft.map(entryId)), [routeDraft]);

  function addToRoute(id: string, atIndex?: number) {
    if (inRoute.has(id)) return; // adding twice is a mis-tap, not a second visit
    const next = [...routeDraft];
    const i = atIndex !== undefined && atIndex >= 0 && atIndex <= next.length ? atIndex : next.length;
    next.splice(i, 0, id);
    commitDay(activeDay, next);
  }

  function addCustomStop(stop: Omit<CustomStop, "id">, atIndex?: number) {
    const id = `custom:${stop.kind}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const next = [...routeDraft];
    const i = atIndex !== undefined && atIndex >= 0 && atIndex <= next.length ? atIndex : next.length;
    next.splice(i, 0, { ...stop, id });
    commitDay(activeDay, next);
  }

  function removeFromRoute(id: string) {
    commitDay(activeDay, routeDraft.filter((e) => entryId(e) !== id));
    if (done.has(id)) commitDone(activeDay, [...done].filter((d) => d !== id));
  }

  function moveInRoute(id: string, dir: -1 | 1) {
    const i = routeDraft.findIndex((e) => entryId(e) === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= routeDraft.length) return;
    const next = [...routeDraft];
    [next[i], next[j]] = [next[j], next[i]];
    commitDay(activeDay, next);
  }

  // Lifts one stop straight to position 1, the rest sliding down in place
  // rather than swapping pairwise -- Juan's ask 2026-08-21, so a stop found
  // six deep on the ten-closest list does not cost six taps of the single-step
  // chevron to become the day's first door.
  function moveToTop(id: string) {
    const i = routeDraft.findIndex((e) => entryId(e) === id);
    if (i <= 0) return;
    const next = [...routeDraft];
    const [entry] = next.splice(i, 1);
    next.unshift(entry);
    commitDay(activeDay, next);
  }

  // The whole day reordered at once (Optimize route, 2026-08-23): MapScreen
  // hands back the same ids it was given, just in the order route-optimize.ts
  // found shortest. Anything not in the current list (stale computation racing
  // a manual edit) is dropped rather than trusted, and anything missing from
  // the new order stays out rather than getting silently re-appended.
  function reorderRoute(idsInOrder: string[]) {
    const byId = new Map(routeDraft.map((e) => [entryId(e), e]));
    const next = idsInOrder.map((id) => byId.get(id)).filter((e): e is RouteDraftEntry => e !== undefined);
    if (next.length !== routeDraft.length) return; // ids didn't match this day's list; do nothing rather than guess
    commitDay(activeDay, next);
  }

  // Move one stop to any day on the horizon (2026-08-25), dropped onto the
  // end of that day's list. Generalizes the old "postpone to next day only"
  // button, which is now a day picker rather than a single fixed step -- see
  // DayMoveMenu. A no-op moving to the day it is already on.
  function moveStopToDay(id: string, day: string) {
    if (day === activeDay) return;
    if (!days.includes(day)) return;
    const entry = routeDraft.find((e) => entryId(e) === id);
    if (!entry) return;
    const targetList = draftByDay[day] ?? [];
    if (targetList.some((e) => entryId(e) === id)) {
      // already on the target day's list too -- just drop it from today's
      commitDay(activeDay, routeDraft.filter((e) => entryId(e) !== id));
      return;
    }
    const prev = draftByDay;
    const nextByDay = {
      ...draftByDay,
      [activeDay]: routeDraft.filter((e) => entryId(e) !== id),
      [day]: [...targetList, entry],
    };
    setDraftByDay(nextByDay);
    saveRouteDraft(nextByDay).catch(() => setDraftByDay(prev));
  }

  function clearRoute() {
    commitDay(activeDay, []);
    if (done.size > 0) commitDone(activeDay, []);
  }

  // Same optimistic-write shape as commitDay, over the calls column instead
  // of route_draft (0041). A separate function rather than a generic
  // "commit either column" helper, because the two lists have nothing in
  // common once you are past "day-partitioned jsonb on nb_ui_prefs".
  function commitCalls(day: string, next: CallEntry[]) {
    const prev = callsByDay;
    const nextByDay = { ...callsByDay, [day]: next };
    setCallsByDay(nextByDay);
    saveRouteCalls(nextByDay).catch(() => setCallsByDay(prev));
  }

  function addCall(call: Omit<CallEntry, "id">) {
    const id = `call:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    commitCalls(activeDay, [...calls, { ...call, id }]);
  }

  function removeCall(id: string) {
    commitCalls(activeDay, calls.filter((c) => c.id !== id));
  }

  // Same shape as moveStopToDay, over callsByDay instead of draftByDay: a
  // call has no drive position, so there is no "insert at the end in order"
  // question, it just lands in the target day's list.
  function moveCallToDay(id: string, day: string) {
    if (day === activeDay) return;
    if (!days.includes(day)) return;
    const entry = calls.find((c) => c.id === id);
    if (!entry) return;
    const targetList = callsByDay[day] ?? [];
    if (targetList.some((c) => c.id === id)) {
      commitCalls(activeDay, calls.filter((c) => c.id !== id));
      return;
    }
    const prev = callsByDay;
    const nextByDay = {
      ...callsByDay,
      [activeDay]: calls.filter((c) => c.id !== id),
      [day]: [...targetList, entry],
    };
    setCallsByDay(nextByDay);
    saveRouteCalls(nextByDay).catch(() => setCallsByDay(prev));
  }

  // Same optimistic-write shape again, over the done set (0042). A toggle
  // rather than separate mark/unmark actions -- Juan tapping the wrong stop by
  // mistake should cost one more tap to undo, not a different control to find.
  function commitDone(day: string, next: string[]) {
    const prev = doneByDay;
    const nextByDay = { ...doneByDay, [day]: next };
    setDoneByDay(nextByDay);
    saveRouteDone(nextByDay).catch(() => setDoneByDay(prev));
  }

  function toggleDone(id: string) {
    const next = done.has(id) ? [...done].filter((d) => d !== id) : [...done, id];
    commitDone(activeDay, next);
  }

  return (
    <Ctx.Provider
      value={{
        routeDraft,
        inRoute,
        days,
        activeDay,
        setActiveDay: (day: string) => {
          dayTouchedRef.current = true;
          setActiveDay(day);
        },
        hydrated,
        addToRoute,
        addCustomStop,
        removeFromRoute,
        moveInRoute,
        moveToTop,
        reorderRoute,
        moveStopToDay,
        clearRoute,
        calls,
        addCall,
        removeCall,
        moveCallToDay,
        done,
        toggleDone,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRoute(): RouteCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRoute must be used inside RouteProvider (see layout.tsx)");
  return ctx;
}
