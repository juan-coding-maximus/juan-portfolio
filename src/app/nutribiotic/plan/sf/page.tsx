/**
 * The San Francisco / Peninsula day brief, Thursday 30 July 2026 (Group 3 of the
 * NorCal trip). Ported from the approved field-brief format: drive-ordered
 * timeline with per-stop notes and one big Apple Maps tap target per stop, then
 * the who-you-are-selling-to cards. Nothing before, nothing after.
 *
 * Facts (buyers, order dates, windows) come from HubSpot portal 148711228 as
 * read 27 to 28 July 2026; do not edit them here without fixing the CRM first.
 */

import Link from "next/link";
import { Card, Ico } from "../../lib/ui";

export const metadata = { title: "SF Peninsula day · NutriBiotic OS" };

type Stop = {
  time: string;
  dur: string;
  name: string;
  window?: string;
  street: string;
  place: string;
  sub?: string;
  maps: string;
  order: string;
  fresh?: boolean;
  rep: string;
  note: string;
  kind: "stop" | "hard" | "gap";
};

const STOPS: (Stop | { break: true; time: string; label: string; text: string })[] = [
  {
    time: "09:00", dur: "60 min", name: "Rainbow Grocery", kind: "stop",
    street: "1745 Folsom St", place: "San Francisco", sub: "opens 9am, closes 9pm",
    maps: "https://maps.apple.com/?daddr=1745+Folsom+St,+San+Francisco,+CA",
    order: "Last order 13 Jan 2026 · prior rep Andrea Piatt",
    rep: "Michael Kelley, body care buyer · Britta Leijonflycht · (415) 863-0620",
    note: "Thirty thousand square feet, the single largest door on the list, and it was buying in January. Worker owned, so buyers hold real authority by department and there is no corporate to escalate to. Give it a full hour and go in at open, before the floor fills.",
  },
  {
    time: "10:20", dur: "40 min", name: "Other Avenues", kind: "hard", window: "Thu to Sat",
    street: "3930 Judah St", place: "San Francisco",
    maps: "https://maps.apple.com/?daddr=3930+Judah+St,+San+Francisco,+CA",
    order: "Last order 1 Dec 2025 · prior rep Andrea Piatt",
    rep: "Snail, co-owner and buyer",
    note: "Co-owner and buyer in one person, so a yes here is a yes. Lapsed since December. Outer Sunset co-op, so sourcing and labor practice will matter more than margin.",
  },
  {
    time: "11:20", dur: "40 min", name: "Good & Healthy, Pacifica", kind: "hard", window: "Thu morning",
    street: "200 Eureka Square", place: "Pacifica",
    maps: "https://maps.apple.com/?daddr=200+Eureka+Square,+Pacifica,+CA",
    order: "Never ordered · true new business", fresh: true,
    rep: "Megan, supplement buyer",
    note: "The third and last genuine prospect. Her stated window is Thursday morning or Tuesday after 2pm; arriving at 11:20 keeps you inside it with room to spare, and missing it costs a separate trip. Full new-business pitch here, not the win-back.",
  },
  {
    break: true, time: "12:00 to 14:00", label: "Midday stop · Half Moon Bay",
    text: "Twenty minutes down Highway 1 from Pacifica puts you in Half Moon Bay with the afternoon's first stop already outside the window. Eat on the coast, then walk the New Leaf floor cold before you introduce yourself. It is the one account with no contact on file, so an unhurried look at the set, and at whether your product is still on it, is worth more here than at any other stop this week.",
  },
  {
    time: "14:00", dur: "45 min", name: "New Leaf Community Market, Half Moon Bay", kind: "gap", window: "No contact",
    street: "150 San Mateo Rd", place: "Half Moon Bay",
    maps: "https://maps.apple.com/?daddr=150+San+Mateo+Rd,+Half+Moon+Bay,+CA",
    order: "Last order 4 Dec 2025 · prior rep Andrea Piatt",
    rep: "Nobody on file. Corporate fallback: Tambra Narup, body care, (831) 466-9060 ext. 114 · John Nelson, supplements",
    note: "Marked new on the trip sheet and it is not: this store bought in December. It is the only account of the sixteen with no named human, so walk in, get the supplement lead's name and schedule, and that gap closes today.",
  },
  {
    time: "15:20", dur: "40 min", name: "Mollie Stone's, Burlingame", kind: "stop",
    street: "1477 Chapin Ave", place: "Burlingame", sub: "over Highway 92",
    maps: "https://maps.apple.com/?daddr=1477+Chapin+Ave,+Burlingame,+CA",
    order: "Last order 5 Jan 2026 · potential rated B, big",
    rep: "Jessica, supplement buyer · Tamira Franz, corporate buyer",
    note: "Bay Area chain rated big, lapsed since January. Tamira at corporate is the real prize and Jessica is the way to her. Confirm Jessica's hours by phone earlier in the week; she schedules week to week.",
  },
  {
    time: "16:15", dur: "45 min", name: "Health by Heidi, San Mateo", kind: "hard", window: "After 4pm",
    street: "1212 W Hillsdale Blvd Ste G", place: "San Mateo", sub: "(650) 572-7100",
    maps: "https://maps.apple.com/?daddr=1212+W+Hillsdale+Blvd,+San+Mateo,+CA",
    order: "Last order 17 Nov 2025 · prior rep Andrea Piatt",
    rep: "Heidi, owner. There every day the store is open.",
    note: "A former customer who has already asked to see samples and discuss placement after 4pm. That is a reorder conversation with the decision maker, not an introduction. Best closing odds of the day, which is why she gets the last slot. Bring samples.",
  },
];

