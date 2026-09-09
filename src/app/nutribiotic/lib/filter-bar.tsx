"use client";

/**
 * THE FILTER BAR, one component, both screens (/nutribiotic/map and
 * /nutribiotic/sdr). Juan, 2026-09-09: "map filters (for map and SDR, they
 * should be same). they need to be divided by section."
 *
 * SECTIONED, NOT FLAT. Five labelled rows in Juan's order, each with its own
 * label gutter on the left and its own `clear` on the right, so the bar reads
 * as five questions rather than one wall of chips. The label gutter is a fixed
 * width at every size: a row whose chips start at a different x than the row
 * above it reads as a different kind of control, which is exactly the
 * confusion this restructure was called to fix.
 *
 * WHAT THIS COMPONENT DOES NOT OWN. Map-only display toggles (the route line,
 * the areas overlay) are not filters, they draw things. They ride in
 * `trailing`, rendered by the map, so SDR never has to pretend they exist.
 *
 * The vocabulary, the counts and the predicate are all lib/account-filters.ts.
 * This file is only the buttons.
 */

import { Ico } from "./ui";
import type { Tier } from "./dal";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  HOT_SCORE_MIN,
  LEAD_STAGES,
  LEAD_STAGE_COLOR,
  LEAD_STAGE_LABEL,
  LEAD_STAGE_TITLE,
  READINESS_FILTERS,
  READINESS_LABEL,
  UNTYPED_CHANNELS,
  activeFilterCount,
  type AccountFilterState,
  type AccountType,
  type FilterCounts,
  type LeadStage,
  type ReadinessFilter,
} from "./account-filters";

const TIERS: Tier[] = ["A", "B", "C", "D", "E", "F", "G"];

/** Same ramp the map's pins wear, so the legend and the control are one thing. */
const POTENTIAL_COLOR: Partial<Record<Tier, string>> = {
  A: "#B5372A",
  B: "#B5372A",
  C: "#D97E2B",
  D: "#C79A1E",
  E: "#8A928C",
};

const ON = "border-[#14201B] bg-[#14201B] text-[#F7F6F1]";
const OFF = "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]";
const CHIP = "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors";

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function Section({
  label,
  title,
  onClear,
  children,
}: {
  label: string;
  title?: string;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-1.5 gap-y-1.5 border-b border-[#E2DFD5] bg-white px-3 py-2">
      <span
        className="mt-1 w-[86px] shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] text-[#8A928C]"
        title={title}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-0.5 shrink-0 rounded-md px-2 py-1 text-[12.5px] text-[#8A928C] underline-offset-2 hover:text-[#3D4A44] hover:underline"
        >
          clear
        </button>
      )}
    </div>
  );
}

/** A show/hide toggle for a whole class of account (chains, practices,
 *  prospects). Not a filter chip: it persists to nb_ui_prefs and follows Juan
 *  between devices, and its resting state HIDES rows, which is why it is
 *  visually set apart at the end of the Type row rather than mixed in. */
export type HideToggle = {
  key: string;
  /** How many rows this toggle is currently hiding (or would hide). */
  count: number;
  shown: boolean;
  onToggle: () => void;
  shownLabel: string;
  hiddenLabel: string;
  title: string;
  icon?: string;
  dot?: string;
};

