"use client";

/**
 * The new-business path off a needs_account touchpoint. Search Google Places
 * by name, confirm the right one, and the visit already recorded gets filed
 * against a freshly created OS account + HubSpot company. See
 * lib/new-account-actions.ts for the actual pipeline; this is presentation.
 */

import { useState, useTransition } from "react";
import {
  createBusinessFromPlace,
  searchNewBusiness,
  type BusinessSearchOutcome,
  type CreateBusinessOutcome,
} from "./new-account-actions";
import type { PlaceCandidate } from "./places";
import { Ico } from "./ui";

export function NewBusinessResolver({
  touchpointId,
  nameGuess,
}: {
  touchpointId: string;
  nameGuess: string | null;
}) {
  const [query, setQuery] = useState(nameGuess ?? "");
  const [search, setSearch] = useState<BusinessSearchOutcome | null>(null);
  const [created, setCreated] = useState<CreateBusinessOutcome | null>(null);
  const [searching, startSearch] = useTransition();
  const [creating, startCreate] = useTransition();

  function doSearch() {
    if (!query.trim() || searching) return;
    startSearch(async () => {
      setSearch(await searchNewBusiness(query));
    });
  }

  function pick(place: PlaceCandidate, force = false) {
    startCreate(async () => {
      setCreated(await createBusinessFromPlace(touchpointId, place, { force }));
    });
  }

  if (created?.ok) {
    return (
      <div className="mt-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-3 py-2.5 text-[13px] leading-relaxed text-[#3D4A44]">
        <div className="flex items-center gap-1.5 font-medium text-[#2C6A46]">
          <Ico name="check" size={13} />
          Created {created.accountName} and filed the visit
        </div>
        <div className="mt-1 text-[#5B6560]">
          {created.summary}
          {(created.peopleAdded > 0 || created.peopleUpdated > 0) &&
            ` · ${created.peopleAdded} contact${created.peopleAdded === 1 ? "" : "s"} added`}
          {created.calendarProposals > 0 && ` · ${created.calendarProposals} follow-up waiting below`}
        </div>
        <div className="mt-1.5 text-[12px] text-[#8A928C]">
          It's now in "Ready to file to HubSpot" below to become a Note, Call, or Meeting.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3">
      <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
        Couldn't confidently match an account. New business?
      </div>

      {!search?.ok && (
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Business name"
            className="min-w-0 flex-1 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[13.5px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
          />
          <button
            onClick={doSearch}
            disabled={searching || !query.trim()}
            className="shrink-0 rounded-md bg-[#14201B] px-3.5 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      )}

      {search && !search.ok && (
        <div className="mt-2 text-[13px] text-[#8A6D2F]">{search.error}</div>
      )}

      {search?.ok && !created && (
        <div className="mt-2 flex flex-col gap-2">
          {search.candidates.map((c) => (
            <div key={c.placeId} className="flex items-start justify-between gap-3 rounded-md border border-[#E2DFD5] bg-white p-2.5">
              <div className="min-w-0 text-[13px]">
                <div className="font-medium">{c.name}</div>
                <div className="mt-0.5 text-[12px] text-[#5B6560]">
                  {c.formattedAddress ?? "no address on file"}
                  {c.phone && ` · ${c.phone}`}
                </div>
                {c.businessStatus && c.businessStatus !== "OPERATIONAL" && (
                  <div className="mt-0.5 text-[12px] text-[#8A6D2F]">{c.businessStatus.replace(/_/g, " ").toLowerCase()}</div>
                )}
              </div>
              <button
                onClick={() => pick(c)}
                disabled={creating}
                className="shrink-0 rounded-md bg-[#14201B] px-3 py-1.5 text-[12.5px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {creating ? "..." : "This is it"}
              </button>
            </div>
          ))}
          <button
            onClick={() => setSearch(null)}
            className="self-start text-[12px] text-[#8A928C] underline-offset-2 hover:underline"
          >
            None of these, search again
          </button>
        </div>
      )}

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
    </div>
  );
}
