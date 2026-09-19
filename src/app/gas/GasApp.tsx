"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { findCarWash, findGas, type CarWashResult, type FindResult } from "./actions";
import { DISCOUNT_PER_GAL, FAVORITES, GALLON_STEP, TANK_GALLONS } from "./lib/constants";
import type { Scored } from "./lib/score";
import { priceLevelLabel } from "./lib/washscore";
import type { WashScored } from "./lib/washscore";

type LatLng = { lat: number; lng: number };
type LocState = "asking" | "ok" | "denied";
type Product = "gas" | "carwash";

const PREFS_KEY = "gas-stop-v1";
type Prefs = { now: number; fillTo: number; favId: string | null; quickest: boolean; product: Product };
const DEFAULT_PREFS: Prefs = { now: 4, fillTo: TANK_GALLONS, favId: "home", quickest: false, product: "gas" };

type Result = ({ product: "gas" } & FindResult) | ({ product: "carwash" } & CarWashResult);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap = (v: number) => Math.round(v / GALLON_STEP) * GALLON_STEP;
const gal = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const usd = (v: number) => `$${v.toFixed(2)}`;

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function appleMapsTwoStops(stop: { name: string; address: string }, destAddress: string): string {
  const s = encodeURIComponent(`${stop.name}, ${stop.address}`);
  const end = encodeURIComponent(destAddress);
  return `https://maps.apple.com/?saddr=Current%20Location&daddr=${s}+to:${end}&dirflg=d`;
}

/* upside.com publishes /mobile/app/* as a universal link for its iOS app
   (apple-app-site-association, checked 2026-09-14), so this opens the
   installed app rather than the website. Upside has no public API or
   per-station link, so the offer and its price are checked in the app. */
const UPSIDE_URL = "https://www.upside.com/mobile/app/gas";

/** GasBuddy's station search, the one public source that labels cash and
 *  credit separately, for checking the card price before driving. */
function gasBuddyUrl(s: Scored): string {
  return `https://www.gasbuddy.com/home?search=${encodeURIComponent(s.address)}&fuel=1`;
}

