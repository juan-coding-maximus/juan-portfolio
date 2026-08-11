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
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CustomStop, RouteDraftEntry } from "./dal";
import { saveRouteDraft } from "./prefs-actions";

type RouteCtx = {
  routeDraft: RouteDraftEntry[];
  inRoute: Set<string>;
  addToRoute: (id: string) => void;
  addCustomStop: (stop: Omit<CustomStop, "id">) => void;
  removeFromRoute: (id: string) => void;
  moveInRoute: (id: string, dir: -1 | 1) => void;
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
  initial: RouteDraftEntry[];
  children: ReactNode;
}) {
  const [routeDraft, setRouteDraft] = useState<RouteDraftEntry[]>(initial);

  // Optimistic, same as every other prefs write on this OS: the list moves
  // now and the row catches up, reverted if the write fails.
  function commit(next: RouteDraftEntry[]) {
    const prev = routeDraft;
    setRouteDraft(next);
    saveRouteDraft(next).catch(() => setRouteDraft(prev));
  }

  const inRoute = useMemo(() => new Set(routeDraft.map(entryId)), [routeDraft]);

  function addToRoute(id: string) {
    if (inRoute.has(id)) return; // adding twice is a mis-tap, not a second visit
    commit([...routeDraft, id]);
  }

  function addCustomStop(stop: Omit<CustomStop, "id">) {
    const id = `custom:${stop.kind}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    commit([...routeDraft, { ...stop, id }]);
  }

  function removeFromRoute(id: string) {
    commit(routeDraft.filter((e) => entryId(e) !== id));
  }

  function moveInRoute(id: string, dir: -1 | 1) {
    const i = routeDraft.findIndex((e) => entryId(e) === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= routeDraft.length) return;
    const next = [...routeDraft];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }

  function clearRoute() {
    commit([]);
  }

  return (
    <Ctx.Provider
      value={{ routeDraft, inRoute, addToRoute, addCustomStop, removeFromRoute, moveInRoute, clearRoute }}
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
