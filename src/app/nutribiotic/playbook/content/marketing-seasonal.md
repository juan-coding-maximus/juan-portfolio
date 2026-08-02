# Seasonal Marketing Playbook · v0

The engine: a repeating annual wheel where every campaign runs the same four owned
channels plus the in-store tie-in, and **no campaign closes without its ROI number**.
The measure is always the same: featured-product order lift in the campaign window
versus the account's own baseline, read from `nb_order_lines`. That measurement
needs zero new tooling; the OS already holds the data.

Targets and dates below are `proposed` until confirmed in [GOALS.md](GOALS.md).

## The wheel

| Season | Window | Theme | Anchor products | Why then |
| --- | --- | --- | --- | --- |
| Fall | Sep 1 to Nov 30 | Immune support | immune line | Cold season starts; stores reset shelves for it |
| Finals (fall) | Nov 15 to Dec 15 | Mental clarity | focus/clarity line | College finals; campus-adjacent stores |
| New year | Jan | TODO: decide (reset/wellness) or skip | | Only if a real angle exists; a forced campaign trains stores to ignore us |
| Finals (spring) | Apr 15 to May 15 | Mental clarity | focus/clarity line | Spring finals, same motion re-run |
| Summer | May 15 to Aug 31 | Electrolytes and hydration | electrolyte line | Heat; gyms and grocery coolers |

Anchor SKUs per campaign come from the ERP product catalog
(`05-erp-sales/product_catalog_prices.csv`), never from memory.

## The four channels, per campaign

Each campaign ships the same kit, so the second run of the wheel is assembly, not
creation:

1. **Website**: one seasonal banner/landing update with the featured line.
2. **Newsletter**: one themed issue; subject, hero, one offer, one educational block.
3. **Email nurture feed**: a 3-touch sequence for the segment that buys (or should buy) the featured line: education, social proof, offer. Segments come from `nb_order_lines` (who buys what), never from a bought list.
4. **Social**: a 6-post window calendar: 2 educational, 2 product, 1 in-store/field, 1 offer.

Plus the physical legs, specced in [`in-store-program.md`](in-store-program.md):
- Endcap or shelf-talker tie-in in pilot stores.
- Monthly mailed discount brochure buy when the window and the theme line up.

## ROI discipline

Per campaign, one table, filled at close:

| Field | Source |
| --- | --- |
| Cost (production + placements + product given away) | receipts |
| Featured-line orders in window vs same accounts' baseline | `nb_order_lines` |
| New accounts first-ordering in window | `nb_orders` |
| Verdict: repeat, resize, or kill | the QBR |

A campaign that cannot state its cost does not launch. A campaign that cannot show
lift at close does not repeat unchanged.

## Approval gates

Per agency constitution: everything above is drafted and staged by agents where
useful, but **nothing publishes or sends without Juan's explicit approval**, per
channel, per campaign. Website, newsletter, nurture sends, and social posts are
each a human click.

## Status

- 2026-08-02 · v0. First real campaign: Fall immune, target live 2026-10-01 (G3).
