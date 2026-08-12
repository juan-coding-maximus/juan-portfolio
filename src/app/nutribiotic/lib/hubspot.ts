/**
 * HubSpot CRM v3 client for the deployed app.
 *
 * A port of bridges/nutribiotic/hubspot.py, which stays the authority. Read
 * that file before changing this one.
 *
 * WHY THIS EXISTS AT ALL. Until now every HubSpot write in this system was
 * Python on Juan's Mac, and the app deliberately touched nothing:
 * api/touchpoint/route.ts still says "Nothing here reaches HubSpot". Voice
 * capture from a phone in the field changed that, because the write has to
 * happen while the laptop is asleep in another city.
 *
 * WHAT THE PORT ACTUALLY IS. Copying the API call would take twenty lines. The
 * work is everything wrapped around the token, and every piece of it was put
 * there by an incident:
 *
 *   1. EVERY CALL IS LOGGED to nb_hubspot_sync_log before it returns, with the
 *      normalized payload hash. On 2026-08-01 a push reached all 392 linked
 *      companies including another rep's 118, and 90 days of full
 *      request/response is the only reason it could be reverted. A write path
 *      that skips the log is invisible to the mechanism that saved the portal.
 *   2. THE HASH MUST MATCH PYTHON BYTE FOR BYTE, or the partial unique index
 *      nb_hubspot_push_idempotent silently stops deduping across the two
 *      writers. See hubspot-hash.ts and nutribiotic/tests/hash_parity.py.
 *   3. OWNER SCOPE IS ASSERTED TWICE, once in the query and once against the
 *      live record, per AGENTS.md hard rule 2.
 *   4. WHAT MAY BE PUSHED comes from hubspot_fields.json, never from this file.
 *      A property with no owner class there is one the sync refuses to touch,
 *      and the app inherits that rule rather than restating it.
 *
 * FAIL CLOSED, EVERYWHERE. No token, no config, no Supabase to log to: refuse
 * the write. An unauditable or unpoliced write to a shared employer portal is
 * worse than no write, because the field work still exists in the OS either way.
 *
 * DRY BY DEFAULT. NB_HUBSPOT_WRITE_ENABLED must be explicitly "true" before
 * anything mutates. hubspot_notes.py inverted the house default for the same
 * reason (root AGENTS.md principle 5: trust by hand first), and this path is
 * newer than that one.
 */

import "server-only";
import { payloadHash } from "./hubspot-hash";
import { logHubspotCall, readConfig } from "./dal";

const BASE = "https://api.hubapi.com";

/** HubSpot caps batch read/write at 100. Not a tuning knob: larger is rejected. */
const BATCH_MAX = 100;

/**
 * Juan's HubSpot owner id. Hardcoded exactly as hubspot_sync.py:171-172 does,
 * because the whole point of the scope guard is that it cannot be widened by a
 * config edit or a caller argument.
 */
export const OWNER_ID = "36242368";

const token = (): string => process.env.NB_HUBSPOT_TOKEN ?? "";

/**
 * Writes are off unless explicitly switched on. Anything other than the exact
 * string "true" leaves this path read-only, so a typo fails safe.
 */
export const writeEnabled = (): boolean => process.env.NB_HUBSPOT_WRITE_ENABLED === "true";

export class HubSpotError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    method: string,
    path: string,
  ) {
    super(`${method} ${path} -> HTTP ${status}: ${body.slice(0, 600)}`);
    this.name = "HubSpotError";
  }
}

/** Refused before anything left the building. Distinct from a HubSpot failure. */
export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RequestOpts = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
  qs?: Record<string, string | number>;
  entity?: string;
  operation?: string;
  retries?: number;
};

/**
 * One HubSpot call, logged, with backoff on 429 and 5xx.
 *
 * The rate limit is per-app and bursty, so a 429 during a burst is normal
 * rather than exceptional and is retried. Each throttled attempt is logged
 * separately, so a systematically rate-limited app is visible in the log rather
 * than only in wall-clock time. Mirrors hubspot.py:123-179.
 */