const SELLING_TO = [
  {
    kind: "Co-op · 2 doors",
    name: "Rainbow Grocery and Other Avenues",
    body: "Both worker owned, in SoMa and the Outer Sunset. Rainbow is a 30,000 square foot destination with buyers empowered by department; Other Avenues is small enough that Snail owns and buys at once.",
    who: "Co-ops interrogate sourcing, labor and ownership before price. Expect the questions and answer them straight.",
  },
  {
    kind: "Chain · 1 door today",
    name: "New Leaf Community Markets",
    body: "Half Moon Bay is one of five New Leaf doors that bought and stopped within five weeks last winter. New Leaf sits inside Good Food Holdings; store buyers exist but corporate governs the set. Tambra Narup owns body care and John Nelson owns supplements, and Nelson buys across banners from an @lazyacres.com address.",
    who: "Five doors going quiet together is a corporate-level event. Today's visit gathers evidence; the answer is at Narup and Nelson, and reaching them also reaches Lazy Acres in your own LA territory.",
  },
  {
    kind: "Regional chain · 1 door",
    name: "Mollie Stone's Markets",
    body: "Bay Area upscale grocer. You are visiting Burlingame, but HubSpot already lists San Francisco Grand Central, San Mateo, Palo Alto, San Bruno, Sausalito and Greenbrae as separate records.",
    who: "One good Burlingame meeting is a referral into Tamira Franz at corporate, and Tamira is worth six more doors.",
  },
  {
    kind: "Owner operated · 2 doors",
    name: "Good & Healthy and Health by Heidi",
    body: "Small format, owner present, no committee. Megan at Good & Healthy is a true prospect with a stated Thursday-morning window. Heidi is in her San Mateo store every day it is open and already asked to see samples.",
    who: "Shortest sales cycles of the day. Megan opens the new-business lane; Heidi is the best closing odds of the day and anchors the finish.",
  },
];

const DOT: Record<string, string> = {
  stop: "bg-[#2C6A46]",
  hard: "bg-[#9C4A1C]",
  gap: "bg-[#6B5E86]",
};

