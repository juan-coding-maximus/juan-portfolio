/**
 * Import review. The decision screen that the import path was missing.
 *
 * import_data.py proposes into nb_import_rows and stops; promote_import.py
 * applies only what has already been decided. Between those two there was
 * nothing, so every import dead-ended at a table no one could see.
 *
 * WHAT THIS SCREEN IS FOR, precisely: deciding whether an incoming row is a
 * store already in the territory or a new one. That call is worth a dedicated
 * screen because getting it wrong in the merge direction is irreversible in
 * practice: two stores' order histories fuse, both accounts' scores are poisoned
 * from then on, and nothing raises an error. So the layout puts the evidence for
 * the match, not the verdict, in front of the eye: the matcher's basis and score
 * sit beside the two names being compared, and the buttons are deliberately
 * plain rather than a green "approve" that invites a rhythm of tapping.
 *
 * The matcher's hint ORDERS the queue and never decides it (import_data.py:145).
 */

import Link from "next/link";
import { listImportBatches, listImportRows, isConfigured } from "../lib/dal";
import { decideImportRow } from "../lib/import-actions";
import { Empty, Ico, PageHead } from "../lib/ui";

export const dynamic = "force-dynamic";

const HINT_NOTE: Record<string, string> = {
  merge: "Decisive evidence: exact phone, or street number with postal.",
  review: "Ambiguous. Name similarity only, which is not evidence on its own.",
  create: "No credible match against the existing territory.",
};

