/**
 * The dated field week, read live from nb_route_plans / nb_route_days /
 * nb_route_stops.
 *
 * NOT a generated array. See the note above getCurrentRoutePlan() in lib/dal.ts:
 * this repository is public, the stops are an employer's customers, and
 * nutribiotic/AGENTS.md HARD RULE 9 keeps customer names and phone numbers out
 * of git. Rendering from the database at request time means the screen and
 * nb_route_stops cannot drift apart either.
 *
 * Format follows the standing field-brief rule: a timeline you read at a light,
 * who you are selling to, the one thing to open with, and one big Apple Maps tap
 * target per stop.
 */

import type { PinnedWaypoint, RouteDayRow, RoutePlan, StopBrief } from "../lib/dal";
import { AccountLink } from "../lib/modal";
import { Card, Ico } from "../lib/ui";

const LA = "America/Los_Angeles";

// Portal 148711228 is EU-hosted, so the record host is app-eu1. Same URL
// shape as map/AccountsMap.tsx's HUBSPOT_COMPANY_URL; kept local here rather
// than shared because that file is a client component with no exports.
const HUBSPOT_COMPANY_URL = (hubspotId: string) =>
  `https://app-eu1.hubspot.com/contacts/148711228/record/0-2/${hubspotId}`;

function hhmm(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: LA,
  });
}

function dayLabel(date: string): string {
  // Parse as local noon so the date never slips a day across the zone boundary.
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short", month: "numeric", day: "numeric",
  });
}

function maps(address: string): string {
  return `https://maps.apple.com/?daddr=${address.replace(/ /g, "+")}`;
}

function miles(m: number | null): string {
  return m == null ? "" : `${(m / 1609.34).toFixed(1)}mi`;
}