export default function SfDayPage() {
  return (
    <>
      <header className="mb-6">
        <Link
          href="/nutribiotic/plan"
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-[#5B6560] hover:text-[#14201B]"
        >
          <Ico name="route" size={13} />
          Back to the plan
        </Link>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8A928C]">
          Field brief · Thursday 30 July · 09:00 to 17:00
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-[27px] leading-tight font-semibold tracking-tight">
          San Francisco and the Peninsula
        </h1>
        <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-[#5B6560]">
          Six stops as a counterclockwise loop: city first, down the coast, back over Highway 92.
          Five are win-backs that went quiet last winter; only Good &amp; Healthy gets the
          new-business pitch. Tap any address to drive.
        </p>
      </header>

      <ol className="border-l border-[#E2DFD5]">
        {STOPS.map((s, i) =>
          "break" in s ? (
            <li key={i} className="relative pb-7 pl-5">
              <span className="absolute -left-[4.5px] top-2 h-2 w-2 rounded-full border border-[#8A928C] bg-[#F7F6F1]" />
              <div className="text-[11.5px] tabular-nums tracking-[0.04em] text-[#8A928C]">{s.time}</div>
              <div className="mt-1 border-y border-dashed border-[#B9BFB9] py-2.5">
                <div className="text-[10.5px] font-medium uppercase tracking-[0.12em]">{s.label}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5B6560]">{s.text}</p>
              </div>
            </li>
          ) : (
            <li key={i} className="relative pb-7 pl-5">
              <span className={`absolute -left-[4.5px] top-2 h-2 w-2 rounded-full ${DOT[s.kind]}`} />
              <div className="text-[11.5px] tabular-nums tracking-[0.04em] text-[#8A928C]">
                {s.time} · {s.dur}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-[family-name:var(--font-fraunces)] text-[17.5px] font-semibold leading-snug tracking-tight">
                  {s.name}
                </span>
                {s.window && (
                  <span className="rounded bg-[#F5E7DE] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.09em] text-[#9C4A1C]">
                    {s.window}
                  </span>
                )}
              </div>

              <a
                href={s.maps}
                className="mt-2 flex items-center justify-between gap-3 rounded-md border border-[#DCE5DD] bg-[#E4EDE6] px-3.5 py-3 transition-opacity hover:opacity-90"
              >
                <span className="text-[13.5px] leading-snug text-[#14201B]">
                  {s.street}, {s.place}
                  {s.sub && <span className="block text-[11.5px] text-[#5B6560]">{s.sub}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 rounded bg-[#2C6A46] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
                  <Ico name="pin" size={12} />
                  Drive
                </span>
              </a>

              <div
                className={`mt-2 text-[11.5px] tabular-nums ${s.fresh ? "text-[#2C6A46]" : "text-[#5B6560]"}`}
              >
                {s.order}
              </div>
              <div className="mt-1 text-[13.5px]">{s.rep}</div>
              <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-[#5B6560]">{s.note}</p>
            </li>
          ),
        )}
      </ol>

      <section className="mt-8">
        <div className="mb-4 border-b-2 border-[#14201B] pb-2">
          <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
            Who you are actually selling to
          </h2>
          <p className="text-[13px] text-[#5B6560]">
            Four business types on today's loop, and each one decides differently.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {SELLING_TO.map((c) => (
            <Card key={c.name} className="p-4">
              <div className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#2C6A46]">
                {c.kind}
              </div>
              <div className="mt-0.5 font-[family-name:var(--font-fraunces)] text-[15.5px] font-semibold tracking-tight">
                {c.name}
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5B6560]">{c.body}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#14201B]">{c.who}</p>
            </Card>
          ))}
        </div>
      </section>

      <p className="mt-6 text-[11.5px] leading-relaxed text-[#8A928C]">
        Arrival times are planned from stop durations and estimated drive legs, not live traffic.
        Buyer emails live on the HubSpot records.
      </p>
    </>
  );
}
