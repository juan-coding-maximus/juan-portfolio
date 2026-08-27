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
   * roll back a visit that filed. */
  function applyPendingGrade(accountId: string) {
    if (pendingGrade) void setPotentialJuan(accountId, pendingGrade);
    onResolved?.();
  }

  function confirmMatch() {
    if (!matchAccountId || !matchAccountName || matching) return;
    startMatching(async () => {
      const res = await resolveTouchpointToAccount(touchpointId, matchAccountId, matchAccountName);
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

  // Resolved: show the one success note in place of everything else.
  if (matchResult?.ok) {
    return (
      <div className="mt-3">
        <SuccessNote
          title={`Matched ${matchResult.accountName}`}
          detail={matchResult.summary}
          hubspotFiled={matchResult.hubspotFiled}
          hubspotId={matchResult.hubspotNoteId}
          hubspotError={matchResult.hubspotError}
          meta={
            (matchResult.peopleAdded > 0 || matchResult.peopleUpdated > 0) && (
              <div className="mt-1.5 text-[12px] text-[#8A928C]">
                {matchResult.peopleAdded > 0 && `${matchResult.peopleAdded} contact${matchResult.peopleAdded === 1 ? "" : "s"} added`}
                {matchResult.peopleAdded > 0 && matchResult.peopleUpdated > 0 && ", "}
                {matchResult.peopleUpdated > 0 && `${matchResult.peopleUpdated} updated`}
              </div>
            )
          }
        />
      </div>
    );
  }

  if (created?.ok) {
    return (
      <div className="mt-3">
        <SuccessNote
          title={`Created ${created.accountName} and filed the visit`}
          detail={created.summary}
          hubspotFiled={created.hubspotFiled}
          hubspotId={created.hubspotNoteId}
          hubspotError={created.hubspotError}
          meta={
            (created.peopleAdded > 0 || created.peopleUpdated > 0 || created.calendarProposals > 0) && (
              <div className="mt-1.5 text-[12px] text-[#8A928C]">
                {created.peopleAdded > 0 && `${created.peopleAdded} contact${created.peopleAdded === 1 ? "" : "s"} added`}
                {created.peopleAdded > 0 && created.peopleUpdated > 0 && ", "}
                {created.peopleUpdated > 0 && `${created.peopleUpdated} updated`}
                {created.calendarProposals > 0 &&
                  `${created.peopleAdded || created.peopleUpdated ? " · " : ""}${created.calendarProposals} follow-up waiting below`}
              </div>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
        Couldn&apos;t confidently match an account.
      </div>

      {matchAccountId && matchAccountName && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Client Match:</div>
          <div className="flex flex-wrap gap-2">
            <MatchPill label={matchAccountName} onYes={confirmMatch} pending={matching} disabled={creating} />
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
                disabled={matching || (creating && creatingId !== c.placeId)}
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
                <ul className="mt-2 flex flex-col gap-1">
                  {created.duplicates.map((d) => (
                    <li key={d.id} className="text-[12.5px]">
                      {d.name ?? d.id} {d.city ? `· ${d.city}` : ""} · owner {d.owner ?? "(unowned)"}
                    </li>
                  ))}
                </ul>
                {search?.ok && (
                  <button
                    onClick={() => pick(search.candidates[0], true)}
                    disabled={creating}
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
