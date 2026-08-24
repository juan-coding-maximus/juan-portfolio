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
 * DAY-PARTITIONED since 2026-08-23 (Juan's ask: plan the whole field week, one
 * toggle to switch which day he's editing, a way to push a stop to the next
 * one). `routeDraft` below is a VIEW onto the active day's slice of
 * `draftByDay`, kept for every existing caller that only ever knew one route.
 * `addToRoute` and `addCustomStop` take an optional insert index -- MapScreen
 * computes the cheapest gap (route-optimize.ts) when it has coordinates to
 * work with and passes it in; a caller with no coordinates in hand (the
 * account profile page) omits it and gets the old behaviour, appended last.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CustomStop, RouteDraftByDay, RouteDraftEntry } from "./dal";
import { defaultActiveDay, fieldWeekDates } from "./field-week";
import { saveRouteDraft } from "./prefs-actions";

type RouteCtx = {
  routeDraft: RouteDraftEntry[];
  inRoute: Set<string>;
  days: string[];
  activeDay: string;
  setActiveDay: (day: string) => void;
  addToRoute: (id: string, atIndex?: number) => void;
  addCustomStop: (stop: Omit<CustomStop, "id">, atIndex?: number) => void;
  removeFromRoute: (id: string) => void;
  moveInRoute: (id: string, dir: -1 | 1) => void;
  moveToTop: (id: string) => void;
  reorderRoute: (idsInOrder: string[]) => void;
  postponeToNextDay: (id: string) => void;
  clearRoute: () => void;
};

const Ctx = createContext<RouteCtx | null>(null);

function entryId(e: RouteDraftEntry): string {
  return typeof e === "string" ? e : e.id;
}

export function RouteProvider({
  initial,
  children,
}: {
  initial: RouteDraftByDay;
  children: ReactNode;
}) {
  const days = useMemo(() => fieldWeekDates(), []);
  const [draftByDay, setDraftByDay] = useState<RouteDraftByDay>(initial);
  const [activeDay, setActiveDay] = useState<string>(() => defaultActiveDay(initial, days));

  const routeDraft = useMemo(() => draftByDay[activeDay] ?? [], [draftByDay, activeDay]);

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

  // Push one stop to the next field-day tab, dropped onto the end of that
  // day's list (2026-08-23). A no-op past the last tab -- there is nowhere on
  // this screen to show it landing, so the button that calls this is disabled
  // there rather than silently wrapping to a day nobody's looking at.
  function postponeToNextDay(id: string) {
    const dayIdx = days.indexOf(activeDay);
    if (dayIdx < 0 || dayIdx >= days.length - 1) return;
    const entry = routeDraft.find((e) => entryId(e) === id);
    if (!entry) return;
    const nextDay = days[dayIdx + 1];
    const nextDayList = draftByDay[nextDay] ?? [];
    if (nextDayList.some((e) => entryId(e) === id)) {
      // already on tomorrow's list too -- just drop it from today's
      commitDay(activeDay, routeDraft.filter((e) => entryId(e) !== id));
      return;
    }
    const prev = draftByDay;
    const nextByDay = {
      ...draftByDay,
      [activeDay]: routeDraft.filter((e) => entryId(e) !== id),
      [nextDay]: [...nextDayList, entry],
    };
    setDraftByDay(nextByDay);
    saveRouteDraft(nextByDay).catch(() => setDraftByDay(prev));
  }

  function clearRoute() {
    commitDay(activeDay, []);
  }

  return (
    <Ctx.Provider
      value={{
        routeDraft,
        inRoute,
        days,
        activeDay,
        setActiveDay,
        addToRoute,
        addCustomStop,
        removeFromRoute,
        moveInRoute,
        moveToTop,
        reorderRoute,
        postponeToNextDay,
        clearRoute,
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
