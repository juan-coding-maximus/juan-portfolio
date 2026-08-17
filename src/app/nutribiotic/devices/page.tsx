/**
 * Devices. What is allowed to open this OS without the PIN, and the one screen
 * that can take that back.
 *
 * NOT IN THE NAV, on the same rule Review and Home screen follow: it is read
 * when a phone is lost or a slot is needed, not daily. Reached from the Home
 * screen page, and from the gate when the cap turns a remember request down.
 *
 * See lib/devices.ts for why this is a registry rather than the IP allowlist
 * that was asked for, and what the cap and the revoke button each buy.
 */

import { DEVICE_LIMIT } from "../lib/session";
import { listDevices, trustedDeviceId } from "../lib/devices";
import { verifySession } from "../lib/dal";
import { Card, Empty, PageHead, daysAgo } from "../lib/ui";
import { ForgetButton } from "./ForgetButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Devices · NutriBiotic OS" };

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function DevicesPage() {
  await verifySession();

  const [devices, current] = await Promise.all([listDevices(), trustedDeviceId()]);

  if (devices === null) {
    return (
      <>
        <PageHead title="Devices" sub="The browsers that skip the PIN." />
        <Empty>
          The device registry cannot be read, so this screen will not guess at what is remembered.
          Either nb_devices has not been created yet (migration 0036) or the database is unreachable.
        </Empty>
      </>
    );
  }

  const live = devices.filter((d) => !d.revoked_at);
  const revoked = devices.filter((d) => d.revoked_at);
  const free = Math.max(0, DEVICE_LIMIT - live.length);

  return (
    <>
      <PageHead
        title="Devices"
        sub="The browsers that skip the PIN. Each one proved itself with the PIN once and holds a signed cookie that names its row here; forgetting a row is what takes that back."
      />

      <div className="flex max-w-[720px] flex-col gap-6">
        <Card>
          <div className="text-[13.5px] leading-relaxed text-[#5B6560]">
            <span className="font-medium text-[#14201B]">
              {live.length} of {DEVICE_LIMIT} remembered
            </span>
            {free > 0
              ? `, ${free} slot${free === 1 ? "" : "s"} free. Tick "Remember this device" the next time you unlock one.`
              : ". The next device to unlock will get eight hours and no more, until a slot is freed here."}
          </div>
          <p className="mt-2.5 max-w-[62ch] text-[13px] leading-relaxed text-[#8A928C]">
            An iPhone counts once per Home Screen icon, not once per phone: iOS gives every installed
            web app its own cookie jar, so the OS tile, ClientOS and ExpensOS each sign in separately.
            That is what the limit is sized for.
          </p>
        </Card>

        {live.length === 0 ? (
          <Empty>No device is remembered. Every screen asks for the PIN, on every browser, every eight hours.</Empty>
        ) : (
          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
              Remembered
            </h2>
            <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
              {live.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium leading-snug">
                      {d.label}
                      {d.id === current && (
                        <span className="ml-2 rounded-full bg-[#ECEAE1] px-2 py-0.5 text-[11px] font-medium tracking-wide text-[#3D4A44]">
                          this one
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[#8A928C]">
                      Remembered {when(d.created_at)} · last seen {daysAgo(d.last_seen_at)}
                    </div>
                  </div>
                  <ForgetButton id={d.id} isCurrent={d.id === current} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {revoked.length > 0 && (
          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
              Forgotten
            </h2>
            {/* Kept visible rather than deleted: a forgotten device that keeps
                turning up is worth being able to see. */}
            <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
              {revoked.map((d) => (
                <li key={d.id} className="px-4 py-3">
                  <div className="text-[13.5px] text-[#5B6560]">{d.label}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#8A928C]">
                    Forgotten {when(d.revoked_at!)} · it asks for the PIN like any other browser
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
