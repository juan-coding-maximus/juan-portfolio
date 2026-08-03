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
          <Chip tone="band">Band {stop.priority_band}{brief?.tier ? ` · ${brief.tier}` : ""}</Chip>
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

        {brief?.contacts?.length ? (
          <div className="mt-1 text-[12.5px] leading-relaxed text-[#5B6560]">
            <span className="text-[#8A928C]">Selling to </span>
            {brief.contacts.join("; ")}
          </div>
        ) : (
          <div className="mt-1 text-[12.5px] text-[#A0762C]">
            No contact on file. Get a name before you leave.
          </div>
        )}

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
          d.nb_route_stops.forEach((s, i) => {
            if (i === afterIdx) {
              wps.forEach((wp, k) =>
                rows.push(<WaypointRow key={`wp-${k}`} wp={wp} seq={i + k + 1} />));
            }
            rows.push(
              <StopRow key={s.seq} stop={s} brief={brief[s.nb_accounts?.id ?? ""]} />,
            );
          });
          if (afterIdx === -1 && wps.length > 0) {
            wps.forEach((wp, k) =>
              rows.push(<WaypointRow key={`wp-tail-${k}`} wp={wp} seq={d.nb_route_stops.length + k + 1} />));
          }

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
