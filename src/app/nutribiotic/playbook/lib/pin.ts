/**
 * Playbook PIN gate, added 2026-08-02 at Juan's direction, scoped to this one
 * section (the rest of /nutribiotic stays unlocked per proxy.ts's 2026-07-20
 * removal). A 4-digit PIN checked server-side and an httpOnly cookie, nothing
 * heavier: this shelf is strategy docs, not the finance PIN's blast radius.
 */

export const PLAYBOOK_PIN = "4174";
export const PLAYBOOK_COOKIE = "nb_playbook_ok";