export async function request<T = Record<string, unknown>>(opts: RequestOpts): Promise<T> {
  const { method, path, body, qs, entity = "-", operation = "call", retries = 4 } = opts;

  if (!token()) {
    throw new ScopeError(
      "HubSpot is not configured: NB_HUBSPOT_TOKEN is unset on this deployment. " +
        "Refusing to continue rather than degrading to a silent no-op.",
    );
  }

  const isMutation = method !== "GET";
  if (isMutation && !writeEnabled()) {
    throw new ScopeError(
      `Refusing ${method} ${path}: NB_HUBSPOT_WRITE_ENABLED is not "true". ` +
        "This path is dry by default until it has been proved by hand.",
    );
  }

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(qs ?? {})) url.searchParams.set(k, String(v));

  // Matches hubspot.py:139: the body when there is one, otherwise the path and
  // query, so a GET still gets a stable hash to log against.
  const phash = await payloadHash(body !== undefined ? body : { path, qs: qs ?? {} });

  // A read against /read is still a pull, per hubspot.py:153.
  const direction = method === "GET" || path.endsWith("/read") ? "pull" : "push";

  let delay = 1000;
  for (let attempt = 0; attempt < retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch (e) {
      // A network failure right after a cold start is common and clears slower
      // than a burst 429, so it backs off harder. hubspot.py:166-177.
      const message = e instanceof Error ? e.message : String(e);
      if (attempt < retries - 1) {
        await logHubspotCall({
          direction, entity, operation, payload_hash: phash,
          status: "network_error", error: message,
        });
        await sleep(Math.max(delay, 5000));
        delay *= 2;
        continue;
      }
      await logHubspotCall({
        direction, entity, operation, payload_hash: phash,
        status: "error", error: message, request: body,
      });
      throw e;
    }

    const text = await res.text();

    if (res.ok) {
      const parsed = (text ? JSON.parse(text) : {}) as T;
      await logHubspotCall({
        direction, entity, operation, payload_hash: phash,
        status: "ok", http_status: res.status, request: body, response: parsed,
      });
      return parsed;
    }

    if ([429, 502, 503, 504].includes(res.status) && attempt < retries - 1) {
      await logHubspotCall({
        direction, entity, operation, payload_hash: phash,
        status: "rate_limited", http_status: res.status, error: text,
      });
      await sleep(delay);
      delay *= 2;
      continue;
    }

    await logHubspotCall({
      direction, entity, operation, payload_hash: phash,
      status: "error", http_status: res.status, request: body, error: text,
    });
    throw new HubSpotError(res.status, text, method, path);
  }

  throw new HubSpotError(429, "retries exhausted", method, path);
}

/** Read up to BATCH_MAX records by id, chunking as needed. hubspot.py:188-201. */
export async function batchRead(
  objectType: string,
  ids: string[],
  properties: string[],
): Promise<Array<{ id: string; properties: Record<string, string | null> }>> {
  const out: Array<{ id: string; properties: Record<string, string | null> }> = [];
  for (let i = 0; i < ids.length; i += BATCH_MAX) {
    const chunk = ids.slice(i, i + BATCH_MAX);
    const res = await request<{ results?: typeof out }>({
      method: "POST",
      path: `/crm/v3/objects/${objectType}/batch/read`,
      body: { properties, inputs: chunk.map((id) => ({ id })) },
      entity: objectType,
      operation: "batch_read",
    });
    out.push(...(res.results ?? []));
  }
  return out;
}

export type ScopeVerdict = {
  /** Company ids confirmed to be Juan's against the live record. */
  allowed: string[];
  /** Company ids refused, with the owner actually found. Report these, never swallow. */
  dropped: Array<{ id: string; owner: string | null }>;
};

/**
 * The second of the two owner-scope assertions, and the one that matters.
 *
 * The first assertion belongs to the caller: the Supabase query that produced
 * these ids must already filter to Juan's book. This one re-reads the LIVE
 * record, because on 2026-08-01 the set that was "everything we happen to have
 * linked" turned out to include another rep's 118 companies. Scope is never
 * implied by what the OS has a row for.
 *
 * Dropped ids are returned rather than thrown so a batch can proceed with the
 * records that passed while still naming the ones it refused. A caller that
 * ignores `dropped` is a bug.
 */