function field(raw: Record<string, string>, k: string): string {
  const v = raw?.[k];
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function addressLine(raw: Record<string, string>): string {
  return [field(raw, "street"), field(raw, "city"), field(raw, "state"), field(raw, "postal")]
    .filter(Boolean)
    .join(", ");
}

export default async function Review({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const batches = await listImportBatches();
  const rows = await listImportRows(sp.batch);

  const showAll = sp.show === "all";
  const pending = rows.filter((r) => r.decision === "pending");
  const decided = rows.filter((r) => r.decision !== "pending" && !r.applied_at);
  const applied = rows.filter((r) => r.applied_at);
  const visible = showAll ? rows : pending;

  return (
    <>
      <PageHead
        title="Import review"
        sub="Each row is a store from a file, not yet in the territory. Decide whether it is one you already have or a new one. Deciding writes nothing: promote_import.py applies the decisions afterwards."
      />

      {!isConfigured() ? (
        <Empty>No data source configured.</Empty>
      ) : rows.length === 0 ? (
        <Empty>
          Nothing imported yet. Run{" "}
          <code className="rounded bg-[#ECEAE1] px-1 py-0.5 text-[12.5px]">
            python3 bridges/nutribiotic/import_data.py &lt;csv&gt; --source hubspot_export --write
          </code>{" "}
          to load a normalized export, then come back here.
        </Empty>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#5B6560]">
            <span>
              <strong className="text-[#14201B]">{pending.length}</strong> awaiting your decision
            </span>
            <span>
              <strong className="text-[#14201B]">{decided.length}</strong> decided, not yet applied
            </span>
            <span>
              <strong className="text-[#14201B]">{applied.length}</strong> applied
            </span>
            <Link
              href={`/nutribiotic/review?${new URLSearchParams({
                ...(sp.batch ? { batch: sp.batch } : {}),
                ...(showAll ? {} : { show: "all" }),
              })}`}
              className="underline underline-offset-2 hover:text-[#14201B]"
            >
              {showAll ? "Show only undecided" : "Show all rows"}
            </Link>
          </div>

          {batches.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-1.5">
              <Link
                href="/nutribiotic/review"
                className={`rounded-md border px-2.5 py-1 text-[12.5px] ${
                  !sp.batch
                    ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                    : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
                }`}
              >
                All batches
              </Link>
              {batches.map((b) => (
                <Link
                  key={b.id}
                  href={`/nutribiotic/review?batch=${encodeURIComponent(b.id)}`}
                  className={`rounded-md border px-2.5 py-1 text-[12.5px] ${
                    sp.batch === b.id
                      ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                      : "border-[#E2DFD5] bg-white text-[#3D4A44] hover:bg-[#FAF9F5]"
                  }`}
                  title={`${b.source} · ${b.filename ?? ""}`}
                >
                  {b.filename ?? b.id}
                  {b.row_count != null && (
                    <span className="ml-1.5 text-[#8A928C]">{b.row_count}</span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {decided.length > 0 && (
            <p className="mb-5 flex items-start gap-1.5 text-[13px] text-[#A0762C]">
              <Ico name="alert" size={14} />
              <span>
                {decided.length} decided row{decided.length === 1 ? "" : "s"} not yet in the
                territory. Run{" "}
                <code className="rounded bg-[#F3EFE3] px-1 py-0.5 text-[12.5px]">
                  python3 bridges/nutribiotic/promote_import.py --write
                </code>
                .
              </span>
            </p>
          )}

          {visible.length === 0 ? (
            <Empty>Every row has been decided. Nothing is waiting on you.</Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {visible.map((r) => {
                const hint = String(r.match_basis?.hint ?? "review");
                const why = String(r.match_basis?.why ?? "");
                const name = field(r.raw, "name") || "(no name in source)";
                const addr = addressLine(r.raw);
                const phone = field(r.raw, "phone");
                const contact = [
                  field(r.raw, "contact_first_name"),
                  field(r.raw, "contact_last_name"),
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-[#E2DFD5] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <div className="text-[15px] font-medium">{name}</div>
                        {addr && <div className="mt-0.5 text-[13px] text-[#5B6560]">{addr}</div>}
                        <div className="mt-0.5 text-[12.5px] text-[#8A928C]">
                          {[phone, contact && `contact: ${contact}`, field(r.raw, "hubspot_company_id")]
                            .filter(Boolean)
                            .join("  ·  ")}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-[#8A928C]">
                          {hint}
                        </div>
                        {r.match_score != null && (
                          <div className="text-[12.5px] text-[#5B6560]">
                            score {r.match_score.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* The evidence, not the verdict. This is the line a human is
                        actually being asked to judge. */}
                    <div className="mt-3 rounded-md bg-[#FAF9F5] px-3 py-2 text-[12.5px] text-[#5B6560]">
                      {r.match_account_id ? (
                        <>
                          Proposed match:{" "}
                          <Link
                            href={`/nutribiotic/account/${r.match_account_id}`}
                            className="text-[#14201B] underline underline-offset-2"
                          >
                            {r.match_account_id}
                          </Link>
                          {why && <> · {why}</>}
                        </>
                      ) : (
                        <>{why || HINT_NOTE[hint] || "No candidate scored above the floor."}</>
                      )}
                      <div className="mt-1 text-[#8A928C]">{HINT_NOTE[hint]}</div>
                    </div>

                    {r.applied_at ? (
                      <div className="mt-3 text-[12.5px] text-[#5B6560]">
                        Applied as{" "}
                        <span className="text-[#14201B]">{r.applied_account_id ?? "(removed)"}</span>
                        {r.applied_note && <> · {r.applied_note}</>}
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {(["merge", "create", "reject", "duplicate"] as const).map((d) => (
                          <form key={d} action={decideImportRow.bind(null, r.id, d)}>
                            <button
                              type="submit"
                              disabled={d === "merge" && !r.match_account_id}
                              className="rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1 text-[12.5px] text-[#3D4A44] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B] disabled:cursor-not-allowed disabled:opacity-40"
                              title={
                                d === "merge" && !r.match_account_id
                                  ? "No proposed match, so there is nothing to merge into."
                                  : undefined
                              }
                            >
                              {d === "merge"
                                ? "Same store"
                                : d === "create"
                                  ? "New store"
                                  : d === "reject"
                                    ? "Not a store"
                                    : "Duplicate row"}
                            </button>
                          </form>
                        ))}
                        {r.decision !== "pending" && (
                          <>
                            <span className="ml-1 text-[12.5px] text-[#14201B]">
                              decided: {r.decision}
                            </span>
                            <form action={decideImportRow.bind(null, r.id, "pending")}>
                              <button
                                type="submit"
                                className="rounded-md px-2 py-1 text-[12.5px] text-[#8A928C] underline underline-offset-2 hover:text-[#14201B]"
                              >
                                undo
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
