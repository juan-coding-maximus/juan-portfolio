"use server";

import { headers } from "next/headers";
import { searchPlaces } from "../nutribiotic/lib/places";
import { RATE_CHEAPEST, RATE_QUICKEST, RESERVE_MILES, TANK_GALLONS } from "./lib/constants";
import { carWashNearby, type WashStation } from "./lib/carwash";
import { fuelNearby } from "./lib/fuel";
import { detourMinutes, milesFromOrigin, route, sampleAlong, type LatLng } from "./lib/osrm";
import { scoreStations, type Scored, type Station } from "./lib/score";
import { scoreCarWashes, type WashScored } from "./lib/washscore";

export type Dest = { lat: number; lng: number; address: string; label: string };
type DestInput = Dest | { query: string };

export type FindInput = {
  origin: LatLng;
  dest: DestInput;
  gallons: number;
  quickest: boolean;
  /** Typed straight off the dashboard, not inferred from the tank gauge. */
  milesToEmpty?: number | null;
};

export type CarWashInput = {
  origin: LatLng;
  dest: DestInput;
};

export type FindResult =
  | { ok: true; dest: Dest; directMinutes: number; considered: number; gallons: number; best: Scored[] }
  | { ok: false; error: string };

export type CarWashResult =
  | { ok: true; dest: Dest; directMinutes: number; considered: number; best: WashScored[] }
  | { ok: false; error: string };

/* Every search, gas or car wash, is a handful of paid Places calls on a
   public URL. One shared per-IP budget across both products keeps a stray
   crawler from running up the bill. */
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

async function currentIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/* Circles overlap along the road: at nine samples a 40-mile drive gets a
   search every ~4.5 miles with a 3-mile radius. Each sample is one paid
   Places call, so this is the whole per-search cost, for either product. */
const MAX_SAMPLES = 9;
const MAX_RESULTS = 60;

async function resolveDest(input: DestInput, origin: LatLng): Promise<Dest | { error: string }> {
  if (!("query" in input)) return input;
  const q = input.query.trim();
  if (!q) return { error: "Type where you're going." };
  let found;
  try {
    found = (await searchPlaces(q, 1, origin))[0];
  } catch {
    return { error: "Couldn't look up that place. Try again." };
  }
  if (!found || found.lat == null || found.lng == null) return { error: `Couldn't find "${q}". Try an address or a city.` };
  return { lat: found.lat, lng: found.lng, address: found.formattedAddress ?? found.name, label: found.name || q };
}

async function planRoute(origin: LatLng, dest: LatLng) {
  const shape = await route(origin, dest);
  if (!shape) return null;
  const totalMeters = shape.miles * 1609.344;
  const samples = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(totalMeters / 6000) + 1));
  const centers = sampleAlong(shape.coords, samples);
  const step = totalMeters / Math.max(1, samples - 1);
  const radius = Math.min(6000, Math.max(2500, step * 0.7));
  return { shape, centers, radius };
}

export async function findGas(input: FindInput): Promise<FindResult> {
  const ip = await currentIp();
  if (overBudget(ip)) return { ok: false, error: "Too many searches in a row. Try again in a few minutes." };

  const gallons = Math.min(TANK_GALLONS, Math.max(0.5, Number(input.gallons) || 0));
  const origin = input.origin;
  if (!Number.isFinite(origin?.lat) || !Number.isFinite(origin?.lng)) return { ok: false, error: "No location yet." };

  const dest = await resolveDest(input.dest, origin);
  if ("error" in dest) return { ok: false, error: dest.error };

  const plan = await planRoute(origin, dest);
  if (!plan) return { ok: false, error: "Couldn't get a road route right now. Try again." };
  const { shape, centers, radius } = plan;

  const batches = await Promise.allSettled(centers.map((c) => fuelNearby(c, radius)));
  const seen = new Map<string, Station>();
  let anyOk = false;
  for (const b of batches) {
    if (b.status !== "fulfilled") continue;
    anyOk = true;
    for (const s of b.value) if (!seen.has(s.id)) seen.set(s.id, s);
  }
  if (!anyOk) return { ok: false, error: "Couldn't read gas prices right now. Try again." };
  let stations = [...seen.values()].sort((a, b) => a.regular - b.regular).slice(0, MAX_RESULTS);
  if (stations.length === 0) return { ok: false, error: "No stations with a posted price along this drive." };

  const milesToEmpty = Number(input.milesToEmpty);
  if (Number.isFinite(milesToEmpty) && milesToEmpty > 0) {
    const reach = milesToEmpty - RESERVE_MILES;
    if (reach <= 0) return { ok: false, error: `${milesToEmpty} miles to empty leaves no room past the ${RESERVE_MILES}-mile reserve.` };
    const originMiles = await milesFromOrigin(origin, stations);
    if (!originMiles) return { ok: false, error: "Couldn't check which stations are in reach right now. Try again." };
    stations = stations.filter((_, i) => originMiles[i] <= reach);
    if (stations.length === 0) {
      return { ok: false, error: `No priced station within ${Math.round(reach)} miles, the range ${milesToEmpty} miles to empty leaves after a ${RESERVE_MILES}-mile reserve.` };
    }
  }

  const detours = await detourMinutes(origin, dest, stations);
  if (!detours) return { ok: false, error: "Couldn't time the detours right now. Try again." };

  const rate = input.quickest ? RATE_QUICKEST : RATE_CHEAPEST;
  const scored = scoreStations(stations, detours, gallons, rate);
  return { ok: true, dest, directMinutes: shape.minutes, considered: scored.length, gallons, best: scored.slice(0, 3) };
}

export async function findCarWash(input: CarWashInput): Promise<CarWashResult> {
  const ip = await currentIp();
  if (overBudget(ip)) return { ok: false, error: "Too many searches in a row. Try again in a few minutes." };

  const origin = input.origin;
  if (!Number.isFinite(origin?.lat) || !Number.isFinite(origin?.lng)) return { ok: false, error: "No location yet." };

  const dest = await resolveDest(input.dest, origin);
  if ("error" in dest) return { ok: false, error: dest.error };

  const plan = await planRoute(origin, dest);
  if (!plan) return { ok: false, error: "Couldn't get a road route right now. Try again." };
  const { shape, centers, radius } = plan;

  const batches = await Promise.allSettled(centers.map((c) => carWashNearby(c, radius)));
  const seen = new Map<string, WashStation>();
  let anyOk = false;
  for (const b of batches) {
    if (b.status !== "fulfilled") continue;
    anyOk = true;
    for (const s of b.value) if (!seen.has(s.id)) seen.set(s.id, s);
  }
  if (!anyOk) return { ok: false, error: "Couldn't read car washes right now. Try again." };
  const stations = [...seen.values()].slice(0, MAX_RESULTS);
  if (stations.length === 0) return { ok: false, error: "No car washes found along this drive." };

  const detours = await detourMinutes(origin, dest, stations);
  if (!detours) return { ok: false, error: "Couldn't time the detours right now. Try again." };

  const scored = scoreCarWashes(stations, detours);
  return { ok: true, dest, directMinutes: shape.minutes, considered: scored.length, best: scored.slice(0, 3) };
}
