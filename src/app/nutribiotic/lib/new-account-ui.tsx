"use client";

/**
 * What shows under a touchpoint that parked as needs_account (Visit tab).
 * Two pill rows, each candidate a tap away from done:
 *
 *   Client Match:  the model's own low-confidence guess at an account
 *                  already in the book (see touchpoint.ts's matchAccountId),
 *                  surfaced instead of silently discarded.
 *   New Client:    up to 3 Google Places results for the name Juan said,
 *                  California-bound, fetched the moment this mounts so
 *                  there is something to tap without typing first.
 *
 * ONE-TAP CONFIRM, ALWAYS A SUCCESS NOTE (Juan, 2026-08-19, now a standing
 * agency-wide UI rule, see AGENTS.md): every "YES!" ends in ui.tsx's
 * SuccessNote, inline, in place of the pills that were just tapped. A tap
 * that changes real data is not trustworthy unless it visibly says so.
 *
 * A manual search stays underneath, collapsed, for when none of the 3 Places
 * guesses or the 1 client guess is actually the right one.
 */

import { useEffect, useState, useTransition } from "react";
import { GoogleMap, MarkerF, useLoadScript } from "@react-google-maps/api";
import { getAreaForPoint } from "./area-actions";
import { setPotentialJuan, setReadiness } from "./account-actions";
import type { Tier } from "./dal";
import type { Readiness } from "./priority";
import {
  createBusinessFromPlace,
  linkTouchpointToExistingCompany,
  searchNewBusiness,
  type BusinessSearchOutcome,
  type CreateBusinessOutcome,
} from "./new-account-actions";
import { discardTouchpoint, resolveTouchpointToAccount, type ResolveResult } from "./touchpoint";
import type { PlaceCandidate } from "./places";
import { Ico, SuccessNote } from "./ui";

/**
 * A candidate's own pin, scrollable and zoomable, so Juan can tell whether
 * this is really the storefront in front of him before he taps YES! (his
 * ask, 2026-09-15). Shown only while its bubble is expanded, never all three
 * at once: three live Maps embeds on a phone screen at a doorway is the kind
 * of weight the Visit screen's own "reads nothing, streams nothing" doctrine
 * exists to avoid (see visit/page.tsx).
 */
function PlacePreviewMap({ lat, lng }: { lat: number; lng: number }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: apiKey ?? "" });
  if (loadError) return <div className="px-1 py-2 text-[12px] text-[#8A6D2F]">Map failed to load.</div>;
  if (!isLoaded) return <div className="px-1 py-2 text-[12px] text-[#8A928C]">Loading map…</div>;
  return (
    <div className="mt-1.5 overflow-hidden rounded-md border border-[#E2DFD5]">
      <GoogleMap
        center={{ lat, lng }}
        zoom={16}
        mapContainerStyle={{ width: "100%", height: "200px" }}
        options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" }}
      >
        <MarkerF position={{ lat, lng }} />
      </GoogleMap>
    </div>
  );
}

