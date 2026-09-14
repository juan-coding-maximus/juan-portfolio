"use server";

import { headers } from "next/headers";
import { searchPlaces } from "../nutribiotic/lib/places";
import { RATE_CHEAPEST, RATE_QUICKEST, TANK_GALLONS } from "./lib/constants";
import { fuelNearby } from "./lib/fuel";
import { detourMinutes, route, sampleAlong, type LatLng } from "./lib/osrm";
import { scoreStations, type Scored, type Station } from "./lib/score";

export type FindInput = {
  origin: LatLng;
  dest: { lat: number; lng: number; address: string; label: string } | { query: string };
  gallons: number;
  quickest: boolean;
};

export type FindResult =
  | {
      ok: true;
      dest: { lat: number; lng: number; address: string; label: string };
      directMinutes: number;
      considered: number;
      gallons: number;
      best: Scored[];
    }
  | { ok: false; error: string };

/* Every query is a handful of paid Places calls on a public URL. A small
   per-address budget keeps a stray crawler from running up the bill. */
const WINDOW_MS = 10 * 60 * 1000;
const BUDGET = 30;
const hits = new Map<string, number[]>();
function overBudget(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > BUDGET;
}

/* Circles overlap along the road: at nine samples a 40-mile drive gets a
   station search every ~4.5 miles with a 3-mile radius. Each sample is one
   paid Places call, so this is the whole per-search cost. */
const MAX_SAMPLES = 9;
const MAX_STATIONS = 60;

export async function findGas(input: FindInput): Promise<FindResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (overBudget(ip)) return { ok: false, error: "Too many searches in a row. Try again in a few minutes." };

  const gallons = Math.min(TANK_GALLONS, Math.max(0.5, Number(input.gallons) || 0));
  const origin = input.origin;
  if (!Number.isFinite(origin?.lat) || !Number.isFinite(origin?.lng)) return { ok: false, error: "No location yet." };

  let dest: { lat: number; lng: number; address: string; label: string };
  if ("query" in input.dest) {
    const q = input.dest.query.trim();
    if (!q) return { ok: false, error: "Type where you're going." };
    let found;
    try {
      found = (await searchPlaces(q, 1, origin))[0];
    } catch {
      return { ok: false, error: "Couldn't look up that place. Try again." };
    }
    if (!found || found.lat == null || found.lng == null) return { ok: false, error: `Couldn't find "${q}". Try an address or a city.` };
    dest = { lat: found.lat, lng: found.lng, address: found.formattedAddress ?? found.name, label: found.name || q };
  } else {
    dest = input.dest;
  }

  const shape = await route(origin, dest);
  if (!shape) return { ok: false, error: "Couldn't get a road route right now. Try again." };

  const totalMeters = shape.miles * 1609.344;
  const samples = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(totalMeters / 6000) + 1));
  const centers = sampleAlong(shape.coords, samples);
  const step = totalMeters / Math.max(1, samples - 1);
  const radius = Math.min(6000, Math.max(2500, step * 0.7));

  const batches = await Promise.allSettled(centers.map((c) => fuelNearby(c, radius)));
  const seen = new Map<string, Station>();
  let anyOk = false;
  for (const b of batches) {
    if (b.status !== "fulfilled") continue;
    anyOk = true;
    for (const s of b.value) if (!seen.has(s.id)) seen.set(s.id, s);
  }
  if (!anyOk) return { ok: false, error: "Couldn't read gas prices right now. Try again." };
  const stations = [...seen.values()].sort((a, b) => a.regular - b.regular).slice(0, MAX_STATIONS);
  if (stations.length === 0) return { ok: false, error: "No stations with a posted price along this drive." };

  const detours = await detourMinutes(origin, dest, stations);
  if (!detours) return { ok: false, error: "Couldn't time the detours right now. Try again." };

  const rate = input.quickest ? RATE_QUICKEST : RATE_CHEAPEST;
  const scored = scoreStations(stations, detours, gallons, rate);
  return {
    ok: true,
    dest,
    directMinutes: shape.minutes,
    considered: scored.length,
    gallons,
    best: scored.slice(0, 3),
  };
}