export default function GasApp() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [query, setQuery] = useState("");
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [locState, setLocState] = useState<LocState>("asking");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      // Read after mount so the server-rendered gauge and the hydrated one match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) });
    } catch {}
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocState("denied");
      return;
    }
    setLocState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocState("ok");
      },
      () => setLocState("denied"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, []);
  useEffect(() => {
    // The location prompt is the first thing this screen does.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    locate();
  }, [locate]);

  const product = prefs.product;
  const gallons = Math.max(0, snap(prefs.fillTo - prefs.now));
  const fav = FAVORITES.find((f) => f.id === prefs.favId) ?? null;

  const find = () => {
    setFormError(null);
    if (!loc) {
      locate();
      setFormError("Allow location first.");
      return;
    }
    if (product === "gas" && gallons < GALLON_STEP) {
      setFormError("Raise the fill-to handle above what's in the tank.");
      return;
    }
    if (!fav && !query.trim()) {
      setFormError("Pick a place or type an address.");
      return;
    }
    const dest = fav ? { lat: fav.lat, lng: fav.lng, address: fav.address, label: fav.label } : { query };
    startTransition(async () => {
      if (product === "gas") {
        const r = await findGas({ origin: loc, dest, gallons, quickest: prefs.quickest });
        setResult({ product: "gas", ...r });
      } else {
        const r = await findCarWash({ origin: loc, dest });
        setResult({ product: "carwash", ...r });
      }
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  };

  return (
    <main className="mx-auto max-w-[440px] px-5 pb-16 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-fraunces)] text-[30px] font-semibold leading-none tracking-tight">
          {product === "gas" ? "Gas" : "Car Wash"}
        </h1>
        <LocationPill state={locState} onRetry={locate} />
      </header>

      <section className="mt-4 grid grid-cols-2 rounded-xl border border-[#E2DFD5] bg-white p-1">
        <Segment active={product === "gas"} onClick={() => update({ product: "gas" })}>
          <span className="flex items-center justify-center gap-1.5">
            <GasIcon /> Gas
          </span>
        </Segment>
        <Segment active={product === "carwash"} onClick={() => update({ product: "carwash" })}>
          <span className="flex items-center justify-center gap-1.5">
            <WashIcon /> Car Wash
          </span>
        </Segment>
      </section>

      {product === "gas" && (
        <section className="mt-5 rounded-2xl border border-[#E2DFD5] bg-white p-5">
          <div className="flex gap-5">
            <Gauge now={prefs.now} fillTo={prefs.fillTo} onChange={(now, fillTo) => update({ now, fillTo })} />
            <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
              <div>
                <div className="font-[family-name:var(--font-fraunces)] text-[56px] font-semibold leading-none tracking-tight">{gal(gallons)}</div>
                <div className="mt-1 text-[15px] text-[#5B6560]">gallons to buy</div>
              </div>
              <div className="mt-4 space-y-1.5 text-[14px] text-[#3D4A44]">
                <div>Now {gal(prefs.now)} gal</div>
                <div>Fill to {gal(prefs.fillTo)} gal</div>
              </div>
              <div className="mt-4 flex gap-2">
                <Chip
                  active={prefs.fillTo === TANK_GALLONS / 2}
                  onClick={() => update({ fillTo: TANK_GALLONS / 2, now: Math.min(prefs.now, TANK_GALLONS / 2 - GALLON_STEP) })}
                >
                  Half
                </Chip>
                <Chip active={prefs.fillTo === TANK_GALLONS} onClick={() => update({ fillTo: TANK_GALLONS })}>
                  Full
                </Chip>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-5">
        <div className="text-[14px] font-medium">Going to</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {FAVORITES.map((f) => (
            <Chip
              key={f.id}
              active={prefs.favId === f.id}
              onClick={() => {
                update({ favId: f.id });
                setQuery("");
              }}
            >
              {f.label}
            </Chip>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value && prefs.favId) update({ favId: null });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") find();
          }}
          placeholder="Address or area"
          autoComplete="off"
          enterKeyHint="search"
          className="mt-3 h-12 w-full rounded-xl border border-[#E2DFD5] bg-white px-4 text-[16px] outline-none placeholder:text-[#8A928C] focus-visible:border-[#2C6A46] focus-visible:ring-2 focus-visible:ring-[#2C6A46]/25"
        />
      </section>

      {product === "gas" && (
        <section className="mt-5 grid grid-cols-2 rounded-xl border border-[#E2DFD5] bg-white p-1">
          <Segment active={!prefs.quickest} onClick={() => update({ quickest: false })}>
            Cheapest
          </Segment>
          <Segment active={prefs.quickest} onClick={() => update({ quickest: true })}>
            Quickest
          </Segment>
        </section>
      )}

      <button
        type="button"
        onClick={find}
        disabled={pending}
        className="mt-5 h-14 w-full rounded-xl bg-[#2C6A46] text-[17px] font-medium text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6A46] focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending ? (product === "gas" ? "Checking prices" : "Checking car washes") : product === "gas" ? "Find gas" : "Find car wash"}
      </button>
      {formError && <p className="mt-3 text-[14px] text-[#8A6D2F]">{formError}</p>}

      {result && !pending && result.product === "gas" && (
        <section ref={resultsRef} className="mt-8 scroll-mt-4">
          {result.ok ? (
            <>
              <h2 className="font-[family-name:var(--font-fraunces)] text-[24px] font-semibold leading-tight tracking-tight">To {result.dest.label}</h2>
              <div className="mt-1 text-[14px] text-[#5B6560]">
                {Math.round(result.directMinutes)} min straight there · {result.considered} stations priced
              </div>
              <ol className="mt-4 space-y-3">
                {result.best.map((s, i) => (
                  <StationCard key={s.id} s={s} rank={i + 1} gallons={result.gallons} destAddress={result.dest.address} />
                ))}
              </ol>
            </>
          ) : (
            <p className="text-[15px] text-[#8A6D2F]">{result.error}</p>
          )}
        </section>
      )}

      {result && !pending && result.product === "carwash" && (
        <section ref={resultsRef} className="mt-8 scroll-mt-4">
          {result.ok ? (
            result.best.length > 0 ? (
              <>
                <h2 className="font-[family-name:var(--font-fraunces)] text-[24px] font-semibold leading-tight tracking-tight">To {result.dest.label}</h2>
                <div className="mt-1 text-[14px] text-[#5B6560]">
                  {Math.round(result.directMinutes)} min straight there · {result.considered} car washes found
                </div>
                <ol className="mt-4 space-y-3">
                  {result.best.map((s, i) => (
                    <WashCard key={s.id} s={s} rank={i + 1} destAddress={result.dest.address} />
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-[15px] text-[#8A6D2F]">No car washes found along this drive.</p>
            )
          ) : (
            <p className="text-[15px] text-[#8A6D2F]">{result.error}</p>
          )}
        </section>
      )}
    </main>
  );
}

function StationCard({ s, rank, gallons, destAddress }: { s: Scored; rank: number; gallons: number; destAddress: string }) {
  const best = rank === 1;
  const minutes = Math.round(s.detourMinutes);
  return (
    <li className={`rounded-2xl border bg-white p-4 ${best ? "border-[#2C6A46] shadow-[0_0_0_1px_#2C6A46]" : "border-[#E2DFD5]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold">{s.name}</div>
          <div className="truncate text-[13px] text-[#5B6560]">{s.address}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-semibold">{minutes <= 0 ? "on the way" : `+${minutes} min`}</div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <span className="font-[family-name:var(--font-fraunces)] text-[40px] font-semibold leading-none tracking-tight">{usd(s.afterDiscount)}</span>
          <span className="ml-2 text-[13px] text-[#5B6560]">after {Math.round(DISCOUNT_PER_GAL * 100)}¢ off {usd(s.regular)}</span>
        </div>
      </div>
      <div className="mt-2 text-[14px] text-[#3D4A44]">
        ${Math.round(s.afterDiscount * gallons)} for {gal(gallons)} gal
        {s.updatedAt && <span className="text-[#8A928C]"> · price {ago(s.updatedAt)}</span>}
        <span className="text-[#8A928C]"> · </span>
        <a href={gasBuddyUrl(s)} target="_blank" rel="noopener" className="text-[#2C6A46] underline-offset-2 hover:underline">
          GasBuddy
        </a>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={UPSIDE_URL}
          target="_blank"
          rel="noopener"
          className="flex h-11 items-center justify-center rounded-xl border border-[#E2DFD5] text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6A46]"
        >
          Upside
        </a>
        <a
          href={appleMapsTwoStops(s, destAddress)}
          className="flex h-11 items-center justify-center rounded-xl bg-[#14201B] text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6A46] focus-visible:ring-offset-2"
        >
          Apple Maps
        </a>
      </div>
    </li>
  );
}

function WashCard({ s, rank, destAddress }: { s: WashScored; rank: number; destAddress: string }) {
  const best = rank === 1;
  const minutes = Math.round(s.detourMinutes);
  const price = priceLevelLabel(s.priceLevel);
  return (
    <li className={`rounded-2xl border bg-white p-4 ${best ? "border-[#2C6A46] shadow-[0_0_0_1px_#2C6A46]" : "border-[#E2DFD5]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold">{s.name}</div>
          <div className="truncate text-[13px] text-[#5B6560]">{s.address}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-semibold">{minutes <= 0 ? "on the way" : `+${minutes} min`}</div>
        </div>
      </div>
      {(price || s.driveThrough || s.freeVacuums) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {price && <Badge>{price}</Badge>}
          {s.driveThrough && <Badge>Drive-through</Badge>}
          {s.freeVacuums && <Badge>Free vacuums</Badge>}
        </div>
      )}
      <div className="mt-4">
        <a
          href={appleMapsTwoStops(s, destAddress)}
          className="flex h-11 items-center justify-center rounded-xl bg-[#14201B] text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6A46] focus-visible:ring-offset-2"
        >
          Apple Maps
        </a>
      </div>
    </li>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[#ECEAE1] px-2.5 py-1 text-[12px] font-medium text-[#3D4A44]">{children}</span>;
}

function LocationPill({ state, onRetry }: { state: LocState; onRetry: () => void }) {
  if (state === "ok")
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-[#5B6560]">
        <span className="h-2 w-2 rounded-full bg-[#2C6A46]" />
        Located
      </span>
    );
  if (state === "asking")
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-[#8A928C]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#8A928C]" />
        Locating
      </span>
    );
  return (
    <button
      type="button"
      onClick={onRetry}
      className="h-9 rounded-full bg-[#14201B] px-4 text-[13px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6A46] focus-visible:ring-offset-2"
    >
      Allow location
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 rounded-full border px-4 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6A46] ${
        active ? "border-[#14201B] bg-[#14201B] text-white" : "border-[#E2DFD5] bg-white text-[#14201B]"
      }`}
    >
      {children}
    </button>
  );
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 rounded-lg text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6A46] ${
        active ? "bg-[#14201B] text-white" : "text-[#5B6560]"
      }`}
    >
      {children}
    </button>
  );
}

function GasIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 22V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M3 10h8" />
      <path d="M13 8V5a1 1 0 0 1 1-1h1" />
      <path d="M16 8h1a2 2 0 0 1 2 2v3.5a1.5 1.5 0 0 0 3 0V9a2 2 0 0 0-.59-1.41L19 6" />
    </svg>
  );
}

function WashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 17h14l-1.4-6.3a2 2 0 0 0-2-1.7H8.4a2 2 0 0 0-2 1.7L5 17Z" />
      <path d="M7 17v2" />
      <path d="M17 17v2" />
      <path d="M9 5c0 1.5-1.5 1.8-1.5 3.3" />
      <path d="M13 5c0 1.5-1.5 1.8-1.5 3.3" />
      <path d="M17 5c0 1.5-1.5 1.8-1.5 3.3" />
    </svg>
  );
}

/**
 * The tank, drawn as a tank. The lower handle is what's in it now, the upper
 * handle is where the fill stops, and the green between them is the fuel
 * about to be bought, which is the only number the ranking cares about.
 */
function Gauge({ now, fillTo, onChange }: { now: number; fillTo: number; onChange: (now: number, fillTo: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<"now" | "fill" | null>(null);

  const valueAt = (clientY: number) => {
    const r = track.current!.getBoundingClientRect();
    const frac = 1 - (clientY - r.top) / r.height;
    return snap(clamp(frac, 0, 1) * TANK_GALLONS);
  };
  const apply = (which: "now" | "fill", v: number) => {
    if (which === "now") onChange(clamp(v, 0, fillTo - GALLON_STEP), fillTo);
    else onChange(now, clamp(v, now + GALLON_STEP, TANK_GALLONS));
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = valueAt(e.clientY);
    const which = Math.abs(v - now) <= Math.abs(v - fillTo) ? "now" : "fill";
    drag.current = which;
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(which, v);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const which = drag.current;
    if (which) apply(which, valueAt(e.clientY));
  };
  const onUp = () => {
    drag.current = null;
  };
  const key = (which: "now" | "fill") => (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? GALLON_STEP : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -GALLON_STEP : 0;
    if (!d) return;
    e.preventDefault();
    apply(which, (which === "now" ? now : fillTo) + d);
  };

  const pct = (v: number) => `${(v / TANK_GALLONS) * 100}%`;
  return (
    <div className="flex select-none gap-2">
      <div className="flex h-[280px] flex-col justify-between py-[3px] text-right text-[11px] leading-none text-[#8A928C]">
        <span>Full</span>
        <span>¾</span>
        <span>½</span>
        <span>¼</span>
        <span>0</span>
      </div>
      <div
        ref={track}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative h-[280px] w-[64px] cursor-pointer touch-none rounded-[18px] border border-[#E2DFD5] bg-[#ECEAE1]"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <span key={f} className="absolute left-0 right-0 h-px bg-white" style={{ bottom: `${f * 100}%` }} />
        ))}
        <div className="absolute inset-x-0 bottom-0 rounded-b-[17px] bg-[#C9CFCB]" style={{ height: pct(now) }} />
        <div className="absolute inset-x-0 bg-[#2C6A46]" style={{ bottom: pct(now), height: pct(fillTo - now), borderRadius: fillTo === TANK_GALLONS ? "17px 17px 0 0" : 0 }} />
        <Thumb value={now} label={`Now, ${gal(now)} gallons`} bottom={pct(now)} onKeyDown={key("now")} />
        <Thumb value={fillTo} label={`Fill to, ${gal(fillTo)} gallons`} bottom={pct(fillTo)} onKeyDown={key("fill")} />
      </div>
    </div>
  );
}

function Thumb({ value, label, bottom, onKeyDown }: { value: number; label: string; bottom: string; onKeyDown: (e: React.KeyboardEvent) => void }) {
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={TANK_GALLONS}
      aria-valuenow={value}
      onKeyDown={onKeyDown}
      className="absolute left-1/2 h-8 w-[76px] -translate-x-1/2 translate-y-1/2 rounded-full border border-[#E2DFD5] bg-white shadow-[0_1px_4px_rgba(20,32,27,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6A46]"
      style={{ bottom }}
    >
      <span className="absolute left-1/2 top-1/2 h-1 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C9CFCB]" />
    </div>
  );
}