function Chip({ children, tone = "quiet" }: { children: React.ReactNode; tone?: "quiet" | "band" | "lock" | "warn" }) {
  const tones = {
    quiet: "bg-[#F2F0E8] text-[#6B736D]",
    band: "bg-[#E4EDE6] text-[#2C6A46]",
    lock: "bg-[#E7E9F2] text-[#3C4680]",
    warn: "bg-[#F5E7DE] text-[#9C4A1C]",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

function DriveButton({ address }: { address: string }) {
  return (
    <a
      href={maps(address)}
      className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#2C6A46] px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
    >
      <Ico name="pin" size={13} />
      Drive
    </a>
  );
}

function Time({ eta, etd }: { eta: string | null; etd: string | null }) {
  return (
    <div className="w-[52px] shrink-0 pt-0.5 text-right">
      <div className="text-[13px] font-semibold tabular-nums leading-tight">{hhmm(eta)}</div>
      <div className="text-[11px] tabular-nums leading-tight text-[#A9AFA9]">{hhmm(etd)}</div>
    </div>
  );
}

function WaypointRow({ wp, seq }: { wp: PinnedWaypoint; seq: number }) {
  return (
    <li className="flex gap-3 bg-[#FAFAF7] px-5 py-3">
      <div className="w-[52px] shrink-0 pt-0.5 text-right text-[13px] font-semibold tabular-nums">
        {wp.locked_time}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium leading-snug">{seq}. {wp.name}</span>
          <Chip tone="lock">Pinned {wp.locked_time}</Chip>
        </div>
        <div className="mt-0.5 text-[12.5px] text-[#5B6560]">
          {wp.street}, {wp.city}
          <span className="text-[#A9AFA9]"> · open {wp.hours}</span>
        </div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-[#5B6560]">{wp.note}</div>
      </div>
      <DriveButton address={`${wp.street}, ${wp.city}, CA`} />
    </li>
  );
}

type MapPoint = { lat: number; lng: number; kind: "home" | "stop" | "waypoint" };

// Same muted palette as map/AccountsMap.tsx's MAP_STYLE, in Static Maps'
// pipe-separated string form (that one is typed against google.maps.MapTypeStyle,
// which needs the JS API loaded; this file is a server component and has no
// client script to load it with).
const STATIC_MAP_STYLE = [
  "element:labels.text.fill|color:0x8a928c",
  "element:labels.text.stroke|color:0xf7f6f1",
  "feature:administrative|element:geometry.stroke|color:0xd8d4c8",
  "feature:landscape|element:geometry|color:0xf3f1ea",
  "feature:poi|visibility:off",
  "feature:road|element:geometry|color:0xffffff",
  "feature:road|element:labels|visibility:off",
  "feature:road.arterial|element:geometry|color:0xede9dc",
  "feature:transit|visibility:off",
  "feature:water|element:geometry|color:0xdde4e0",
];

// One static-image request per day-card: real tiles, real roads, real
// proportions, no client JS bundle and none of AccountsMap.tsx's continuous
// tile/interaction billing. Google auto-fits the viewport to the markers, so
// there is no manual bbox math to keep in sync with it.
//
// The connecting line is still a straight geodesic between stops, not a
// routed path: the Google Routes API is not enabled on this project (see the
// same note in bridges/nutribiotic/plan_week.py), so there is no encoded
// polyline to draw. Real geography now makes that limitation obvious rather
// than hidden, which is the honest version of this image.
function staticMapSrc(points: MapPoint[]): string | null {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const byKind = { home: [] as MapPoint[], stop: [] as MapPoint[], waypoint: [] as MapPoint[] };
  for (const p of points) byKind[p.kind].push(p);

  const params = new URLSearchParams();
  params.set("size", "640x220");
  params.set("scale", "2");
  params.set("maptype", "roadmap");
  for (const rule of STATIC_MAP_STYLE) params.append("style", rule);

  const coords = (pts: MapPoint[]) => pts.map((p) => `${p.lat},${p.lng}`).join("|");
  params.append("path", `color:0x8a928c99|weight:2|geodesic:true|${coords(points)}`);

  const markerGroups: [string, "small" | "mid", MapPoint[]][] = [
    ["0x2C6A46", "small", byKind.stop],
    ["0x9C4A1C", "small", byKind.waypoint],
    ["0x3C4680", "mid", byKind.home],
  ];
  for (const [color, size, pts] of markerGroups) {
    if (pts.length) params.append("markers", `color:${color}|size:${size}|${coords(pts)}`);
  }

  // key last: keeps every other param stable if this ever gets logged mid-string.
  params.append("key", apiKey);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

// Fallback only: no tiles, no roads, just relative position and visit order,
// for when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn't set. Longitude is
// cosine-corrected by the day's mean latitude so LA's east-west stretch
// doesn't render diagonal.
function SchematicFallback({ points }: { points: MapPoint[] }) {
  const meanLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const cos = Math.cos((meanLat * Math.PI) / 180);
  const xy = points.map((p) => ({ x: p.lng * cos, y: -p.lat }));

  const W = 100, H = 40, pad = 6;
  const minX = Math.min(...xy.map((p) => p.x));
  const maxX = Math.max(...xy.map((p) => p.x));
  const minY = Math.min(...xy.map((p) => p.y));
  const maxY = Math.max(...xy.map((p) => p.y));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const sx = (x: number) => (x - minX) * scale + offX;
  const sy = (y: number) => (y - minY) * scale + offY;

  const path = xy.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[60px] w-full max-w-[360px]" preserveAspectRatio="xMidYMid meet">
      <path d={path} fill="none" stroke="#C7CFC8" strokeWidth={0.7} strokeDasharray="1.6 1.3" />
      {xy.map((p, i) => {
        const cx = sx(p.x);
        const cy = sy(p.y);
        const kind = points[i].kind;
        return kind === "home" ? (
          <rect key={i} x={cx - 1.5} y={cy - 1.5} width={3} height={3} fill="#3C4680" />
        ) : (
          <circle key={i} cx={cx} cy={cy} r={kind === "waypoint" ? 1.2 : 1.5}
            fill={kind === "waypoint" ? "#9C4A1C" : "#2C6A46"} />
        );
      })}
    </svg>
  );
}

function RouteMiniMap({ points }: { points: MapPoint[] }) {
  if (points.length < 2) return null;
  const src = staticMapSrc(points);

  return (
    <div className="border-b border-[#EEECE3] bg-[#FBFAF6] px-5 py-3">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Google-served image, not a build asset
        <img
          src={src}
          alt="Route map for the day"
          width={640}
          height={220}
          loading="lazy"
          className="h-[140px] w-full max-w-[480px] rounded-md border border-[#EEECE3] object-cover"
        />
      ) : (
        <SchematicFallback points={points} />
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-[#A9AFA9]">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 bg-[#3C4680]" />home</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2C6A46]" />stop</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#9C4A1C]" />pinned</span>
        {!src && <span>Schematic shape and order only, not a real map: no Maps key configured.</span>}
      </div>
    </div>
  );
}

function ProfileLinks({ accountId, hubspotId }: { accountId: string; hubspotId: string | null }) {
  return (
    <div className="mt-1 flex items-center gap-3 text-[12px]">
      <AccountLink
        id={accountId}
        className="font-medium text-[#3C4A42] underline-offset-2 hover:underline"
      >
        OS profile
      </AccountLink>
      {hubspotId ? (
        <a
          href={HUBSPOT_COMPANY_URL(hubspotId)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#8A928C] underline-offset-2 hover:text-[#3C4A42] hover:underline"
        >
          HubSpot
        </a>
      ) : (
        <span className="text-[#A9AFA9]">not linked in HubSpot</span>
      )}
    </div>
  );
}

function StopRow({
  stop, brief,
}: { stop: RouteDayRow["nb_route_stops"][number]; brief?: StopBrief }) {
  const a = stop.nb_accounts;
  if (!a) return null;
  const address = brief?.maps_address ?? `${a.street ?? ""}, ${a.city ?? ""}, CA`;
  const hours = brief?.hours ?? (stop.window_open ? `${stop.window_open.slice(0, 5)}-${(stop.window_close ?? "").slice(0, 5)}` : null);

  return (
    <li className="flex gap-3 px-5 py-3">
      <Time eta={stop.eta} etd={stop.etd} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <AccountLink id={a.id} className="text-[14px] font-medium leading-snug hover:underline">
            {stop.seq}. {a.name}
          </AccountLink>
          {/* "Band 1 · A" used to read as the same letter HubSpot shows on the
              company record, which is a different scale entirely. Says which one
              now. See TierChip in lib/ui.tsx for why both letters are correct. */}
          <Chip tone="band">
            Band {stop.priority_band}{brief?.tier ? ` · OS tier ${brief.tier}` : ""}
          </Chip>
          {a.places_status === "CLOSED_PERMANENTLY" && <Chip tone="warn">Call first</Chip>}
          {!hours && <Chip tone="warn">Hours unknown</Chip>}
        </div>

        <div className="mt-0.5 text-[12.5px] text-[#5B6560]">
          {a.street ? `${a.street}, ` : ""}{a.city}
          <span className="text-[#A9AFA9]">
            {" · "}{miles(stop.drive_meters)}
            {stop.drive_seconds ? ` / ${Math.round(stop.drive_seconds / 60)}min` : ""}
            {hours ? ` · open ${hours}` : ""}
            {brief?.corridors?.length ? ` · x${brief.traffic_multiplier} ${brief.corridors.join(", ")}` : ""}
          </span>
        </div>

        <ProfileLinks accountId={a.id} hubspotId={a.hubspot_company_id} />

        {/* No contact is rendered as NOTHING, not as an apology. The snapshot in
            nb_route_plans.config.field_brief was audited against live nb_contacts
            on 2026-08-02: every stop that shows no name here genuinely has no row,
            so the line said "I don't know" 31 times without adding a fact. Where a
            name IS worth chasing, the opener below says so in words tied to that
            account. A blank is still a finding; it is just not a paragraph. */}
        {brief?.contacts?.length ? (
          <div className="mt-1 text-[12.5px] leading-relaxed text-[#5B6560]">
            <span className="text-[#8A928C]">Selling to </span>
            {brief.contacts.join("; ")}
          </div>
        ) : null}

        {brief?.opener && (
          <div className="mt-1.5 flex gap-1.5 text-[12.5px] leading-relaxed text-[#3C4A42]">
            <span className="pt-0.5 text-[#2C6A46]"><Ico name="wand" size={13} /></span>
            <span>{brief.opener}</span>
          </div>
        )}

        {/* The "hours unknown" chip above already says the common case. Only the
            interesting reasons (a corrupt record, a wait for opening) repeat here. */}
        {brief?.hours_note && brief.hours_note !== "no business_hours on file" && (
          <div className="mt-1 text-[12px] text-[#9C4A1C]">{brief.hours_note}</div>
        )}
      </div>
      <DriveButton address={address} />
    </li>
  );
}

export function WeekPlan({ plan }: { plan: RoutePlan }) {
  const cfg = plan.config ?? {};
  const brief = cfg.field_brief ?? {};
  const notes = cfg.day_notes ?? {};

  return (
    <section className="mb-9">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
          This week
        </h2>
        <div className="flex items-center gap-2 text-[12px] text-[#8A928C]">
          <Chip>{plan.status}</Chip>
          <span>{plan.id}</span>
        </div>
      </div>

      <p className="mb-4 max-w-[76ch] text-[12.5px] leading-relaxed text-[#5B6560]">
        Starts and ends at {cfg.home_base?.address ?? "the home base"} every day, no overnights.
        {cfg.dwell_minutes ? ` ${cfg.dwell_minutes} minutes per stop.` : ""}
        {" "}Order is priority band first, proximity only inside a band. Times are an estimate from
        the traffic-corridor model, not a live Google ETA.
      </p>

      <div className="flex flex-col gap-5">
        {plan.days.map((d) => {
          const wps = d.directions_cache?.pinned_waypoints ?? [];
          const note = notes[d.date];
          const total = d.nb_route_stops.length + wps.length;

          // Waypoints are spliced in at the first stop whose ETA follows the
          // locked time, which is where the planner put them.
          const lock = wps[0]?.locked_time ?? null;
          const afterIdx = lock
            ? d.nb_route_stops.findIndex((s) => hhmm(s.eta) > lock)
            : -1;

          const rows: React.ReactNode[] = [];
          const points: MapPoint[] = [];
          const home = d.start_lat != null && d.start_lng != null
            ? { lat: d.start_lat, lng: d.start_lng, kind: "home" as const }
            : null;
          if (home) points.push(home);

          d.nb_route_stops.forEach((s, i) => {
            if (i === afterIdx) {
              wps.forEach((wp, k) => {
                rows.push(<WaypointRow key={`wp-${k}`} wp={wp} seq={i + k + 1} />);
                points.push({ lat: wp.lat, lng: wp.lng, kind: "waypoint" });
              });
            }
            rows.push(
              <StopRow key={s.seq} stop={s} brief={brief[s.nb_accounts?.id ?? ""]} />,
            );
            if (s.nb_accounts?.lat != null && s.nb_accounts?.lng != null) {
              points.push({ lat: s.nb_accounts.lat, lng: s.nb_accounts.lng, kind: "stop" });
            }
          });
          if (afterIdx === -1 && wps.length > 0) {
            wps.forEach((wp, k) => {
              rows.push(<WaypointRow key={`wp-tail-${k}`} wp={wp} seq={d.nb_route_stops.length + k + 1} />);
              points.push({ lat: wp.lat, lng: wp.lng, kind: "waypoint" });
            });
          }
          if (home) points.push(home);

          return (
            <Card key={d.id} className="p-0 overflow-hidden">
              <div className="border-b border-[#E2DFD5] bg-[#FBFAF6] px-5 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="font-[family-name:var(--font-fraunces)] text-[16.5px] font-semibold tracking-tight">
                    {note?.label ?? dayLabel(d.date)} · {d.cluster_id}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] tabular-nums text-[#8A928C]">
                    <Ico name="clock" size={12} />
                    {hhmm(d.depart_at)} to {hhmm(d.return_by)}
                    <span aria-hidden>·</span>
                    {total} stops
                  </div>
                </div>
                {note?.note && (
                  <div className="mt-1 max-w-[76ch] text-[12.5px] leading-relaxed text-[#5B6560]">
                    {note.note}
                  </div>
                )}
              </div>

              <RouteMiniMap points={points} />

              <ul className="divide-y divide-[#EEECE3]">{rows}</ul>

              {note && (
                <div className="border-t border-[#EEECE3] bg-[#FBFAF6] px-5 py-2.5 text-[12px] text-[#8A928C]">
                  Home: {note.return_drive_miles}mi / {note.return_drive_minutes}min
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {(cfg.not_routed?.length || cfg.data_flags?.length) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {cfg.not_routed?.length ? (
            <div className="rounded-lg border border-[#E2DFD5] bg-white p-4">
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
                Not routed, and why
              </h3>
              <ul className="flex flex-col gap-2">
                {cfg.not_routed.map((u) => (
                  <li key={u.name} className="text-[12.5px] leading-relaxed text-[#5B6560]">
                    <span className="font-medium text-[#14201B]">{u.name}</span>
                    <span className="text-[#A9AFA9]"> · {u.was}</span>
                    <div>{u.why}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {cfg.data_flags?.length ? (
            <div className="rounded-lg border border-[#E2DFD5] bg-white p-4">
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
                Routed, but flagged
              </h3>
              <ul className="flex flex-col gap-2">
                {cfg.data_flags.map((f) => (
                  <li key={f.name} className="text-[12.5px] leading-relaxed text-[#5B6560]">
                    <span className="font-medium text-[#14201B]">{f.name}</span>
                    <span className="text-[#A9AFA9]"> · {f.day}</span>
                    <div>{f.flag}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
