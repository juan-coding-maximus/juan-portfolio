/**
 * NutriBiotic OS · route widget (Scriptable / WidgetKit).
 *
 * This file is PUBLIC. It holds no secret and no customer data: the bootstrap
 * script on Juan's phone holds the bearer token and passes it in as `NB`, and
 * every account fact is fetched at render time from /nutribiotic/api/widget.
 * Hosting it here rather than pasting it into Scriptable means the widget is
 * updated by a deploy, not by retyping a script in a parking lot.
 *
 * WHAT IT DRAWS is the hand-built route exactly as /nutribiotic/map shows it:
 * same stops, same order, same trading facts, same straight-line legs. Nothing
 * is recomputed here. A missing fact renders as absent, never as a zero.
 *
 * Expected globals, supplied by the bootstrap:
 *    NB.base   e.g. "https://juanarenas.bio"
 *    NB.token  the NB_SESSION_SECRET bearer
 */

const INK = Color.dynamic(new Color("#14201B"), new Color("#F2F1EA"));
const MUTED = Color.dynamic(new Color("#5B6560"), new Color("#A7AFA9"));
const FAINT = Color.dynamic(new Color("#8A928C"), new Color("#78817B"));
const PAPER = Color.dynamic(new Color("#F7F6F1"), new Color("#121815"));
const RULE = Color.dynamic(new Color("#E2DFD5"), new Color("#2A332E"));
const GREEN = Color.dynamic(new Color("#2C6A46"), new Color("#63A57E"));
const AMBER = Color.dynamic(new Color("#A0762C"), new Color("#C9A24B"));
const RED = new Color("#B5372A");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function usd(n) {
  if (n === null || n === undefined) return null;
  if (n >= 10000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** "2026-03-27" -> "Mar 2026". Split on parts, never new Date(): a bare date
 *  parses as UTC midnight and renders the previous month in Los Angeles. */
function monthYear(iso) {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : iso;
}

function txt(on, s, { size = 12, color = INK, bold = false, lines = 1, opacity } = {}) {
  const t = on.addText(s);
  t.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = lines;
  if (opacity !== undefined) t.textOpacity = opacity;
  return t;
}

/** The numbered chip: a circle for an account, a square for lunch/hotel/other,
 *  the same shape-and-colour agreement the map and the route list already keep. */
function chip(on, stop, size) {
  const box = on.addStack();
  box.size = new Size(size, size);
  box.cornerRadius = stop.type === "custom" ? size * 0.28 : size / 2;
  box.backgroundColor = stop.type === "custom" ? AMBER : INK;
  box.centerAlignContent();
  const t = box.addText(String(stop.n));
  t.font = Font.semiboldSystemFont(size * 0.52);
  t.textColor = PAPER;
  return box;
}

/** The one money line a stop gets on a phone held at arm's length.
 *
 *  ONE FIGURE, NOT THE PANEL'S THREE, and which one is a judgement the panel
 *  does not have to make: an account that has bought this year is described by
 *  what it bought this year, and one that has not is described by its lifetime,
 *  with the last-order month right beside it saying how long ago that was.
 *  A trailing-12m of exactly $0 is a real value and falls to the lifetime arm
 *  rather than rendering as "12m $0", which reads as a dead account next to a
 *  date that already says so. Absent stays absent; nothing here shows a zero
 *  in place of a fact we do not hold. */
function moneyLine(stop) {
  const bits = [stop.last_order_at ? monthYear(stop.last_order_at) : "never ordered"];
  if (stop.trailing_12m_revenue) bits.push(`12m ${usd(stop.trailing_12m_revenue)}`);
  else if (stop.lifetime_revenue) bits.push(`life ${usd(stop.lifetime_revenue)}`);
  return bits.join("  ·  ");
}

function tierLabel(stop) {
  if (stop.type === "custom") return (stop.kind || "stop").toUpperCase();
  return stop.tier ? `TIER ${stop.tier}` : null;
}

/**
 * The three things a stop is for (Juan, 2026-08-14): drive to it, call it, read
 * it. Explicit buttons rather than one whole-row tap, because "GO" and "who is
 * this again" are different intentions and a widget that guesses between them
 * gets one of them wrong every time.
 *
 * ON EVERY VISIBLE STOP (Juan, 2026-08-14, looking at it on the phone). The
 * first cut put them on the hero only, reasoning that twelve tap targets would
 * shrink below the 44pt a thumb needs in a moving car. On the actual screen
 * there is room: four stops with a compact row each still clear that, and the
 * decision "call this one before driving" is one you make about stop 3 as often
 * as about stop 1.
 *
 * `compact` trades 2pt of padding and half a point of type for the fourth row
 * fitting. It is only used where four rows have to coexist.
 *
 * A button whose fact is missing is not drawn. There is no greyed-out Call on
 * an account with no phone on file: an unusable control reads as a broken app,
 * and its absence already says "no number here" to anyone who would have tapped.
 */
function actionRow(on, stop, { compact = false } = {}) {
  const row = on.addStack();
  row.centerAlignContent();

  const pill = (label, url, filled) => {
    const b = row.addStack();
    b.url = url;
    b.centerAlignContent();
    if (compact) b.setPadding(4, 8, 4, 8);
    else b.setPadding(6, 10, 6, 10);
    b.cornerRadius = 7;
    b.backgroundColor = filled ? GREEN : Color.dynamic(new Color("#ECEAE1"), new Color("#232C27"));
    const t = b.addText(label);
    t.font = Font.semiboldSystemFont(compact ? 10.5 : 11.5);
    t.textColor = filled ? new Color("#FFFFFF") : INK;
    row.addSpacer(compact ? 5 : 6);
  };

  pill("GO", stop.maps_url, true);
  if (stop.call_url) pill("Call", stop.call_url, false);
  if (stop.account_url) pill(compact ? "Account" : "See account", stop.account_url, false);
  row.addSpacer();
  return row;
}

/**
 * How old what you are reading is.
 *
 * iOS decides when a widget redraws, not the script, so the honest thing a
 * widget can do about staleness is show it rather than promise freshness it
 * does not control. Server time from the payload, not the phone's clock at
 * render: it answers "when was this route actually read", which is the question.
 */
function stamp(w, data) {
  const at = new Date(data.generated_at);
  const t = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  txt(w, `as of ${t}`, { size: 9.5, color: FAINT });
}

function header(w, data, { compact = false } = {}) {
  const row = w.addStack();
  row.centerAlignContent();
  txt(row, "ROUTE", { size: compact ? 9 : 10, color: FAINT, bold: true });
  row.addSpacer();
  const right =
    data.count === 0
      ? "empty"
      : data.total_straight_line_miles
        ? `${data.count} stops · ${Math.round(data.total_straight_line_miles)} mi`
        : `${data.count} stop${data.count === 1 ? "" : "s"}`;
  txt(row, right, { size: compact ? 9 : 10, color: FAINT });
}

function divider(w) {
  const d = w.addStack();
  d.size = new Size(0, 1);
  d.backgroundColor = RULE;
  d.addSpacer();
}

/* -------------------------------------------------------------------- small */
/* One stop, big. The question a small widget answers is "where am I going
   next", and any second stop on it makes the first one unreadable. */
function renderSmall(w, data) {
  header(w, data, { compact: true });
  w.addSpacer(6);

  const s = data.stops[0];
  if (!s) return renderEmpty(w);

  const top = w.addStack();
  top.centerAlignContent();
  chip(top, s, 20);
  top.addSpacer(6);
  const tier = tierLabel(s);
  if (tier) txt(top, tier, { size: 9, color: s.type === "custom" ? AMBER : GREEN, bold: true });

  w.addSpacer(5);
  txt(w, s.name, { size: 15, bold: true, lines: 2 });
  const where = s.city || s.address;
  if (where) txt(w, where, { size: 11, color: MUTED, lines: 1 });

  w.addSpacer();
  if (s.type === "account") txt(w, moneyLine(s), { size: 10, color: FAINT, lines: 1 });
  if (data.count > 1) txt(w, `then ${data.count - 1} more`, { size: 10, color: FAINT });
  w.url = s.maps_url;
}

/* ------------------------------------------------------------------- medium */
/* The next stop with its facts, then the two after it as a peek ahead. */
function renderMedium(w, data) {
  header(w, data);
  if (data.count === 0) return renderEmpty(w);
  w.addSpacer(7);

  const s = data.stops[0];
  const top = w.addStack();
  top.centerAlignContent();
  chip(top, s, 22);
  top.addSpacer(8);

  const col = top.addStack();
  col.layoutVertically();
  const nameRow = col.addStack();
  nameRow.centerAlignContent();
  txt(nameRow, s.name, { size: 15, bold: true });
  const tier = tierLabel(s);
  if (tier) {
    nameRow.addSpacer(6);
    txt(nameRow, tier, { size: 9, color: s.type === "custom" ? AMBER : GREEN, bold: true });
  }
  const sub = [s.address, s.city].filter(Boolean).join(", ");
  if (sub) txt(col, sub, { size: 11, color: MUTED });
  if (s.type === "account") {
    const cat = s.top_category_12m || s.top_category_lifetime;
    const line = [moneyLine(s), cat].filter(Boolean).join("  ·  ");
    txt(col, line, { size: 10, color: FAINT });
  }
  top.addSpacer();

  w.addSpacer(8);
  actionRow(w, s);

  const rest = data.stops.slice(1, 3);
  if (rest.length) {
    w.addSpacer(8);
    divider(w);
    w.addSpacer(6);
    for (const r of rest) {
      const row = w.addStack();
      row.centerAlignContent();
      chip(row, r, 15);
      row.addSpacer(6);
      txt(row, r.name, { size: 11.5, color: MUTED });
      row.addSpacer();
      if (r.straight_line_miles_from_prev !== null)
        txt(row, `${r.straight_line_miles_from_prev} mi`, { size: 10, color: FAINT });
      row.url = r.maps_url;
      w.addSpacer(4);
    }
  }
  w.addSpacer();
  stamp(w, data);
  w.url = `${NB.base}/nutribiotic/map`;
}

/* -------------------------------------------------------------------- large */
/* Four stops, each with the facts that decide it at the curb and its own GO,
   Call and Account. Type and padding are tuned down from the medium family for
   one reason: four button rows have to fit a fixed canvas that cannot scroll,
   and a fourth stop clipped off the bottom is worse than a slightly smaller
   third one. */
function renderLarge(w, data) {
  header(w, data);
  if (data.count === 0) return renderEmpty(w);
  w.addSpacer(6);

  /* FOUR (Juan, 2026-08-14), and four is the end of it: a widget cannot scroll.
     WidgetKit renders a static snapshot whose only interaction is a tap target,
     so there is no fifth stop hiding below the fold to reach for. Four is what
     the widget IS, and the footer says how many it is not showing and where the
     rest live, rather than implying a gesture that does nothing. */
  const shown = data.stops.slice(0, 4);
  shown.forEach((s, i) => {
    if (i > 0) {
      w.addSpacer(4);
      divider(w);
      w.addSpacer(4);
    }
    const row = w.addStack();
    row.topAlignContent();
    chip(row, s, 18);
    row.addSpacer(7);

    const col = row.addStack();
    col.layoutVertically();
    const nameRow = col.addStack();
    nameRow.centerAlignContent();
    txt(nameRow, s.name, { size: 12.5, bold: true });
    const tier = tierLabel(s);
    if (tier) {
      nameRow.addSpacer(5);
      txt(nameRow, tier, { size: 8.5, color: s.type === "custom" ? AMBER : GREEN, bold: true });
    }
    const sub = [s.address, s.city].filter(Boolean).join(", ");
    if (sub) txt(col, sub, { size: 9.5, color: MUTED });
    if (s.type === "account") {
      const cat = s.top_category_12m || s.top_category_lifetime;
      txt(col, [moneyLine(s), cat].filter(Boolean).join("  ·  "), { size: 9.5, color: FAINT });
    }

    row.addSpacer();
    if (s.straight_line_miles_from_prev !== null)
      txt(row, `${s.straight_line_miles_from_prev} mi`, { size: 9.5, color: FAINT });

    /* Buttons on every visible stop (Juan, 2026-08-14). No whole-row tap any
       more: with an explicit GO on the row, a second invisible one covering the
       text is a target you hit by accident, never on purpose. */
    w.addSpacer(5);
    const actions = w.addStack();
    actions.addSpacer(25); // clears the number chip, so the pills line up under the name
    actionRow(actions, s, { compact: true });
  });

  /* The rest of the day, as a tap rather than a scroll that cannot exist. Its
     own target, not just a line of text: the sentence "4 of 9" is only useful
     next to the thing that shows you the other five. */
  if (data.count > shown.length) {
    w.addSpacer(7);
    divider(w);
    w.addSpacer(6);
    const more = w.addStack();
    more.centerAlignContent();
    more.url = `${NB.base}/nutribiotic/map`;
    txt(more, `${data.count - shown.length} more stop${data.count - shown.length === 1 ? "" : "s"}`, {
      size: 11,
      color: GREEN,
      bold: true,
    });
    more.addSpacer(5);
    txt(more, "open the route", { size: 11, color: FAINT });
    more.addSpacer();
  }
  w.addSpacer();
  stamp(w, data);
  w.url = `${NB.base}/nutribiotic/map`;
}

/* -------------------------------------------------- lock screen (rectangular) */
function renderAccessory(w, data) {
  const s = data.stops[0];
  if (!s) {
    txt(w, "No route", { size: 13, bold: true });
    txt(w, "built by hand on the map", { size: 11 });
    w.url = `${NB.base}/nutribiotic/map`;
    return;
  }
  txt(w, `${s.n}. ${s.name}`, { size: 13, bold: true, lines: 1 });
  const sub = s.city || s.address;
  if (sub) txt(w, sub, { size: 11, lines: 1, opacity: 0.7 });
  if (data.count > 1) txt(w, `+${data.count - 1} more`, { size: 11, opacity: 0.6 });
  w.url = s.maps_url;
}

function renderEmpty(w) {
  w.addSpacer(4);
  txt(w, "No stops yet", { size: 14, bold: true });
  txt(w, "Add them from the map. The list stays until you clear it.", {
    size: 11,
    color: MUTED,
    lines: 3,
  });
  w.addSpacer();
  w.url = `${NB.base}/nutribiotic/map`;
}

/* An unreachable OS says so. It never shows a stale route as if it were live,
   because a widget you cannot tell is stale is worse than one that is blank. */
function renderError(w, message, accessory) {
  txt(w, "Route unavailable", { size: accessory ? 13 : 14, bold: true, color: accessory ? INK : RED });
  txt(w, message, { size: 11, color: MUTED, lines: accessory ? 1 : 3 });
  w.url = `${NB.base}/nutribiotic/map`;
}

async function fetchRoute() {
  const req = new Request(`${NB.base}/nutribiotic/api/widget`);
  req.headers = { Authorization: `Bearer ${NB.token}` };
  req.timeoutInterval = 20;
  const data = await req.loadJSON();
  if (!data || data.ok !== true) throw new Error(data?.error || "Bad response");
  return data;
}

const family = config.widgetFamily || "medium";
const accessory = family.startsWith("accessory");

const widget = new ListWidget();
if (!accessory) {
  widget.backgroundColor = PAPER;
  widget.setPadding(13, 14, 13, 14);
}
/* AS SOON AS iOS WILL ALLOW (Juan asked for instant, 2026-08-14).
 *
 * This is a request, not a schedule. WidgetKit treats refreshAfterDate as "not
 * before this", then decides for itself using a daily budget it allocates per
 * widget, so asking for one minute does not buy sixty refreshes an hour, it
 * just guarantees the widget is always eligible the moment the system is
 * willing. Two minutes is the floor worth asking for; in practice expect a
 * redraw every few minutes, sooner right after you have used the phone.
 *
 * Which is exactly why stamp() prints the read time on the widget. A widget
 * that cannot promise freshness should at least never hide staleness. */
widget.refreshAfterDate = new Date(Date.now() + 2 * 60 * 1000);

try {
  const data = await fetchRoute();
  if (accessory) renderAccessory(widget, data);
  else if (family === "small") renderSmall(widget, data);
  else if (family === "large" || family === "extraLarge") renderLarge(widget, data);
  else renderMedium(widget, data);
} catch (e) {
  renderError(widget, String(e.message || e), accessory);
}

if (config.runsInWidget) Script.setWidget(widget);
else if (family === "small") await widget.presentSmall();
else if (family === "large") await widget.presentLarge();
else await widget.presentMedium();
Script.complete();
