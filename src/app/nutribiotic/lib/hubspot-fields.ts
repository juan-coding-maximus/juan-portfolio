/**
 * Which HubSpot properties may be written, derived from hubspot_fields.json.
 *
 * Split out of hubspot.ts, and free of `server-only`, so the derivation can be
 * run against the real config file by nutribiotic/tests/fields_parity.py and
 * compared to what hubspot_sync.py does with the same input. There are now two
 * writers reading one policy file, and the first version of this got the rule
 * wrong in a way that failed silently.
 *
 * THE RULE IS `push`, AND OWNER IS IRRELEVANT. From hubspot_sync.py:213:
 *
 *     pushable = [p for p in cfg["objects"]["companies"]["properties"]
 *                 if p.get("push")]
 *
 * Owner says who is the authority on a value; `push` says whether the OS may
 * send one. Those come apart: `phone` is owner "hubspot" and `push: fill`, so
 * HQ owns the number while the OS may still fill a blank. Filtering on
 * owner === "os" drops it, and a blank-fill that silently never happens is
 * indistinguishable from an account that had nothing to add.
 */

export type FieldSpec = {
  hubspot: string;
  local: string;
  owner: "hubspot" | "os" | "shared";
  push?: "own" | "fill";
};

export type FieldsConfig = {
  objects?: Record<string, { properties?: FieldSpec[] }>;
};

export type PushableObject = "companies" | "contacts";

/**
 * Pushable properties for one object type, keyed by HubSpot property name.
 *
 * Pure and total: an absent or malformed config yields an empty map, which
 * callers must treat as "write nothing" rather than "no restrictions".
 */
export function derivePushable(
  config: FieldsConfig | null,
  object: PushableObject = "companies",
): Map<string, FieldSpec> {
  const out = new Map<string, FieldSpec>();
  if (!config) return out;
  for (const spec of config.objects?.[object]?.properties ?? []) {
    if (spec?.push === "own" || spec?.push === "fill") out.set(spec.hubspot, spec);
  }
  return out;
}
