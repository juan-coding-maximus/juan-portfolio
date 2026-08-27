/**
 * What a Southern California drive actually costs, at the hour it happens.
 *
 * WHY THIS REPLACED A CONSTANT. drive-actions.ts multiplied OSRM's free-flow
 * duration by a flat 1.35, calibrated in the 09:00-16:00 window the screen
 * used to plan for. That single number is wrong in both directions at the two
 * times it matters most: it badly under-counts a 17:00 leg on the 405 and
 * over-counts the same leg at 07:00 or 20:00. On a ten-stop day those errors
 * compound into a finish time that is off by an hour, which is the number Juan
 * actually plans his evening around.
 *
 * WHAT IT IS AND IS NOT. This is a time-of-day shape, not a traffic feed. It
 * knows that the PM peak is worse than the AM peak and that both are worse
 * than midday, because that is true of this basin every weekday. It does not
 * know about today's collision on the 110. So every number derived from it
 * stays labelled a planning estimate, never an ETA, exactly as the flat factor
 * was. When a live-traffic source is wired in, this file goes.
 *
 * ONE NUMBER, NOT A RANGE (Juan, 2026-08-26: "a likely number, doesn't need to
 * be super specific"). A spread invites arithmetic at a light. A single honest
 * estimate does not.
 *
 * Control points are (hour, multiplier over free-flow), linearly interpolated
 * between, wrapping midnight. Calibrated against the same South Bay legs the
 * flat 1.35 was, plus the two peaks it never covered.
 */

const CONTROL_POINTS: Array<[hour: number, factor: number]> = [
  [0, 1.05],
  [5, 1.08],
  [7, 1.5],
  [8, 1.6],
  [9, 1.45],
  [11, 1.24],
  [13, 1.26],
  [15, 1.5],
  [17, 1.75],
  [18, 1.65],
  [20, 1.18],
  [22, 1.08],
  [24, 1.05],
];

/**
 * Weekends move about like a light midday, all day: no commute peaks, but the
 * basin is never actually empty. Juan's field week is Mon-Thu, so this exists
 * so a Saturday catch-up drive is not quoted a Tuesday rush hour.
 */
const WEEKEND_FACTOR = 1.15;

/** Multiplier to apply to a free-flow duration for a drive STARTING at `at`. */
export function trafficFactorAt(at: Date): number {
  const day = at.getDay();
  if (day === 0 || day === 6) return WEEKEND_FACTOR;

  const hour = at.getHours() + at.getMinutes() / 60;
  for (let i = 1; i < CONTROL_POINTS.length; i++) {
    const [h0, f0] = CONTROL_POINTS[i - 1];
    const [h1, f1] = CONTROL_POINTS[i];
    if (hour <= h1) {
      const t = h1 === h0 ? 0 : (hour - h0) / (h1 - h0);
      return f0 + (f1 - f0) * t;
    }
  }
  return CONTROL_POINTS[CONTROL_POINTS.length - 1][1];
}

/**
 * Free-flow minutes to likely minutes, for a leg departing at `at`.
 *
 * Rounded to whole minutes at the edge rather than carried as a float: the
 * screen shows "38 min", and a value that says 38 while holding 37.6 is a
 * value two callers will disagree about.
 */
export function likelyDriveMinutes(freeFlowMinutes: number, at: Date): number {
  return Math.round(freeFlowMinutes * trafficFactorAt(at));
}

/**
 * WHAT A LEG COSTS, AS FOUR KINDS OF DECISION (Juan, 2026-08-26).
 *
 * A minute count is a number to read. A band is a thing to see. These four are
 * the distinctions that actually change what he does with a pair of stops:
 *
 *   walk  <= 5 min   Park once and do both on foot. This is the band that
 *                    changes a day, because it turns two stops into one stop,
 *                    and it was completely invisible on a uniform line.
 *   near  6-25 min   An ordinary hop inside a cluster.
 *   far   26-45 min  Still one day, but it costs a real piece of it.
 *   haul  46+ min    The leg that decides whether this is one day or two.
 *                    The only band that carries its number on the map.
 *
 * Boundaries are inclusive on both ends as written, over the ROUNDED minute
 * count, so a leg is in exactly one band and nothing lands between two.
 */
export type DriveBand = "walk" | "near" | "far" | "haul";

export const WALKABLE_MINUTES = 5;
export const HAUL_MINUTES = 46;

export function driveBand(minutes: number): DriveBand {
  const m = Math.round(minutes);
  if (m <= WALKABLE_MINUTES) return "walk";
  if (m <= 25) return "near";
  if (m <= 45) return "far";
  return "haul";
}

/**
 * How each band is drawn.
 *
 * ON FLUORESCENT COLOURS OVER A PALE MAP. Juan asked for fluorescent green and
 * yellow. Taken literally, on this basemap (#f3f1ea ground, white roads) a
 * neon yellow line is very nearly invisible, which would defeat the whole
 * point of banding. So each segment is drawn twice: a dark casing underneath,
 * then the fluorescent colour on top. That is the same trick Google and Apple
 * use to put traffic colours on a light basemap, and it is what lets the hues
 * stay genuinely fluorescent instead of being muted down into legibility.
 *
 * Weight carries the same ranking as the colour, so the day reads correctly in
 * a screenshot, at a glance, and to anyone who cannot separate red from green.
 * `walk` is deliberately the finest line: a five-minute hop should look like
 * almost nothing, because that is what it costs.
 */
export const BAND_STYLE: Record<
  DriveBand,
  { color: string; weight: number; casing: number; label: boolean; title: string }
> = {
  walk: { color: "#00F06A", weight: 2.5, casing: 4.5, label: false, title: "Walkable, 5 min or less" },
  near: { color: "#FFE600", weight: 4, casing: 6.5, label: false, title: "6 to 25 min" },
  far: { color: "#FF2D2D", weight: 5, casing: 7.5, label: false, title: "26 to 45 min" },
  haul: { color: "#9AA3A0", weight: 11, casing: 0, label: true, title: "46 min or more" },
};