export async function assertJuansBook(companyIds: string[]): Promise<ScopeVerdict> {
  const unique = Array.from(new Set(companyIds.filter(Boolean)));
  if (unique.length === 0) return { allowed: [], dropped: [] };

  const live = await batchRead("companies", unique, ["hubspot_owner_id"]);
  const owners = new Map(live.map((r) => [r.id, r.properties?.hubspot_owner_id ?? null]));

  const allowed: string[] = [];
  const dropped: ScopeVerdict["dropped"] = [];
  for (const id of unique) {
    // A company the portal did not return is not proof of ownership, so it is
    // refused too rather than defaulting to allowed.
    const owner = owners.get(id) ?? null;
    if (owner === OWNER_ID) allowed.push(id);
    else dropped.push({ id, owner });
  }
  return { allowed, dropped };
}

type FieldSpec = {
  hubspot: string;
  local: string;
  owner: "hubspot" | "os" | "shared";
  push?: "own" | "fill";
};

/**
 * The properties this app is permitted to write, read from the mirrored
 * hubspot_fields.json rather than restated here.
 *
 * FAIL CLOSED. If the mirror is missing (migration 0033 not applied, or
 * publish_config.py has never run) this returns an empty map, and every write
 * that consults it becomes a no-op. The alternative, defaulting to "anything
 * the token allows", is how a property nobody meant to expose gets pushed.
 */
export async function pushableCompanyProperties(): Promise<Map<string, FieldSpec>> {
  const config = await readConfig<{
    objects?: { companies?: Record<string, FieldSpec> };
  }>("hubspot_fields");

  const out = new Map<string, FieldSpec>();
  if (!config) return out;

  for (const spec of Object.values(config.objects?.companies ?? {})) {
    // Both conditions, exactly as hubspot_sync.py:213 selects pushables: an
    // owner class of "os" is not enough on its own, the field must also declare
    // how it pushes.
    if (spec && spec.owner === "os" && (spec.push === "own" || spec.push === "fill")) {
      out.set(spec.hubspot, spec);
    }
  }
  return out;
}

/**
 * Blank a `domain` that HubSpot derived from a directory host.
 *
 * AGENTS.md hard rule 5. HubSpot fills `domain` server-side from whatever goes
 * into `website`, and `domain` is its duplicate-merge key. A Yelp or Healthgrades
 * profile is a perfectly good `website` and a catastrophe as a `domain`: on
 * 2026-08-02 it keyed 22 unrelated businesses on yelp.com. Any write to
 * `website` must be followed by a read-back, which is why this is not optional
 * and not the caller's judgment call.
 */
const DIRECTORY_HOSTS = new Set([
  "yelp.com", "healthgrades.com", "facebook.com", "instagram.com", "linkedin.com",
  "maps.google.com", "google.com", "business.site", "yellowpages.com", "mapquest.com",
  "tripadvisor.com", "doordash.com", "ubereats.com", "grubhub.com", "postmates.com",
  "vagaro.com", "square.site", "wixsite.com", "weebly.com",
]);

/** True when a derived domain points at a directory rather than the business. */
export function isDirectoryDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!host) return false;
  if (DIRECTORY_HOSTS.has(host)) return true;
  // A subdomain of a directory is the same problem: pages.yelp.com, m.facebook.com.
  return Array.from(DIRECTORY_HOSTS).some((d) => host.endsWith(`.${d}`));
}

export async function repairDerivedDomain(companyId: string): Promise<"blanked" | "ok"> {
  const live = await batchRead("companies", [companyId], ["domain", "website"]);
  const domain = live[0]?.properties?.domain ?? null;
  if (!isDirectoryDomain(domain)) return "ok";

  await request({
    method: "PATCH",
    path: `/crm/v3/objects/companies/${companyId}`,
    body: { properties: { domain: "" } },
    entity: "companies",
    operation: "upsert",
  });
  return "blanked";
}
