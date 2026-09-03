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
import { setPotentialJuan } from "./account-actions";
import type { Tier } from "./dal";
import {
  createBusinessFromPlace,
  linkTouchpointToExistingCompany,
  searchNewBusiness,
  type BusinessSearchOutcome,
  type CreateBusinessOutcome,
} from "./new-account-actions";
import { resolveTouchpointToAccount, type ResolveResult } from "./touchpoint";
import type { PlaceCandidate } from "./places";
import { Ico, SuccessNote } from "./ui";

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
    <div className="flex items-center gap-2 rounded-full border border-[#E2DFD5] bg-white py-1 pl-3 pr-1.5">
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

export function AccountMatchResolver({
  touchpointId,
  nameGuess,
  matchAccountId,
  matchAccountName,
  pendingGrade = null,
  onResolved,
}: {
  touchpointId: string;
  nameGuess: string | null;
  matchAccountId: string | null;
  matchAccountName: string | null;
  /** A potential letter the rep picked on the capture card before the account
   * was known. Applied the moment one exists, whether by match or by create. */
  pendingGrade?: Tier | null;
  onResolved?: () => void;
}) {
  const [matchResult, setMatchResult] = useState<ResolveResult | null>(null);
  const [matching, startMatching] = useTransition();

  const [search, setSearch] = useState<BusinessSearchOutcome | null>(null);
  const [searching, startSearch] = useTransition();
  const [query, setQuery] = useState(nameGuess ?? "");
  const [manualOpen, setManualOpen] = useState(false);

  const [created, setCreated] = useState<CreateBusinessOutcome | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();

  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linking, startLink] = useTransition();

  // The 3 Places candidates load the moment this mounts, from the name Juan
  // already said. Nothing to type before there's something to tap.
  useEffect(() => {
    if (!nameGuess || search) return;
    startSearch(async () => {
      setSearch(await searchNewBusiness(nameGuess));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameGuess]);

  /** The grade the rep picked at the door, now that there is an account to put
   * it on. Fire-and-forget, same as the capture card: the sync worker carries
   * it to HubSpot on its own cycle, and a grade that failed to save must never
   * roll back a visit that filed. `onResolved` is deliberately NOT called
   * here: it fires on a delay below, once there's been time to read the note. */
  function applyPendingGrade(accountId: string) {
    if (pendingGrade) void setPotentialJuan(accountId, pendingGrade);
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
      if (res.ok) applyPendingGrade(res.accountId);
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
      if (res.ok) applyPendingGrade(res.accountId);
    });
  }

  function pick(place: PlaceCandidate, force = false) {
    setCreatingId(place.placeId);
    startCreate(async () => {
      const res = await createBusinessFromPlace(touchpointId, place, { force });
      setCreated(res);
      if (res.ok) applyPendingGrade(res.accountId);
    });
  }

  function doManualSearch() {
    if (!query.trim() || searching) return;
    startSearch(async () => {
      setCreated(null);
      setSearch(await searchNewBusiness(query));
    });
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
      created.peopleAdded > 0 &&
        `${created.peopleAdded} contact${created.peopleAdded === 1 ? "" : "s"} added`,
      created.peopleUpdated > 0 && `${created.peopleUpdated} contact${created.peopleUpdated === 1 ? "" : "s"} updated`,
    ].filter((f): f is string => Boolean(f));

    return (
      <div className="mt-3">
        <button onClick={() => onResolved?.()} className="block w-full text-left">
          <SuccessNote
            title={`Created ${created.accountName} and filed the visit`}
            detail={created.summary}
            hubspotFiled={created.hubspotFiled}
            hubspotId={created.hubspotNoteId}
            hubspotError={created.hubspotError}
            meta={
              <>
                <div className="mt-1.5 text-[12px] text-[#8A928C]">{facts.join(", ")}</div>
                {created.routeDirectives > 0 && (
                  <div className="mt-1.5 text-[12px] text-[#8A928C]">
                    {created.routeDirectives} return visit{created.routeDirectives === 1 ? "" : "s"} queued for the route planner
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

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3">
      {matchAccountId && matchAccountName && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Client Match:</div>
          <div className="flex flex-wrap gap-2">
            <MatchPill label={matchAccountName} onYes={confirmMatch} pending={matching} disabled={creating || linking} />
          </div>
          {matchResult && !matchResult.ok && (
            <div className="mt-1.5 text-[12px] text-[#8A6D2F]">{matchResult.error}</div>
          )}
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">New Client:</div>

        {searching && !search && <div className="text-[12.5px] text-[#8A928C]">Looking up nearby businesses…</div>}

        {search?.ok && (
          <div className="flex flex-wrap gap-2">
            {search.candidates.map((c) => (
              <MatchPill
                key={c.placeId}
                label={c.name}
                sub={c.city}
                onYes={() => pick(c)}
                pending={creating && creatingId === c.placeId}
                disabled={matching || linking || (creating && creatingId !== c.placeId)}
              />
            ))}
          </div>
        )}

        {search && !search.ok && <div className="text-[12.5px] text-[#8A6D2F]">{search.error}</div>}

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

        <button
          onClick={() => setManualOpen((v) => !v)}
          className="mt-2 flex items-center gap-1 text-[12px] text-[#8A928C] underline-offset-2 hover:underline"
        >
          <Ico name={manualOpen ? "chevron-up" : "chevron-down"} size={11} />
          Search a different name
        </button>

        {manualOpen && (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doManualSearch()}
              placeholder="Business name"
              className="min-w-0 flex-1 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[13.5px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
            />
            <button
              onClick={doManualSearch}
              disabled={searching || !query.trim()}
              className="shrink-0 rounded-md bg-[#14201B] px-3.5 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
