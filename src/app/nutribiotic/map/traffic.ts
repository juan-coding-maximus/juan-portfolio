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
 * The threshold at which a leg stops being a hop between neighbours and
 * becomes a transit decision (Juan, 2026-08-26). At 45 minutes a segment is
 * drawn heavy and grey on the map and carries its own minute count, because
 * that is the leg that decides whether a day is one cluster or two.
 */
export const LONG_LEG_MINUTES = 45;
