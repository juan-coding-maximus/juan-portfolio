"use client";

/**
 * The ten closest clients to where Juan is standing, the "who can I hit from
 * here" list under the map. Distance is straight-line haversine, stated in
 * miles: honest about being as-the-crow-flies (a route figure would be a
 * fabricated number, we have no directions API call here). The rough compass
 * direction next to it is the great-circle initial bearing from Juan to the
 * account, read off in eight points, purely descriptive, not a heading to
 * steer by.
 *
 * Each row carries the actions a field stop needs: the phone number as a
 * tap-to-call link, the HubSpot company record, a locate button that zooms
 * the map above to fit Juan and that one account and opens its pin, and GO,
 * one big Apple Maps tap target per the standing field-brief format.
 * do_not_visit accounts are excluded: a proximity list exists to be driven to.
 * chain_excluded (the big national chains, migration 0024) and
 * practice_excluded (single-practitioner offices, migration 0025) are
 * excluded too unless their toggle is on, same flags the map's buttons flip.
 */

import type { MapAccount } from "../lib/dal";
import { Ico, TierChip } from "../lib/ui";
import { AccountLink } from "../lib/modal";
import type { LocStatus, UserLoc } from "./MapScreen";

// Same shape as the map's InfoWindow link: EU portal host, companies object 0-2.
const HUBSPOT_COMPANY_URL = (hubspotId: string) =>
  `https://app-eu1.hubspot.com/contacts/148711228/record/0-2/${hubspotId}`;

const POTENTIAL_DOT: Record<string, string> = {
  A: "#B5372A",
  B: "#B5372A",
  C: "#D97E2B",
  D: "#D97E2B",
};

function haversineMiles(a: UserLoc, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// The initial bearing along the great circle from a to b, standard forward-
// azimuth formula (not the constant rhumb-line bearing), read off in eight
// points. Sixteen would be false precision for a glance at a phone in a
// parking lot; eight is what a rep already thinks in.
const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function compassFrom(a: UserLoc, b: { lat: number; lng: number }): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return COMPASS_POINTS[Math.round(((deg + 360) % 360) / 45) % 8];
}

export function NearestClients({
  accounts,
  userLoc,
  status,
  onRetryLoc,
  onShowInMap,
  showChains,
  showPractices,
}: {
  accounts: MapAccount[];
  userLoc: UserLoc | null;
  status: LocStatus;
  onRetryLoc: () => void;
  onShowInMap: (id: string) => void;
  showChains: boolean;
  showPractices: boolean;
}) {
  const header = (
    <div className="mb-3 mt-6 flex items-baseline justify-between">
      <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
        Ten closest
      </h2>
      <span className="text-[12px] text-[#8A928C]">straight-line from your position</span>
    </div>
  );

  if (!userLoc) {
    return (
      <>
        {header}
        <div className="rounded-lg border border-[#E2DFD5] bg-white p-5 text-[13.5px] leading-relaxed text-[#5B6560]">
          {status === "pending" && (
            <p>
              Waiting for your position. If your browser is asking permission, answer it and this
              fills in.
            </p>
          )}
          {status === "denied" && (
            <p>
              Location is blocked for this site, so there is nothing honest to rank by. Allow it
              from the lock icon in the address bar, then use the button below.
            </p>
          )}
          {status === "timeout" && (
            <>
              <p>
                Your browser did not return a position in time, so there is nothing honest to rank
                by. The site permission is not the problem.
              </p>
              <p className="mt-2">
                On a Mac this is usually Location Services being off for the browser itself: System
                Settings &rsaquo; Privacy &amp; Security &rsaquo; Location Services, switch on
                Chrome. Then try again.
              </p>
            </>
          )}
          {status === "unavailable" && (
            <p>
              Your browser could not determine a position at all, so a closest-clients list cannot
              be computed. On a desktop with no wifi networks in range there may be nothing for it
              to work from.
            </p>
          )}
          {status !== "pending" && (
            <button
              type="button"
              onClick={onRetryLoc}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
            >
              <Ico name="locate" size={13} />
              Try my location again
            </button>
          )}
        </div>
      </>
    );
  }

  const nearest = accounts
    .filter(
      (a) =>
        !a.do_not_visit &&
        (showChains || !a.chain_excluded) &&
        (showPractices || !a.practice_excluded),
    )
    .map((a) => ({ a, mi: haversineMiles(userLoc, a) }))
    .sort((x, y) => x.mi - y.mi)
    .slice(0, 10);

  return (
    <>
      {header}
      <div className="overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
        <ul className="divide-y divide-[#EEECE3]">
          {nearest.map(({ a, mi }, i) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-[#8A928C]">
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {a.tier && POTENTIAL_DOT[a.tier] && (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: POTENTIAL_DOT[a.tier] }}
                    />
                  )}
                  <AccountLink
                    id={a.id}
                    className="truncate text-[14px] font-medium leading-snug hover:underline"
                  >
                    {a.name}
                  </AccountLink>
                  {a.tier && <TierChip tier={a.tier} scale="hq" />}
                </div>
                <div className="mt-0.5 text-[12.5px] text-[#5B6560]">
                  <span className="font-medium tabular-nums text-[#3D4A44]">{mi.toFixed(1)} mi</span>{" "}
                  <span className="font-medium text-[#3D4A44]">{compassFrom(userLoc, a)}</span>
                  {a.street ? ` · ${a.street}` : ""}
                  {a.city ? `, ${a.city}` : ""}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px]">
                  {a.phone ? (
                    <a
                      href={`tel:${a.phone}`}
                      className="inline-flex items-center gap-1 font-medium text-[#2C6A46] underline-offset-2 hover:underline"
                    >
                      {a.phone}
                    </a>
                  ) : (
                    <span className="text-[#A9AFA9]">no phone on file</span>
                  )}
                  {a.hubspot_company_id && (
                    <a
                      href={HUBSPOT_COMPANY_URL(a.hubspot_company_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#8A928C] underline-offset-2 hover:text-[#3D4A44] hover:underline"
                    >
                      HubSpot
                    </a>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onShowInMap(a.id)}
                  title="Zoom the map to you and this account"
                  className="flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-2.5 py-2.5 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
                >
                  <Ico name="locate" size={13} />
                </button>
                <a
                  href={`https://maps.apple.com/?daddr=${a.lat},${a.lng}`}
                  className="flex items-center gap-1.5 rounded-md bg-[#2C6A46] px-3.5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Ico name="pin" size={13} />
                  GO
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-[#8A928C]">
        Straight-line distance, not drive time. Red dot: HQ potential A or B. Orange: C or D.
        Accounts marked do-not-visit are left out.
      </p>
    </>
  );
}
