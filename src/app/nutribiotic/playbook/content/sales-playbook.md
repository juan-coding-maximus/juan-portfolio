# Sales Playbook · v0 (skeleton for v1, due 2026-09-30)

The rule of this document: **a section is either field-tested or marked TODO.**
Nothing here is written as proven unless it survived real doors. v1 means every
section below has been run at least once by Juan; v2 means it survived a second
person (the first hire) running it without him.

## 1. The territory model (field-tested)

- The book is defined by one fact: HubSpot owner id 36242368. 273 SoCal accounts, plus the NorCal set in the OS.
- **Lifecycle** is an order-history fact the OS computes, never a feeling: active (ordered within cadence), dormant (ordered before 2024 or past cadence), prospect (never ordered).
- **Cadence**: the territory's median inter-order gap is 41 days (measured, not chosen). An account past its own cadence shows up on the overdue list; the overdue list is the default call sheet.
- **Potential grade (A to G)** is HQ's scale and answers one question: how much can they buy in a single order. It is capacity, not chain size and not current spend. Chains buy through distributors, so a big banner often means a small direct order. Never regrade over HQ; blanks get evidence-laddered grades, recorded with their evidence tier.

## 2. The week (field-tested)

- Field days are 10-stop days, planned as clusters; anything 2h+ out is a sleep-away overnight. Plans live in the OS Plan tab and the field briefs.
- **Call-first rule**: any account Places reports closed at the address on file gets a call before a drive. An order outranks a closure signal, but nobody drives on a signal alone.
- Friday, 20 min: Metrics tab against the overdue list, next week's clusters set.

## 3. The visit loop (field-tested, keep tightening)

1. **Before the door**: read the account dossier on the phone (`02-accounts/` page): what they buy, what they stopped buying, last order, named contact, potential grade.
2. **At the door**: sell to the person named in the dossier if there is one; otherwise the first job of the visit is to leave with a name and role.
3. **The ask** is specific to lifecycle: overdue-active gets a reorder ask on what they already buy; dormant gets a "what changed" conversation before any pitch; prospect gets the fit question first.
4. **After the door**: log the visit as a HubSpot company Note in Juan's session (Juan's 2026-07-28 call: notes to HubSpot, not the OS touchpoint pipeline). Follow-ups become calendar proposals, human-approved.

## 4. What to lead with, by account type (TODO: fill from field evidence)

The OS knows store type and each account's top products. This section gets one
paragraph per store type (natural grocery, specialty supplement, clinic/practice,
pharmacy, gym, general grocery) written only after enough visits per type to say
something true: what they stock, who decides, what opens the conversation.

## 5. Objection handling (TODO: build as they occur)

One entry per objection actually heard in the field: the objection verbatim, what
was tried, what worked. No imported objection scripts from the internet.

## 6. Reactivation motion (partially tested)

- Source list: the overdue list plus the pre-2024 dormant set, worked in route clusters, never alphabetically.
- A dormant account gets at most `TODO: n` touches (visit, call, follow-up) before it is parked with a dated note; parking is a decision, not a fade-out.
- Every reactivation (first order after dormancy) is logged; the count is G1's scoreboard.

## 7. Tools of the trade (field-tested)

- **Sales OS** (`juanarenas.bio/nutribiotic`): Today, Territory, Map, Plan, Metrics, Goals.
- **Desktop bundle** (`~/Desktop/NutriBiotic/`): the whole territory as files, phone-readable account pages, rebuilt on demand.
- **HubSpot portal 148711228**: shared with another rep; everything written there is scoped to Juan's book, twice.
- The stack behind these is documented for the next hire in [`onboarding/stack.md`](onboarding/stack.md).

## 8. New-account prospecting kit (proposed, not built, awaiting go-ahead)

Source: Connor Murray's B2B SDR/BDR prospecting method, adapted for door-to-door new
logos rather than cold calls. Aimed at stores/clinics not yet in the 273-account book,
distinct from Section 6's reactivation motion (which works dormant *existing* accounts).

- **Vertical taxonomy.** Segment prospects by store type, not by title×industry: independent
  health food store, chiropractic, naturopathic/functional medicine, gym/juice bar/wellness
  studio, co-op grocery. Each vertical gets one config entry (priorities, challenges, how
  NutriBiotic solves them), written and signed off by Juan once, reused verbatim, never
  improvised per door (no-fabrication rule applies to repeated claims same as anywhere else).
- **Discovery, not import.** Search each of the 14 territory areas by vertical via the Places
  API already wired for the OS, dedupe against the 273 existing accounts and `nb_import_rows`,
  land results in a new `nb_prospects` table as `candidate` status. Nothing becomes a target
  until Juan approves it, same human-gate pattern as imports today.
- **Script + email kit.** A `prospect_kit.py` that takes a vertical and renders a walk-in
  script and an email draft from that vertical's config to `out/`. No auto-send.
- **Authoring pass.** Draft each vertical's priorities/challenges/outcomes fast using Connor's
  4-prompt method, then Juan edits and locks the wording before it's reused across prospects.

Scoped-down option if this gets greenlit: build discovery only first (verticals × areas →
`nb_prospects`), prove the list is good, then add the script/template generator.

## Changelog

- 2026-08-14 · added Section 8 (new-account prospecting kit, proposed, awaiting go-ahead).
- 2026-08-02 · v0 skeleton, structure and the already-proven sections.