export function AccountFilterBar({
  value,
  onChange,
  counts,
  areas,
  hideToggles = [],
  trailing,
  summary,
  open,
  onToggleOpen,
}: {
  value: AccountFilterState;
  onChange: (next: AccountFilterState) => void;
  counts: FilterCounts;
  areas: { id: string; label: string; color: string; brief?: string | null }[];
  hideToggles?: HideToggle[];
  /** Screen-specific controls that are NOT filters (the map's route line and
   *  areas overlay). Rendered in their own row so nothing in the five sections
   *  above has to be explained twice. */
  trailing?: React.ReactNode;
  /** "112 of 253", always visible whether the sections are open or not: a
   *  filtered screen that looks unfiltered is how you conclude a territory is
   *  empty. */
  summary: string;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const n = activeFilterCount(value) + hideToggles.filter((t) => t.shown).length;

  return (
    <>
      {/* COLLAPSED BY DEFAULT at every width (Juan, 2026-08-28). Five sections
          is more control than anyone needs on screen to read a map or work a
          call queue; filtering is occasional, the screen behind it is not. */}
      <div className="flex items-center justify-between gap-2 border-b border-[#E2DFD5] bg-white px-3 py-2">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[#3D4A44]"
        >
          <Ico name={open ? "chevron-up" : "chevron-down"} size={13} />
          Filters
          {n > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#14201B] px-1 text-[10.5px] font-semibold tabular-nums text-[#F7F6F1]">
              {n}
            </span>
          )}
        </button>
        <span className="text-[12px] tabular-nums text-[#8A928C]">{summary}</span>
      </div>

      <div className={open ? "contents" : "hidden"}>
        {/* 1 · AREAS. Unchanged: 18 areas, each chip carrying its own colour,
            ordered by prospect count upstream (lib/priority.ts's
            sortAreasByProspects), so both screens list them identically. */}
        <Section
          label="Areas"
          title="territory_areas.json. Ordered by how many accounts in each area score 80+."
          onClear={value.areas.size > 0 ? () => onChange({ ...value, areas: new Set() }) : undefined}
        >
          {areas.map((a) => {
            const on = value.areas.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onChange({ ...value, areas: toggle(value.areas, a.id) })}
                aria-pressed={on}
                title={a.brief ?? undefined}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                  on ? "text-[#F7F6F1]" : OFF
                }`}
                style={on ? { background: a.color, borderColor: a.color } : undefined}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: on ? "#F7F6F1" : a.color }}
                />
                {a.label}
                <span className={`tabular-nums ${on ? "opacity-70" : "text-[#8A928C]"}`}>
                  {counts.areas[a.id] ?? 0}
                </span>
              </button>
            );
          })}
        </Section>

        {/* 2 · HQ POTENTIAL. Unchanged. These letters are potential_hq (A-G,
            mirrored from HubSpot's potential__cloned_), NOT the A-D OS tier;
            the label is what stops the two reading as one contradictory
            number. See TierChip in lib/ui.tsx. */}
        <Section
          label="HQ potential"
          title="HubSpot's own potential grade (potential__cloned_, A-G). HQ owns it; the OS mirrors it. Not the A-D OS tier."
          onClear={value.tiers.size > 0 ? () => onChange({ ...value, tiers: new Set() }) : undefined}
        >
          {TIERS.map((t) => {
            const on = value.tiers.has(t);
            const dot = POTENTIAL_COLOR[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...value, tiers: toggle(value.tiers, t) })}
                aria-pressed={on}
                className={`${CHIP} ${on ? ON : OFF}`}
              >
                {dot && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: dot }} />}
                {t} <span className="tabular-nums opacity-70">{counts.tiers[t] ?? 0}</span>
              </button>
            );
          })}
        </Section>

        {/* 3 · READINESS (new, Juan 2026-09-09). Urgent and Hot are the top two
            of nb_accounts.readiness's existing four-value ladder (migration
            0069), not new labels invented for this bar. The 75+ chip is the
            arithmetic score, a separate question that lives in the same row
            because both answer "who is worth a call today". */}
        <Section
          label="Readiness"
          title="nb_accounts.readiness (migration 0069), the rep's own read, set by hand from a call or visit. Plus the computed 0-100 priority score."
          onClear={
            value.readiness.size > 0 || value.hotScore
              ? () => onChange({ ...value, readiness: new Set(), hotScore: false })
              : undefined
          }
        >
          {READINESS_FILTERS.map((r) => {
            const on = value.readiness.has(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => onChange({ ...value, readiness: toggle(value.readiness, r) })}
                aria-pressed={on}
                title={
                  r === "urgent"
                    ? "Tagged Urgent by hand. Adds +20 to the priority score."
                    : "Tagged Hot by hand. Adds +10 to the priority score."
                }
                className={`${CHIP} ${on ? ON : OFF}`}
              >
                <Ico name={r === "urgent" ? "alert" : "wand"} size={12} />
                {READINESS_LABEL[r]}{" "}
                <span className="tabular-nums opacity-70">{counts.readiness[r] ?? 0}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChange({ ...value, hotScore: !value.hotScore })}
            aria-pressed={value.hotScore}
            title={`Priority score ${HOT_SCORE_MIN} or better, from lib/priority.ts. Same score the ranking and the area ordering use.`}
            className={`${CHIP} ${value.hotScore ? ON : OFF}`}
          >
            <Ico name="metrics" size={12} />
            {HOT_SCORE_MIN}+ score <span className="tabular-nums opacity-70">{counts.hotScore}</span>
          </button>
        </Section>

        {/* 4 · TYPE (new, Juan 2026-09-09). Derived from nb_accounts.channel,
            which is where account type has always lived. Chains and Practices
            moved here from the HQ potential row: both are statements about
            WHAT KIND of business this is, which is exactly this section's
            question, and neither has anything to do with a grade. */}
        <Section
          label="Type"
          title="Derived from nb_accounts.channel, the classifier the enrichment pipeline already fills."
          onClear={value.types.size > 0 ? () => onChange({ ...value, types: new Set() }) : undefined}
        >
          {ACCOUNT_TYPES.map((t: AccountType) => {
            const on = value.types.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...value, types: toggle(value.types, t) })}
                aria-pressed={on}
                title={
                  t === "other"
                    ? `Accounts whose channel maps to none of the five: ${UNTYPED_CHANNELS.join(", ")}. Counted and visible rather than guessed into a type.`
                    : undefined
                }
                className={`${CHIP} ${on ? ON : OFF}`}
              >
                {ACCOUNT_TYPE_LABEL[t]}{" "}
                <span className="tabular-nums opacity-70">{counts.types[t] ?? 0}</span>
              </button>
            );
          })}

          {/* The hide toggles, set apart. These persist to nb_ui_prefs and
              their resting state REMOVES rows, so they are not the same kind
              of control as a chip that narrows and widens on a click. */}
          {hideToggles.length > 0 && (
            <>
              <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[#E2DFD5]" />
              <span className="mr-0.5 text-[11.5px] text-[#8A928C]">Hidden</span>
              {hideToggles.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={t.onToggle}
                  aria-pressed={t.shown}
                  title={t.title}
                  className={`${CHIP} ${t.shown ? ON : OFF}`}
                >
                  {t.dot ? (
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: t.dot }} />
                  ) : t.icon ? (
                    <Ico name={t.icon} size={12} />
                  ) : null}
                  {t.shown ? t.shownLabel : t.hiddenLabel}{" "}
                  <span className="tabular-nums opacity-70">{t.count}</span>
                </button>
              ))}
            </>
          )}
        </Section>

        {/* 5 · LEAD STATUS. The five stages of migration 0073, replacing the
            four HubSpot labels this row used to mirror. Every chip is offered
            whether or not the current screen has one, so the vocabulary is the
            same five words on both pages even when a day's call queue happens
            to hold three of them. */}
        <Section
          label="Lead status"
          title="nb_v_account_lead_stage (migration 0073). Four stages are computed from OS facts; Closed is HubSpot's, mirrored."
          onClear={value.stages.size > 0 ? () => onChange({ ...value, stages: new Set() }) : undefined}
        >
          {LEAD_STAGES.map((s: LeadStage) => {
            const on = value.stages.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...value, stages: toggle(value.stages, s) })}
                aria-pressed={on}
                title={LEAD_STAGE_TITLE[s]}
                className={`${CHIP} ${on ? ON : OFF}`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: on ? "#F7F6F1" : LEAD_STAGE_COLOR[s] }}
                />
                {LEAD_STAGE_LABEL[s]}{" "}
                <span className="tabular-nums opacity-70">{counts.stages[s] ?? 0}</span>
              </button>
            );
          })}
        </Section>

        {trailing}
      </div>
    </>
  );
}