/** One rounded chip: a name to confirm and the YES! that confirms it. */
function MatchPill({
  label,
  sub,
  onYes,
  pending,
  disabled,
}: {
  label: string;
  sub?: string | null;
  onYes: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[#E2DFD5] bg-white py-1 pl-3 pr-1.5">
      <span className="min-w-0 truncate text-[12.5px] text-[#14201B]">
        {label}
        {sub && <span className="text-[#8A928C]"> · {sub}</span>}
      </span>
      <button
        onClick={onYes}
        disabled={pending || disabled}
        className="shrink-0 rounded-full bg-[#14201B] px-2.5 py-1 text-[11.5px] font-semibold tracking-wide text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "..." : "YES!"}
      </button>
    </div>
  );
}

/**
 * A Places candidate's own pill: the name is a button that reveals its map
 * underneath (Juan, 2026-09-15, "so I can know if it's the right one before
 * saying yes"), YES! still confirms immediately without opening anything.
 * Own component rather than a MatchPill option: the Client Match pill above
 * points at an existing OS account, which carries no Places coordinate to
 * show a map for.
 */
function PlacePill({
  candidate,
  expanded,
  onToggleMap,
  onYes,
  pending,
  disabled,
}: {
  candidate: PlaceCandidate;
  expanded: boolean;
  onToggleMap: () => void;
  onYes: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <div className={expanded ? "w-full" : "min-w-0 max-w-full"}>
      <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[#E2DFD5] bg-white py-1 pl-3 pr-1.5">
        <button
          type="button"
          onClick={onToggleMap}
          disabled={candidate.lat == null || candidate.lng == null}
          className="min-w-0 flex-1 truncate text-left text-[12.5px] text-[#14201B] disabled:cursor-default"
        >
          {candidate.name}
          {/* Neighborhood over city when we have it: same-chain candidates
              often share one city (three Sprouts, all "Los Angeles") and are
              otherwise indistinguishable here. City is still what's stored on
              the account, see places.ts. */}
          {(candidate.neighborhood ?? candidate.city) && (
            <span className="text-[#8A928C]"> · {candidate.neighborhood ?? candidate.city}</span>
          )}
        </button>
        <button
          onClick={onYes}
          disabled={pending || disabled}
          className="shrink-0 rounded-full bg-[#14201B] px-2.5 py-1 text-[11.5px] font-semibold tracking-wide text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "..." : "YES!"}
        </button>
      </div>
      {expanded && candidate.lat != null && candidate.lng != null && (
        <PlacePreviewMap lat={candidate.lat} lng={candidate.lng} />
      )}
    </div>
  );
}

export function AccountMatchResolver({
  touchpointId,
  nameGuess,
  matchAccountId,
  matchAccountName,
  pendingGrade = null,
  pendingReadiness = null,
  onResolved,
  onSuccess,
  onDiscarded,
}: {
  touchpointId: string;
  nameGuess: string | null;
  matchAccountId: string | null;
  matchAccountName: string | null;
  /** A potential letter the rep picked on the capture card before the account
   * was known. Applied the moment one exists, whether by match or by create. */
  pendingGrade?: Tier | null;
  /** A readiness tag the rep picked on the capture card before the account
   * was known. Same hold-until-resolved pattern as pendingGrade. */
  pendingReadiness?: Readiness | null;
  onResolved?: () => void;
  /** Fired the instant a match, a create, or a discard lands, for a caller
   *  that owns the row's own exit timing (unmatched-ui.tsx's queue), same
   *  contract as NextStepResolver's onSuccess. `onResolved` stays what it
   *  was: the "that's had its read" beat the capture card uses to reset. */
  onSuccess?: () => void;
  /** Fired once a discard is confirmed, in place of onSuccess/onResolved: a
   *  discarded touchpoint never resolved to a match, it just left the queue. */
  onDiscarded?: () => void;
}) {
  const [matchResult, setMatchResult] = useState<ResolveResult | null>(null);
  const [matching, startMatching] = useTransition();

  const [discarding, startDiscard] = useTransition();
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [discarded, setDiscarded] = useState(false);

  const [search, setSearch] = useState<BusinessSearchOutcome | null>(null);
  const [searching, startSearch] = useTransition();
  const [query, setQuery] = useState(nameGuess ?? "");
  const [mapOpenId, setMapOpenId] = useState<string | null>(null);

  const [created, setCreated] = useState<CreateBusinessOutcome | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  // The exact candidate YES! was pressed on, held only for the success
  // screen's address/area lines below: `created` itself carries the account
  // that resulted, not the street address or coordinate it was built from.
  const [pickedPlace, setPickedPlace] = useState<PlaceCandidate | null>(null);
  const [pickedArea, setPickedArea] = useState<string | null>(null);

  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linking, startLink] = useTransition();

  // Where Juan is standing right now (his ask, 2026-09-15), read once on
  // mount. Silent on denial/timeout: searchNewBusiness falls back to today's
  // last logged stop on its own when this never arrives. `ready` gates the
  // first search so it fires with real GPS when GPS shows up in time,
  // instead of racing it and usually losing.
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => setLocationReady(true));
      return;
    }
    const done = (coords?: { lat: number; lng: number }) => {
      if (coords) setNearMe(coords);
      setLocationReady(true);
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => done(),
      { enableHighAccuracy: true, timeout: 2500, maximumAge: 60_000 },
    );
  }, []);

  // The 3 Places candidates load the moment this mounts (once GPS has had
  // its chance to arrive), from the name Juan already said. Nothing to type
  // before there's something to tap.
  useEffect(() => {
    if (!nameGuess || search || !locationReady) return;
    startSearch(async () => {
      setSearch(await searchNewBusiness(nameGuess, nearMe));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameGuess, locationReady]);

  /** The grade the rep picked at the door, now that there is an account to put
   * it on. Fire-and-forget, same as the capture card: the sync worker carries
   * it to HubSpot on its own cycle, and a grade that failed to save must never
   * roll back a visit that filed. `onResolved` is deliberately NOT called
   * here: it fires on a delay below, once there's been time to read the note. */
  function applyPendingGrade(accountId: string) {
    if (pendingGrade) void setPotentialJuan(accountId, pendingGrade);
    if (pendingReadiness) void setReadiness(accountId, pendingReadiness);
  }

  /**
   * Juan, 2026-09-02: a filed "Created X" / "Matched X" note sat on screen
   * forever, so the only way to log the next visit was to reload the page.
   * Same fix as the plain-match success note in touchpoint-ui.tsx (tap to
   * skip, otherwise clear itself), just on a 5s delay instead of 2.2s: this
   * note carries more to read (the new-company facts, a follow-up count).
   * `onResolved` both resets the capture card above AND clears `result` in
   * the parent, which is what unmounts this component and drops the note.
   */
  useEffect(() => {
    if (!matchResult?.ok) return;
    const t = setTimeout(() => onResolved?.(), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchResult]);

  useEffect(() => {
    if (!created?.ok) return;
    const t = setTimeout(() => onResolved?.(), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created]);

  function confirmMatch() {
    if (!matchAccountId || !matchAccountName || matching) return;
    startMatching(async () => {
      const res = await resolveTouchpointToAccount(touchpointId, matchAccountId, matchAccountName);
      setMatchResult(res);
      if (res.ok) {
        applyPendingGrade(res.accountId);
        onSuccess?.();
      }
    });
  }

  /** The one-tap fix for "this already is a client": a duplicate the block
   * above found that's actually Juan's own account, just not the one the
   * matcher above proposed (or nothing was proposed at all). Files the
   * touchpoint against it directly, no second company created. */
  function linkExisting(companyId: string) {
    setLinkingId(companyId);
    startLink(async () => {
      const res = await linkTouchpointToExistingCompany(touchpointId, companyId);
      setMatchResult(res);
      if (res.ok) {
        applyPendingGrade(res.accountId);
        onSuccess?.();
      }
    });
  }

  /** Juan's one-tap fix for a touchpoint that never should have parked here
   * (a smoke test, a note-to-self that leaked past the field_note gate): out
   * of the queue for good, immediately, no second confirmation. Low blast
   * radius (discardTouchpoint marks the row, never deletes it, root
   * AGENTS.md P7), which is why this is one tap rather than a hold-to-confirm. */
  function discard() {
    if (discarding || discarded) return;
    setDiscardError(null);
    startDiscard(async () => {
      const res = await discardTouchpoint(touchpointId, "needs_account");
      if (!res.ok) {
        setDiscardError(res.error);
        return;
      }
      setDiscarded(true);
      onSuccess?.();
    });
  }

  useEffect(() => {
    if (!discarded) return;
    const t = setTimeout(() => (onDiscarded ?? onResolved)?.(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discarded]);

  function pick(place: PlaceCandidate, force = false) {
    setCreatingId(place.placeId);
    setPickedPlace(place);
    startCreate(async () => {
      const res = await createBusinessFromPlace(touchpointId, place, { force });
      setCreated(res);
      if (res.ok) {
        applyPendingGrade(res.accountId);
        onSuccess?.();
      }
    });
  }

  // The success screen's "greater area" line (Juan, 2026-09-15), looked up
  // once the create actually lands: a candidate Juan never confirmed never
  // needs the area computed, so this waits for `created`, not `pickedPlace`.
  useEffect(() => {
    if (!created?.ok || pickedPlace?.lat == null || pickedPlace?.lng == null) return;
    let live = true;
    void getAreaForPoint(pickedPlace.lat, pickedPlace.lng).then((area) => {
      if (live) setPickedArea(area?.label ?? null);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created]);

  function doManualSearch() {
    if (!query.trim() || searching) return;
    startSearch(async () => {
      setCreated(null);
      setSearch(await searchNewBusiness(query, nearMe));
    });
  }

  if (discarded) {
    return (
      <div className="mt-3">
        <button onClick={() => (onDiscarded ?? onResolved)?.()} className="block w-full text-left">
          <SuccessNote title="Discarded" detail="Not filed anywhere, and it will not come back in this queue." />
        </button>
      </div>
    );
  }

  // Resolved: show the one success note in place of everything else. Tappable
  // to skip the 5s wait, same affordance as the plain-match note above it.
  if (matchResult?.ok) {
    return (
      <div className="mt-3">
        <button onClick={() => onResolved?.()} className="block w-full text-left">
          <SuccessNote
            title={`Matched ${matchResult.accountName}`}
            detail={matchResult.summary}
            hubspotFiled={matchResult.hubspotFiled}
            hubspotId={matchResult.hubspotNoteId}
            hubspotError={matchResult.hubspotError}
            meta={
              <>
                {(matchResult.peopleAdded > 0 || matchResult.peopleUpdated > 0) && (
                  <div className="mt-1.5 text-[12px] text-[#8A928C]">
                    {matchResult.peopleAdded > 0 && `${matchResult.peopleAdded} contact${matchResult.peopleAdded === 1 ? "" : "s"} added`}
                    {matchResult.peopleAdded > 0 && matchResult.peopleUpdated > 0 && ", "}
                    {matchResult.peopleUpdated > 0 && `${matchResult.peopleUpdated} updated`}
                  </div>
                )}
                <div className="mt-1.5 text-[11px] uppercase tracking-[0.1em] text-[#A9AFA9]">Tap for the next one</div>
              </>
            }
          />
        </button>
      </div>
    );
  }

  if (created?.ok) {
    // Everything a brand-new company left this flow carrying, stated plainly:
    // this create path is the one documented exception that sets lead status
    // and owner at birth (see hubspot-company.ts), and pendingGrade is Juan's
    // own OS-side potential read from the capture card, applied the moment
    // the account existed to receive it (see applyPendingGrade above).
    const facts = [
      "lead status set to New to open",
      "owner set to you",
      pendingGrade && `potential set to ${pendingGrade}`,
      pendingReadiness && `readiness set to ${pendingReadiness}`,
      created.peopleAdded > 0 &&
        `${created.peopleAdded} contact${created.peopleAdded === 1 ? "" : "s"} added`,
      created.peopleUpdated > 0 && `${created.peopleUpdated} contact${created.peopleUpdated === 1 ? "" : "s"} updated`,
    ].filter((f): f is string => Boolean(f));

    // The big screen (Juan, 2026-09-15): name, street, and greater area up
    // top, in that order of size, because those are the three things worth
    // reading at a glance to confirm this really is the door he just walked
    // out of. Everything the old compact SuccessNote said (HubSpot filing,
    // the new-company facts) still follows below, just smaller.
    const street = pickedPlace?.street ?? pickedPlace?.formattedAddress ?? null;
    const areaLine = [pickedPlace?.city, pickedArea].filter(Boolean).join(" · ") || null;
    return (
      <div className="mt-3">
        <button onClick={() => onResolved?.()} className="block w-full text-left">
          <div className="rounded-lg border border-[#E2DFD5] bg-white p-4">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[#2C6A46]">
              <Ico name="check" size={12} />
              Logged
            </div>
            <div className="mt-1.5 font-[family-name:var(--font-fraunces)] text-[22px] font-semibold leading-tight text-[#14201B]">
              {created.accountName}
            </div>
            {street && <div className="mt-1 text-[14px] text-[#5B6560]">{street}</div>}
            {areaLine && <div className="mt-0.5 text-[12.5px] text-[#8A928C]">{areaLine}</div>}

            <div className="mt-3 border-t border-[#EDEBE3] pt-3">
              {created.hubspotFiled !== undefined && (
                <div className={`flex items-center gap-1.5 text-[12px] ${created.hubspotFiled ? "text-[#8A928C]" : "text-[#8A6D2F]"}`}>
                  <Ico name={created.hubspotFiled ? "check" : "alert"} size={11} />
                  {created.hubspotFiled
                    ? `Filed to HubSpot${created.hubspotNoteId ? ` (${created.hubspotNoteId})` : ""}.`
                    : `Not filed to HubSpot yet: ${created.hubspotError ?? "unknown error"}. It's waiting in the queue below to retry.`}
                </div>
              )}
              <div className="mt-1.5 text-[12px] text-[#8A928C]">{facts.join(", ")}</div>
              {created.routeDirectives > 0 && (
                <div className="mt-1.5 text-[12px] text-[#8A928C]">
                  {created.routeDirectives} return visit{created.routeDirectives === 1 ? "" : "s"} queued for the route planner
                </div>
              )}
              <div className="mt-1.5 text-[11px] uppercase tracking-[0.1em] text-[#A9AFA9]">Tap for the next one</div>
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3">
      {matchAccountId && matchAccountName && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Client Match:</div>
          <div className="flex flex-wrap gap-2">
            <MatchPill label={matchAccountName} onYes={confirmMatch} pending={matching} disabled={creating || linking} />
          </div>
        </div>
      )}

      {/* Not nested inside the Client Match block above: a tap on "That's it,
          use it" in the duplicates list below (linkExisting) sets this exact
          same matchResult, and until this moved out here that failure had no
          screen to show on at all, the resolver just went back to its normal
          state as if nothing had been tapped (Juan, 2026-09-23: "the UI
          doesn't actually work"). Every failed write stays on screen, in
          plain words, no matter which control produced it. */}
      {matchResult && !matchResult.ok && (
        <div className="flex items-start gap-1.5 rounded-md bg-[#FBF6E9] px-2.5 py-2 text-[12px] text-[#8A6D2F]">
          <span className="mt-[1px] shrink-0">
            <Ico name="alert" size={12} />
          </span>
          <span>{matchResult.error}</span>
        </div>
      )}

      <div>
        {/* Eyebrow, search box, and Search button in one row (Juan,
            2026-09-15): the manual search is not a fallback hidden behind a
            toggle any more, it's always right there. */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">New client:</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doManualSearch()}
            placeholder="Business name"
            className="min-w-0 flex-1 rounded-md border border-[#E2DFD5] bg-white px-3 py-1.5 text-[13px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
          />
          <button
            onClick={doManualSearch}
            disabled={searching || !query.trim()}
            className="shrink-0 rounded-md bg-[#14201B] px-3 py-1.5 text-[12.5px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {searching ? "..." : "Search"}
          </button>
        </div>

        {searching && !search && <div className="mt-2 text-[12.5px] text-[#8A928C]">Looking up nearby businesses…</div>}

        {search?.ok && (
          <div className="mt-2 flex flex-wrap gap-2">
            {search.candidates.map((c) => (
              <PlacePill
                key={c.placeId}
                candidate={c}
                expanded={mapOpenId === c.placeId}
                onToggleMap={() => setMapOpenId((id) => (id === c.placeId ? null : c.placeId))}
                onYes={() => pick(c)}
                pending={creating && creatingId === c.placeId}
                disabled={matching || linking || (creating && creatingId !== c.placeId)}
              />
            ))}
          </div>
        )}

        {search && !search.ok && <div className="mt-2 text-[12.5px] text-[#8A6D2F]">{search.error}</div>}

        {created && !created.ok && (
          <div className="mt-2 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[13px] text-[#8A6D2F]">
            {created.error}
            {created.duplicates && created.duplicates.length > 0 && (
              <>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {created.duplicates.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="min-w-0 truncate">
                        {d.name ?? d.id} {d.city ? `· ${d.city}` : ""} · owner {d.owner ?? "(unowned)"}
                      </span>
                      {d.isJuans && (
                        <button
                          onClick={() => linkExisting(d.id)}
                          disabled={linking || creating}
                          className="shrink-0 rounded-full bg-[#14201B] px-2.5 py-1 text-[11.5px] font-semibold tracking-wide text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
                        >
                          {linking && linkingId === d.id ? "..." : "That's it, use it"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {search?.ok && (
                  <button
                    onClick={() => pick(search.candidates[0], true)}
                    disabled={creating || linking}
                    className="mt-2 rounded-md border border-[#E5D9BF] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#8A6D2F] transition-colors hover:bg-[#FBF6E9] disabled:opacity-40"
                  >
                    {creating ? "..." : "None of these are it, create anyway"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[#EDEBE3] pt-2.5">
        <button
          type="button"
          onClick={discard}
          disabled={discarding || matching || linking || creating}
          className="text-[12px] text-[#8A928C] underline underline-offset-2 transition-colors hover:text-[#8A6D2F] disabled:opacity-40"
        >
          {discarding ? "Discarding…" : "Not a client, discard"}
        </button>
        {discardError && <span className="text-[12px] text-[#8A6D2F]">{discardError}</span>}
      </div>
    </div>
  );
}
