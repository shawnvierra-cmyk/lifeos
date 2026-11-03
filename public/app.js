// LifeOS web app. Plain ES module, no build step.
"use strict";

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const todayStr = () => ymd(new Date());
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
const fmtDay = (s) => parseYmd(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtMin = (m) => (m == null ? "–" : `${Math.floor(m / 60)}h ${pad(Math.round(m % 60))}m`);
const num = (v) => (v === null || v === undefined || v === "" || isNaN(+v) ? null : +v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const round = (v, p = 0) => (v == null ? null : Math.round(v * 10 ** p) / 10 ** p);
const rid = (n = 16) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("");
const mediaUrl = (id) => `/api/media/${encodeURIComponent(id)}`;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
const icon = (p, s = 24) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  today: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  health: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  trips: '<path d="M2 16l20-8-6 12-3-5-5-1z"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  notes: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  train: '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
};

/* ---------- theme ---------- */
function applyTheme() {
  const pref = store.get("lifeos.theme") || "system";
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme; else root.dataset.theme = pref;
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const m = document.querySelector("meta[name=theme-color]"); if (m) m.content = dark ? "#0B0B0A" : "#F2F3EF";
}
applyTheme();
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch {}

/* ---------- API ---------- */
async function api(path, { method = "GET", body, headers = {}, raw } = {}) {
  const opts = { method, headers: { ...headers }, credentials: "same-origin" };
  if (method !== "GET") opts.headers["x-lifeos"] = "1";
  if (body !== undefined) {
    if (raw) opts.body = body;
    else { opts.body = JSON.stringify(body); opts.headers["content-type"] = "application/json"; }
  }
  const res = await fetch("/api/" + path, opts);
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && !path.startsWith("auth/")) { showAuth(); throw new Error("Sign in first."); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- state ---------- */
const S = {
  tab: (() => { const t = store.get("lifeos.tab") || "today"; return ["today", "health", "training", "trips", "more"].includes(t) ? t : "today"; })(), tripSeg: "upcoming", moreView: null,
  workouts: [], routines: [],
  loaded: false, settings: null,
  days: new Map(), trips: [], notes: [],
  cal: { status: "idle", events: [], fetchedAt: null, error: null, connected: false },
};

/* ---------- sample data (never saved) ---------- */
const SAMPLE = (() => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const days = new Map(); const t0 = new Date();
  for (let i = 20; i >= 0; i--) {
    const d = ymd(addDays(t0, -i)); const w = Math.sin(i / 3);
    const s = {
      apple: { steps: Math.round(7400 + rnd() * 5200), sleepMin: Math.round(410 + rnd() * 70), restingHr: Math.round(54 + rnd() * 5), hrv: Math.round(58 + w * 8 + rnd() * 6), avgHr: Math.round(68 + rnd() * 8),
        workouts: i % 2 ? [] : [{ type: ["Run", "Strength", "Cycling"][i % 3], min: 30 + Math.round(rnd() * 30) }] },
      oura: { readiness: Math.round(74 + w * 8 + rnd() * 8), sleepScore: Math.round(76 + rnd() * 12), hrv: Math.round(55 + w * 7 + rnd() * 6), restingHr: Math.round(53 + rnd() * 4), totalSleepMin: Math.round(415 + rnd() * 60), deepMin: Math.round(70 + rnd() * 30) },
      eight: { sleepScore: Math.round(78 + rnd() * 14), hrv: Math.round(57 + w * 7 + rnd() * 6), hrvAvg: 58, deepMin: Math.round(72 + rnd() * 28), bioAge: 36.8, totalSleepMin: Math.round(420 + rnd() * 55) },
    };
    if (i % 4 === 0) s.body = { weight: round(184.6 - (20 - i) * 0.12 + rnd() * 0.6, 1), weightUnit: "lb", bodyFat: round(18.9 - (20 - i) * 0.05 + rnd() * 0.2, 1), muscle: round(84.2 + (20 - i) * 0.03, 1), muscleUnit: "lb", metabolicAge: 37 };
    days.set(d, { date: d, sources: s, log: [] });
  }
  const iso = (n) => ymd(addDays(t0, n));
  const trips = [
    { id: "s1", type: "trip", title: "Lisbon + Sintra", place: "Lisbon, Portugal", start: iso(24), end: iso(30), journal: [] },
    { id: "s2", type: "concert", title: "Arena concert", place: "Downtown arena", start: iso(9), end: iso(9), journal: [] },
    { id: "s3", type: "trip", title: "Moab long weekend", place: "Moab, Utah", start: iso(-38), end: iso(-35), journal: [{ id: "j1", at: addDays(t0, -36).toISOString(), text: "Sunrise at Delicate Arch. Legs fresh, 11 miles on Slickrock.", media: [] }] },
    { id: "s4", type: "event", title: "Half marathon", place: "Park City, Utah", start: iso(-61), end: iso(-61), journal: [] },
  ];
  return { days, trips };
})();

/* ---------- derived ---------- */
const realDays = () => S.days.size > 0;
const daysSrc = () => S.days;
const tripsSrc = () => S.trips;
const SRC = [{ key: "apple", label: "Apple Health" }, { key: "oura", label: "Oura" }, { key: "eight", label: "Eight Sleep" }];
const sortedDays = (map) => [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
function series(map, src, field, n = 14) {
  const out = []; const t = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(num(map.get(ymd(addDays(t, -i)))?.sources?.[src]?.[field]));
  return out;
}
function latestFor(map, src) {
  const list = sortedDays(map).filter((d) => d.sources?.[src] && Object.keys(d.sources[src]).length);
  return list.length ? list[list.length - 1] : null;
}
function baseline(map, src, field, excludeDate) {
  const t = new Date(); const vals = [];
  for (let i = 1; i <= 30; i++) { const d = ymd(addDays(t, -i)); if (d !== excludeDate) vals.push(num(map.get(d)?.sources?.[src]?.[field])); }
  return avg(vals);
}
function sourceScore(map, key) {
  const t = todayStr(), y = ymd(addDays(new Date(), -1));
  const day = [t, y].map((d) => map.get(d)).find((d) => d?.sources?.[key] && Object.keys(d.sources[key]).length);
  if (!day) return { score: null, day: null };
  const s = day.sources[key];
  if (key === "oura") return { score: num(s.readiness) ?? num(s.sleepScore), day: day.date };
  if (key === "eight") return { score: num(s.sleepScore), day: day.date };
  // Apple Health has no single score: blend sleep, HRV and resting HR against your own 30-day baseline.
  const parts = [];
  if (num(s.sleepMin) != null) parts.push(clamp((s.sleepMin / 480) * 100, 0, 100));
  const bh = baseline(map, "apple", "hrv", day.date), br = baseline(map, "apple", "restingHr", day.date);
  if (num(s.hrv) != null) parts.push(bh ? clamp(75 + (s.hrv / bh - 1) * 150, 0, 100) : 75);
  if (num(s.restingHr) != null) parts.push(br ? clamp(75 + ((br - s.restingHr) / br) * 300, 0, 100) : 75);
  return { score: parts.length ? Math.round(avg(parts)) : null, day: day.date };
}
function readiness(map) {
  const per = SRC.map((s) => ({ ...s, ...sourceScore(map, s.key) }));
  const live = per.filter((p) => p.score != null);
  return { per, score: live.length ? Math.round(avg(live.map((p) => p.score))) : null };
}
function bodyLatest(map) {
  const b = latestFor(map, "body"); const e = latestFor(map, "eight");
  const bioE = e && num(e.sources.eight.bioAge) != null ? { v: e.sources.eight.bioAge, from: "Eight Sleep", day: e.date } : null;
  const bioS = b && num(b.sources.body.metabolicAge) != null ? { v: b.sources.body.metabolicAge, from: "Scale metabolic age", day: b.date } : null;
  return {
    bio: bioE || bioS,
    weight: b && num(b.sources.body.weight) != null ? { v: b.sources.body.weight, unit: b.sources.body.weightUnit || "lb", day: b.date } : null,
    fat: b && num(b.sources.body.bodyFat) != null ? { v: b.sources.body.bodyFat, day: b.date } : null,
  };
}
function bestMove(map, r) {
  const sc = r.score; let head, body;
  if (sc == null) { head = "Lean into a fresh start"; body = "Drop a screenshot from Oura, Eight Sleep, Health or your scale and your readiness lights up."; }
  else if (sc >= 85) { head = "Primed. Go big today"; body = "Lean into your hardest session: intervals, a heavy lift or a long run."; }
  else if (sc >= 70) { head = "Ready to build"; body = "Lean into a solid workout at steady effort, then protect tonight's bedtime."; }
  else if (sc >= 55) { head = "Keep momentum easy"; body = "Lean into zone 2, a walk in the sun and 10 minutes of mobility."; }
  else { head = "Recharge and reload"; body = "Lean into a long walk, extra water and an early night. It sets up a big tomorrow."; }
  const sigs = [];
  for (const k of ["oura", "eight", "apple"]) {
    const d = latestFor(map, k); if (!d) continue; const s = d.sources[k];
    if (num(s.hrv) != null) { const b = baseline(map, k, "hrv", d.date); if (b && s.hrv > b) sigs.push({ w: s.hrv / b, t: `HRV ${Math.round(s.hrv)} ms, ${Math.round((s.hrv / b - 1) * 100)}% above your average` }); }
    if (num(s.deepMin) != null && s.deepMin >= 75) sigs.push({ w: 1 + s.deepMin / 1000, t: `${s.deepMin} min of deep sleep last night` });
    const sl = num(s.totalSleepMin) ?? num(s.sleepMin); if (sl != null && sl >= 420) sigs.push({ w: 1 + sl / 10000, t: `${fmtMin(sl)} of sleep` });
  }
  sigs.sort((a, b) => b.w - a.w);
  return { head, body, sig: sigs[0]?.t };
}
function spark(vals, h = 56) {
  const pts = vals.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  if (pts.length < 2) return `<div class="small muted">The trend appears after two days of data.</div>`;
  const W = 300, H = h, P = 6; const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const x = (i) => P + (i * (W - 2 * P)) / (vals.length - 1), y = (v) => H - P - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (H - 2 * P);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${x(pts.at(-1).i).toFixed(1)},${H}L${x(pts[0].i).toFixed(1)},${H}Z`; const e = pts.at(-1);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="14 day trend"><path d="${area}" style="fill:var(--volt)" opacity=".55"/><path d="${line}" fill="none" style="stroke:var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${x(e.i)}" cy="${y(e.v)}" r="4" style="fill:var(--ink)"/></svg>`;
}

/* ---------- auth ---------- */
let authStatus = null;
async function showAuth(mode) {
  $("#shell").hidden = true; const a = $("#auth"); a.hidden = false;
  if (!authStatus) authStatus = await api("auth/status").catch(() => ({ firstUser: false, signupsOpen: true }));
  if (!mode) mode = authStatus.firstUser ? "signup" : "login";
  const needInvite = !authStatus.firstUser;
  a.innerHTML = `<form class="auth" id="authForm" novalidate>
    <h1 class="logo">Life<span>OS</span></h1>
    <p class="lead">${mode === "login" ? "Sign in to your readiness dashboard." : authStatus.firstUser ? "Create the owner account. Sign-ups close after this." : "Create your private LifeOS account."}</p>
    <div class="field"><label class="label" for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" required></div>
    <div class="field"><label class="label" for="aPw">Password</label><input id="aPw" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="10" required></div>
    ${mode === "signup" && needInvite ? `<div class="field"><label class="label" for="aInvite">Invite code</label><input id="aInvite" autocomplete="off" required></div>` : ""}
    <div class="err" id="aErr" role="alert"></div>
    <div class="actions"><button class="btn volt wide" type="submit">${mode === "login" ? "Sign in" : "Create account"}</button></div>
    ${authStatus.signupsOpen ? `<p class="small muted" style="text-align:center;margin-top:14px">${mode === "login" ? `New here? <button type="button" class="link" id="aSwap">Create an account</button>` : `Have an account? <button type="button" class="link" id="aSwap">Sign in</button>`}</p>` : ""}
  </form>`;
  const swap = $("#aSwap"); if (swap) swap.onclick = () => showAuth(mode === "login" ? "signup" : "login");
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault(); const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; $("#aErr").textContent = "";
    try {
      const body = { email: $("#aEmail").value, password: $("#aPw").value, tz: TZ };
      if (mode === "signup" && $("#aInvite")) body.invite = $("#aInvite").value;
      await api(`auth/${mode}`, { method: "POST", body });
      authStatus = null;
      store.set("lifeos.hasAccount", "1"); a.hidden = true; boot();
    } catch (er) { $("#aErr").textContent = er.message; btn.disabled = false; }
  };
}

/* ---------- render ---------- */
const TABS = [["today", "Today", I.today], ["health", "Health", I.health], ["training", "Training", I.train], ["trips", "Trips", I.trips], ["more", "More", I.more]];
function renderTabs() { $("#tabs").innerHTML = TABS.map(([k, l, p]) => `<button data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ""}><span class="pip">${icon(p)}</span>${l}</button>`).join(""); }
function header(eyebrow, title, right = "") {
  $("#top").innerHTML = `<div style="min-width:0"><div class="eyebrow">${esc(eyebrow)}</div><h1 class="h1">${esc(title)}</h1></div><div style="display:flex;gap:8px;align-items:center">${right}<button class="iconbtn" data-act="settings" aria-label="Settings">${icon(I.gear, 20)}</button></div>`;
}
const sampleBanner = () => "";
function render() {
  if (!S.loaded) return;
  renderTabs(); store.set("lifeos.tab", S.tab);
  if (S.tab === "more") return (S.moreView === "cal" ? vCal : S.moreView === "notes" ? vNotes : vMore)();
  ({ today: vToday, health: vHealth, training: vTraining, trips: vTrips })[S.tab]();
}

function vToday() {
  const map = daysSrc(); const isSample = false;
  const r = readiness(map); const b = bodyLatest(map); const mv = bestMove(map, r);
  header(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }), "Ready State");
  const live = r.per.filter((p) => p.score != null).length;
  const srcs = r.per.map((p) => (p.score != null
    ? `<div class="src on"><div class="num n">${p.score}</div><div class="k">${p.label}</div></div>`
    : `<div class="src"><div class="w">Waiting</div><div class="k">${p.label}</div></div>`)).join("");
  const tile = (lbl, v, unit, from) => `<div class="card"><div class="label">${lbl}</div>${v != null
    ? `<div class="num">${v}<span class="unit">${unit}</span></div><div class="from">${esc(from)}</div>`
    : `<div class="num" style="color:var(--wait);font-size:24px;padding-block:14px 6px">Waiting</div><div class="from">Add a screenshot</div>`}</div>`;
  const nextTrip = tripsSrc().filter((t) => (t.end || t.start) >= todayStr()).sort((a, c) => (a.start < c.start ? -1 : 1))[0];
  $("#view").innerHTML = `
    <section class="hero" aria-label="Readiness">
      <div class="label">Readiness</div>
      ${r.score != null ? `<div class="num score">${r.score}<span class="of">/100</span></div>` : `<div class="num score waiting">Waiting</div>`}
      <div class="small muted">Equal blend of ${live || "your"} connected source${live === 1 ? "" : "s"}. A source shows waiting until it has data from last night.</div>
      <div class="srcrow">${srcs}</div>
    </section>
    <section class="trio" aria-label="Body">
      ${tile("Bio age", b.bio ? round(b.bio.v, 1) : null, "yrs", b.bio ? `${b.bio.from} · ${fmtDay(b.bio.day)}` : "")}
      ${tile("Weight", b.weight ? round(b.weight.v, 1) : null, b.weight?.unit || "lb", b.weight ? fmtDay(b.weight.day) : "")}
      ${tile("Body fat", b.fat ? round(b.fat.v, 1) : null, "%", b.fat ? fmtDay(b.fat.day) : "")}
    </section>
    <section class="move" aria-label="Best next move">
      <div class="label" style="color:var(--volt-ink)">Best next move</div>
      <div class="h">${esc(mv.head)}</div><p>${esc(mv.body)}</p>
      ${mv.sig ? `<div class="sig">Strongest signal: ${esc(mv.sig)}</div>` : ""}
    </section>
    <div class="sec-h"><h2>Up next</h2><button class="link" data-go="cal">Calendar</button></div>
    <section class="card">${upcomingHtml(3)}</section>
    ${nextTrip ? `<div class="sec-h"><h2>Next adventure</h2><button class="link" data-go="trips">All trips</button></div>${tripCard(nextTrip, !S.trips.length)}` : ""}
    <button class="drop" data-act="shots" style="text-align:left"><span class="ic">${icon(I.plus)}</span><span><b>Drop health screenshots</b><span class="small muted">Oura, Eight Sleep, Health or your smart scale. Logged to the right day.</span></span></button>`;
}
function calEvents() { return S.cal.events.map((e) => ({ ...e, s: e.allDay ? parseYmd(e.start) : new Date(e.start), e: e.allDay ? parseYmd(e.end) : new Date(e.end) })); }
function upcomingHtml(n) {
  const c = S.cal;
  if (!c.connected) return `<div class="small muted">Connect Google Calendar in settings to see what's next.</div><div class="actions"><button class="btn ghost" data-act="settings">Connect</button></div>`;
  if (c.status === "loading" && !c.events.length) return `<div class="small muted"><span class="spin" style="width:14px;height:14px;vertical-align:-2px"></span> Loading your calendar…</div>`;
  const list = calEvents().filter((e) => e.e > new Date()).slice(0, n);
  if (!list.length) return `<div class="small muted">${c.error ? esc(c.error) : "Nothing else on the calendar in the next few weeks."}</div>`;
  return list.map(evRow).join("");
}
function evRow(e) {
  const day = ymd(e.s) === todayStr() ? "Today" : e.s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `<div class="ev"><div class="t">${e.allDay ? "All day" : fmtTime(e.s)}<small>${esc(day)}</small></div><div style="min-width:0"><div class="s">${esc(e.title)}</div>${e.location ? `<div class="l">${esc(e.location)}</div>` : ""}</div></div>`;
}

/* Health */
const FIELDS = {
  apple: [["steps", "Steps", "", 0], ["sleepMin", "Sleep", "min", 0], ["restingHr", "Resting HR", "bpm", 0], ["hrv", "HRV", "ms", 0], ["avgHr", "Avg HR", "bpm", 0]],
  oura: [["readiness", "Readiness", "", 0], ["sleepScore", "Sleep score", "", 0], ["hrv", "HRV", "ms", 0], ["restingHr", "Resting HR", "bpm", 0], ["totalSleepMin", "Sleep", "min", 0], ["deepMin", "Deep", "min", 0], ["steps", "Steps", "", 0]],
  eight: [["sleepScore", "Sleep score", "", 0], ["hrv", "HRV", "ms", 0], ["hrvAvg", "HRV average", "ms", 0], ["deepMin", "Deep sleep", "min", 0], ["bioAge", "Bio age", "yrs", 1], ["totalSleepMin", "Sleep", "min", 0], ["restingHr", "Resting HR", "bpm", 0]],
  body: [["weight", "Weight", "", 1], ["bodyFat", "Body fat", "%", 1], ["muscle", "Skeletal muscle", "", 1], ["metabolicAge", "Metabolic age", "yrs", 0]],
};
const LABEL = { apple: "Apple Health", oura: "Oura", eight: "Eight Sleep", body: "Body composition" };
const fieldLabel = (src, f) => (FIELDS[src].find((x) => x[0] === f) || [0, f])[1];
function fmtField(src, f, v, s) {
  if (v == null) return null;
  if (/Min$/.test(f)) return { v: fmtMin(v), u: "" };
  if (f === "steps") return { v: Math.round(v).toLocaleString(), u: "" };
  if (f === "weight") return { v: round(v, 1), u: s.weightUnit || "lb" };
  if (f === "muscle") return { v: round(v, 1), u: s.muscleUnit || s.weightUnit || "lb" };
  const def = FIELDS[src].find((x) => x[0] === f); return { v: round(v, def?.[3] ?? 0), u: def?.[2] ?? "" };
}
function srcCard(map, key, isSample) {
  const d = latestFor(map, key);
  const pick = { apple: ["sleepMin", "hrv", "restingHr", "steps"], oura: ["readiness", "sleepScore", "hrv", "restingHr"], eight: ["sleepScore", "hrv", "deepMin", "bioAge"], body: ["weight", "bodyFat", "muscle", "metabolicAge"] }[key];
  const sparkF = { apple: "hrv", oura: "readiness", eight: "sleepScore", body: "weight" }[key];
  const recent = d && (parseYmd(todayStr()) - parseYmd(d.date)) / 864e5 <= 2;
  const st = S.settings;
  const chip = isSample ? `<span class="chip sample">Sample</span>` : d ? `<span class="chip ${recent ? "ok" : ""}">${recent ? "Synced" : "Last"} ${esc(fmtDay(d.date))}</span>` : `<span class="chip wait">Waiting</span>`;
  const how = {
    apple: `<button class="btn" data-act="apple">Import Health file</button><button class="btn ghost" data-act="shots">Screenshot</button><button class="btn ghost" data-act="settings">Daily Shortcut</button>`,
    oura: st?.oura?.connected ? `<button class="btn" data-act="ourasync">Sync now</button><button class="btn ghost" data-act="shots">Screenshot</button>` : `<button class="btn" data-act="settings">Connect Oura</button><button class="btn ghost" data-act="shots">Screenshot</button>`,
    eight: `<button class="btn" data-act="shots">Screenshot</button>`,
    body: `<button class="btn" data-act="shots">Scale screenshot</button>`,
  }[key];
  let html;
  if (!d) html = `<div class="waitbox">Waiting for your first ${LABEL[key]} data. ${key === "body" ? "Upload a smart-scale screenshot and only the numbers shown get logged." : key === "oura" ? "Connect your token for daily sync, or drop a screenshot." : "Add a screenshot or import to connect."}</div>`;
  else {
    const s = d.sources[key];
    html = `<div class="grid2">${pick.map((f) => { const x = fmtField(key, f, num(s[f]), s);
      return `<div><div class="label">${fieldLabel(key, f)}</div>${x ? `<div class="num">${x.v}<span class="unit">${x.u}</span></div>` : `<div class="small muted" style="padding-top:12px">Not in this import</div>`}</div>`; }).join("")}</div>
      ${key === "apple" && s.workouts?.length ? `<div class="small" style="margin-top:12px"><b>Workouts:</b> ${s.workouts.map((w) => esc(`${w.type} ${w.min} min`)).join(" · ")}</div>` : ""}
      ${key === "eight" && num(s.hrv) != null && num(s.hrvAvg) != null ? `<div class="small" style="margin-top:12px"><b>HRV vs your average:</b> ${s.hrv >= s.hrvAvg ? "+" : ""}${Math.round(s.hrv - s.hrvAvg)} ms</div>` : ""}
      <div class="spark"><div class="label" style="margin-bottom:4px">${fieldLabel(key, sparkF)}, 14 days</div>${spark(series(map, key, sparkF))}</div>`;
  }
  const err = key === "oura" && st?.oura?.lastError ? `<div class="small" style="color:#B3261E;margin-top:10px">${esc(st.oura.lastError)}</div>` : "";
  return `<section class="card srccard"><div class="hd"><h3>${LABEL[key]}</h3>${chip}</div>${html}${err}<div class="actions">${how}</div></section>`;
}
function vHealth() {
  const map = daysSrc(); const isSample = false;
  header("Sources", "Health", `<button class="btn volt" data-act="shots" style="height:38px">${icon(I.plus, 18)} Add</button>`);
  const bodyRows = sortedDays(map).filter((d) => d.sources?.body).reverse().slice(0, 20);
  const logs = [];
  if (realDays()) for (const d of S.days.values()) for (const l of d.log || []) logs.push({ ...l, date: d.date });
  logs.sort((a, b) => (a.at < b.at ? 1 : -1));
  $("#view").innerHTML = `
    <button class="drop" data-act="shots" style="text-align:left"><span class="ic">${icon(I.img)}</span><span><b>Drop or choose screenshots</b><span class="small muted">You can also paste. Each one is read, logged to its day, then confirmed.</span></span></button>
    ${srcCard(map, "oura", isSample)}${srcCard(map, "eight", isSample)}${srcCard(map, "apple", isSample)}${srcCard(map, "body", isSample)}
    ${bodyRows.length ? `<section class="card"><div class="label" style="margin-bottom:10px">Body composition history</div><div class="tblwrap"><table class="hist"><thead><tr><th>Day</th><th>Weight</th><th>Fat %</th><th>Muscle</th><th>Met. age</th></tr></thead><tbody>
      ${bodyRows.map((d) => { const s = d.sources.body; return `<tr><td>${esc(fmtDay(d.date))}</td><td>${s.weight ?? "–"}${s.weight != null ? " " + esc(s.weightUnit || "lb") : ""}</td><td>${s.bodyFat ?? "–"}</td><td>${s.muscle ?? "–"}</td><td>${s.metabolicAge ?? "–"}</td></tr>`; }).join("")}
    </tbody></table></div></section>` : ""}
    ${logs.length ? `<section class="card"><div class="label" style="margin-bottom:6px">Import log</div>${logs.slice(0, 20).map((l) => `<div class="kv"><span>${esc(LABEL[l.source] || l.source)} · ${esc(fmtDay(l.date))}</span><span class="muted small">${l.shot ? `<a class="link" href="${mediaUrl(l.shot)}" target="_blank" rel="noopener">${esc(l.via)}</a>` : esc(l.via)} · ${esc(new Date(l.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</span></div>`).join("")}</section>` : ""}`;
}

/* Trips */
function daysBadge(t) {
  const today = todayStr();
  if ((t.end || t.start) < today) return "";
  const d = Math.round((parseYmd(t.start) - parseYmd(today)) / 864e5);
  if (d <= 0) return `<div class="badge"><b>${t.start === today ? "Today" : "Now"}</b></div>`;
  return `<div class="badge"><b>${d} ${d === 1 ? "day" : "days"}</b><span>to go</span></div>`;
}
function coverHtml(t) {
  const pill = `<span class="pill">${esc({ trip: "Trip", concert: "Concert", event: "Event" }[t.type] || "Trip")}</span>`;
  if (t.photo?.media) return `<img src="${mediaUrl(t.photo.media)}" alt="${esc(t.title)}" style="object-position:50% ${t.photo.focus ?? 25}%" loading="lazy"><span class="credit">${esc(t.photo.credit)}</span>${pill}${daysBadge(t)}`;
  return `<div class="poster"><span class="need">Header photo needed</span><div class="pt">${esc(t.title)}</div></div>${pill}${daysBadge(t)}`;
}
function tripCard(t, isSample) {
  const today = todayStr(); const upcoming = (t.end || t.start) >= today;
  const n = (t.journal || []).length;
  const range = t.end && t.end !== t.start ? `${fmtDay(t.start)} – ${fmtDay(t.end)}` : fmtDay(t.start);
  return `<button class="trip" data-trip="${esc(t.id)}"><div class="cover">${coverHtml(t)}</div>
    <div class="meta"><div style="min-width:0"><h3>${esc(t.title)} ${isSample ? `<span class="chip sample" style="vertical-align:3px">Sample</span>` : ""}</h3><div class="small muted">${esc(t.place || "")}${t.place ? " · " : ""}${esc(range)}</div></div>${!upcoming && n ? `<div class="when"><div class="small muted">${n} entr${n === 1 ? "y" : "ies"}</div></div>` : ""}</div></button>`;
}
function calSuggestions() {
  const have = new Set(S.trips.map((t) => t.calId).filter(Boolean));
  const re = /(tour|concert|live|festival|flight|hotel|trip|vacation|game|show|race|marathon|wedding|airbnb)/i;
  return calEvents().filter((e) => re.test(e.title) && !have.has(e.id) && e.e > new Date()).slice(0, 4);
}
function vTrips() {
  const isSample = false; const list = tripsSrc(); const today = todayStr();
  header("Trips, concerts & events", "Trips", `<button class="btn volt" data-act="newtrip" style="height:38px">${icon(I.plus, 18)} New</button>`);
  const cal = S.settings?.calendar?.connected;
  const synced = S.settings?.cardsSyncedAt ? `Updated ${new Date(S.settings.cardsSyncedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "";
  const up = list.filter((t) => (t.end || t.start) >= today).sort((a, b) => (a.start < b.start ? -1 : 1));
  const past = list.filter((t) => (t.end || t.start) < today).sort((a, b) => (a.start > b.start ? -1 : 1));
  const show = S.tripSeg === "upcoming" ? up : past; const sugg = calSuggestions();
  const auto = cal
    ? `<div class="small muted" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>${S.syncing ? spinner("Building cards from your calendar…") : `Built from your calendar.${synced ? " " + esc(synced) + "." : ""}`}</span>${S.syncing ? "" : `<button class="link" data-act="synccards">Refresh</button>`}</div>`
    : `<section class="card"><div class="label">Automatic cards</div><p style="margin:8px 0 0">Connect Google Calendar and your trips, concerts and events build themselves from the flights, tickets and reservations already on it. Nothing to type in.</p><div class="actions"><button class="btn volt" data-act="settings">Connect Google Calendar</button></div></section>`;
  $("#view").innerHTML = `
    ${auto}
    <div class="seg" role="group" aria-label="Filter"><button data-seg="upcoming" aria-pressed="${S.tripSeg === "upcoming"}">Upcoming ${up.length}</button><button data-seg="past" aria-pressed="${S.tripSeg === "past"}">Past ${past.length}</button></div>
    <div class="progress" id="cardsProg" hidden><i></i></div>
    ${sugg.length && S.tripSeg === "upcoming" ? `<section class="card"><div class="label" style="margin-bottom:6px">From your calendar</div>${sugg.map((e) => `<div class="suggest"><div style="min-width:0"><div style="font-weight:600;overflow-wrap:anywhere">${esc(e.title)}</div><div class="small muted">${esc(e.s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))}${e.location ? " · " + esc(e.location) : ""}</div></div><button class="btn ghost" data-mkcard="${esc(e.id)}" style="height:36px;flex:none">Make card</button></div>`).join("")}</section>` : ""}
    ${show.length ? show.map((t) => tripCard(t, isSample)).join("") : `<div class="empty">${cal ? `No ${S.tripSeg} cards yet. Anything you add to your calendar shows up here on its own.` : `Nothing here yet.`}</div>`}`;
}

/* Calendar */
function vCal() {
  const c = S.cal;
  header(`Times in ${TZ.replace(/_/g, " ") || "your time zone"}`, "Calendar", `<button class="iconbtn" data-more="none" aria-label="Back">${icon(I.back, 20)}</button>${c.fetchedAt ? `<span class="chip">Updated ${esc(fmtTime(new Date(c.fetchedAt)))}</span>` : ""}`);
  let html;
  if (!c.connected) html = `<section class="card"><div class="label">Google Calendar</div><p>Paste your calendar's secret iCal address in settings. LifeOS refreshes it every 5 minutes and shows times in your time zone.</p><button class="btn" data-act="settings">Connect Google Calendar</button></section>`;
  else if (!c.events.length && c.status === "loading") html = `<section class="card empty"><span class="spin"></span><div style="margin-top:8px">Loading your calendar…</div></section>`;
  else if (!c.events.length) html = `<section class="card empty">${c.error ? esc(c.error) : "Nothing on your calendar for the next few weeks."}</section>`;
  else {
    const groups = new Map(); const start = todayStr();
    for (const e of calEvents()) { const k = ymd(e.s); if (k < start && e.e <= new Date()) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    html = (c.error ? `<div class="banner-sample"><span>${esc(c.error)} Showing the last copy.</span></div>` : "") +
      [...groups].map(([k, evs]) => `<section class="card"><div class="dayhead ${k === start ? "today" : ""}">${k === start ? "Today" : esc(fmtDay(k))}</div>${evs.map(evRow).join("")}</section>`).join("");
  }
  $("#view").innerHTML = html;
}

/* Notes + dictation */
let draft = store.get("lifeos.draft") || "";
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function vNotes() {
  header("Voice & notes", "Notes", `<button class="iconbtn" data-more="none" aria-label="Back">${icon(I.back, 20)}</button>`);
  $("#view").innerHTML = `
    <section class="card">
      <div class="label" style="margin-bottom:8px">New note</div>
      <textarea class="note" id="noteBox" placeholder="${SR ? "Tap Dictate, or type." : "Tap here, then the mic on your keyboard to dictate."} Review the transcript, then save.">${esc(draft)}</textarea>
      <div class="actions">
        ${SR ? `<button class="btn" data-act="dictate" id="dictBtn">${icon(I.notes, 18)} Dictate</button>` : ""}
        <button class="btn volt" data-act="savenote" id="saveNote" ${draft.trim() ? "" : "disabled"} style="flex:1">Save note</button>
        <button class="btn ghost" data-act="clearnote">Clear</button>
      </div>
      <div class="small muted" id="dictMsg" style="margin-top:8px">The box clears after each save so it's ready for the next note.</div>
    </section>
    <div class="sec-h"><h2>Saved</h2><span class="small muted">${S.notes.length}</span></div>
    <section class="card notes">${S.notes.length ? S.notes.slice(0, 100).map((n) => `<div class="n"><div class="label">${esc(new Date(n.at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</div><p>${esc(n.text)}</p></div>`).join("") : `<div class="empty">Your notes show here, newest first.</div>`}</section>`;
  const box = $("#noteBox");
  box.addEventListener("input", () => { draft = box.value; $("#saveNote").disabled = !draft.trim(); clearTimeout(box._t); box._t = setTimeout(() => store.set("lifeos.draft", draft), 400); });
}
let rec = null;
function dictate() {
  const msg = $("#dictMsg"), btn = $("#dictBtn"), box = $("#noteBox");
  if (rec) { rec.stop(); return; }
  try {
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = navigator.language || "en-US";
    const base = box.value ? box.value.trimEnd() + " " : "";
    rec.onresult = (ev) => { let t = ""; for (const r of ev.results) t += r[0].transcript; box.value = base + t; draft = box.value; $("#saveNote").disabled = !draft.trim(); };
    rec.onerror = (ev) => { msg.textContent = ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "Microphone access is off. Allow it in Settings, or use the mic on your keyboard." : "Dictation stopped. Tap Dictate to continue."; };
    rec.onend = () => { rec = null; btn.classList.remove("rec"); btn.innerHTML = `${icon(I.notes, 18)} Dictate`; store.set("lifeos.draft", draft); };
    rec.start(); btn.classList.add("rec"); btn.textContent = "Stop"; msg.textContent = "Listening… review the transcript, then save.";
  } catch { rec = null; msg.textContent = "Dictation isn't available here. Use the mic on your keyboard."; }
}

/* ---------- More ---------- */
function vMore() {
  header("Everything else", "More");
  const up = calEvents().filter((e) => e.e > new Date()).slice(0, 2);
  $("#view").innerHTML = `
    <button class="card morerow" data-more="cal"><span class="ic">${icon(I.cal)}</span><span><b>Calendar</b><span class="small muted">${S.cal.connected ? (up[0] ? `Next: ${esc(up[0].title)}` : "Nothing coming up") : "Not connected"}</span></span></button>
    <button class="card morerow" data-more="notes"><span class="ic">${icon(I.notes)}</span><span><b>Notes</b><span class="small muted">${S.notes.length} saved · dictate or type</span></span></button>
    <button class="card morerow" data-act="settings"><span class="ic">${icon(I.gear)}</span><span><b>Connections & settings</b><span class="small muted">Calendar, Oura, Apple Health, appearance</span></span></button>`;
}

/* ---------- Training ---------- */
const MILES = [["SUV", 5000], ["Elephant", 12000], ["School bus", 21000], ["City bus", 30000], ["Semi truck", 40000], ["Fire truck", 50000], ["Tank", 62000], ["Blue whale", 75000], ["Space shuttle", 90000], ["Jumbo jet", 105000]];
const fmtNum = (n) => Math.round(n).toLocaleString();
function setVol(s) { return s.done && s.weight && s.reps ? s.weight * s.reps : 0; }
function wVol(w) { return w.exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + setVol(s), 0), 0); }
function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function volumeStats() {
  const done = S.workouts.filter((w) => w.status === "done");
  const now = new Date(); const ws = weekStart(now); const lw = addDays(ws, -7); const ms = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`; const ys = `${now.getFullYear()}-`;
  const sum = (f) => done.filter(f).reduce((a, w) => a + wVol(w), 0);
  return {
    total: sum(() => true), week: sum((w) => parseYmd(w.date) >= ws), lastWeek: sum((w) => parseYmd(w.date) >= lw && parseYmd(w.date) < ws),
    month: sum((w) => w.date.startsWith(ms)), ytd: sum((w) => w.date.startsWith(ys)), sessions: done.length,
  };
}
function vTraining() {
  const v = volumeStats(); const today = todayStr();
  header(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }), "Training", `<button class="btn volt" data-act="talk" style="height:38px">${icon(I.mic, 18)} Talk</button>`);
  const next = MILES.find(([, n]) => n > v.month); const prevMile = [...MILES].reverse().find(([, n]) => n <= v.month);
  const pct = next ? Math.min(100, ((v.month - (prevMile?.[1] || 0)) / (next[1] - (prevMile?.[1] || 0))) * 100) : 100;
  const planned = S.workouts.filter((w) => w.status !== "done" && w.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const active = S.workouts.find((w) => w.status === "active");
  const recent = S.workouts.filter((w) => w.status === "done").slice(0, 6);
  const wkDelta = v.lastWeek ? Math.round(((v.week - v.lastWeek) / v.lastWeek) * 100) : null;
  $("#view").innerHTML = `
    <section class="card vol">
      <div class="label" style="color:var(--volt-text)">Lifetime volume</div>
      <div class="num big">${fmtNum(v.total)}<span class="unit">lb</span></div>
      <div class="small muted">${v.sessions ? `${fmtNum(v.total)} lb across ${v.sessions} logged session${v.sessions === 1 ? "" : "s"}.` : "Every finished workout adds its weight × reps here."}</div>
      <div class="trio3">
        <div><div class="label">This week</div><div class="num">${fmtNum(v.week)}<span class="unit">lb</span></div><div class="from">${wkDelta === null ? "" : `${wkDelta >= 0 ? "+" : ""}${wkDelta}% vs last week`}</div></div>
        <div><div class="label">This month</div><div class="num">${fmtNum(v.month)}<span class="unit">lb</span></div><div class="from">${MILES.filter(([, n]) => n <= v.month).length} of ${MILES.length} milestones</div></div>
        <div><div class="label">${new Date().getFullYear()} YTD</div><div class="num">${fmtNum(v.ytd)}<span class="unit">lb</span></div></div>
      </div>
      <div class="milehead"><span class="label">${new Date().toLocaleDateString(undefined, { month: "short" })} milestone${next ? ` · next: ${next[0]}` : " · all done"}</span><span class="small" style="color:var(--volt-text);font-weight:600">${next ? `${fmtNum(next[1] - v.month)} lb to go` : ""}</span></div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="miles">${MILES.map(([n, w]) => `<div class="mile ${w <= v.month ? "hit" : ""}"><b>${esc(n)}</b><span>${fmtNum(w)} lb</span></div>`).join("")}</div>
      <div class="small muted" style="margin-top:8px">Milestones reset on the 1st. Equivalents are approximate.</div>
    </section>
    <button class="card talk" data-act="talk"><span class="ic">${icon(I.mic)}</span><span><b>Talk to LifeOS</b><span class="small muted">Build a plan in one sentence: your time, equipment and focus. Or say what you already did and it gets logged.</span></span></button>
    <div class="sec-h"><h2>${active ? "In progress" : "Today's workout"}</h2><button class="link" data-act="newworkout">Log manually</button></div>
    ${active ? workoutRow(active) : planned.length ? planned.slice(0, 3).map(workoutRow).join("") : `<section class="card empty">No plan yet. Tap Talk and say what you want to do.</section>`}
    <div class="sec-h"><h2>Completed</h2><span class="small muted">${S.workouts.filter((w) => w.status === "done").length}</span></div>
    ${recent.length ? recent.map(workoutRow).join("") : `<section class="card empty">Finished workouts show here with their volume.</section>`}
    <div class="sec-h"><h2>Routines</h2><span class="small muted">${S.routines.length}</span></div>
    ${S.routines.length ? S.routines.map((r) => `<section class="card"><div class="small" style="color:var(--volt-text);font-weight:600">${r.exercises.length} exercise${r.exercises.length === 1 ? "" : "s"}</div><h3 style="margin:4px 0 6px;font-size:19px">${esc(r.title)}</h3><div class="small muted">${esc(r.exercises.slice(0, 4).map((e) => `${e.name} · ${e.sets.length} × ${e.targetReps || (e.sets[0]?.reps ?? "")}`).join(" · "))}</div><div class="actions"><button class="btn volt" data-routine-start="${esc(r.id)}">Start</button><button class="btn ghost" data-routine-del="${esc(r.id)}">Delete</button></div></section>`).join("") : `<section class="card empty">Save any workout as a routine to repeat it in one tap.</section>`}`;
}
function workoutRow(w) {
  const n = w.exercises.length; const setsDone = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0), sets = w.exercises.reduce((a, e) => a + e.sets.length, 0);
  const when = w.date === todayStr() ? "Today" : fmtDay(w.date);
  return `<button class="card wrow" data-session="${esc(w.id)}"><div style="min-width:0"><div class="small" style="color:var(--volt-text);font-weight:600">${esc(when)} · ${n} exercise${n === 1 ? "" : "s"}${w.status === "done" ? ` · ${fmtNum(wVol(w))} lb` : sets ? ` · ${setsDone}/${sets} sets` : ""}</div><h3 style="margin:4px 0 2px;font-size:19px">${esc(w.title)}</h3><div class="small muted">${esc(w.exercises.slice(0, 3).map((e) => e.name).join(" · "))}${n > 3 ? " · …" : ""}</div></div><span class="chip ${w.status === "done" ? "ok" : w.status === "active" ? "" : "wait"}">${w.status === "done" ? "Done" : w.status === "active" ? "Live" : "Planned"}</span></button>`;
}

/* Talk to LifeOS */
let listenRec = null;
function listen(box, onState) {
  const SRr = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SRr) { onState("none"); return null; }
  if (listenRec) { listenRec.stop(); return null; }
  try {
    const r = new SRr(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US";
    const base = box.value ? box.value.trimEnd() + " " : "";
    r.onresult = (ev) => { let t = ""; for (const x of ev.results) t += x[0].transcript; box.value = base + t; box.dispatchEvent(new Event("input")); };
    r.onerror = (ev) => onState(ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "blocked" : "error");
    r.onend = () => { listenRec = null; onState("stopped"); };
    r.start(); listenRec = r; onState("listening"); return r;
  } catch { listenRec = null; onState("error"); return null; }
}
function talkSheet(prefill = "") {
  const hasSR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  sheet(`<h2>Talk to LifeOS</h2><p class="muted">Say what you want to do, or what you did. Examples: "45 minutes, dumbbells, chest and biceps." "Did 5 by 5 squats at 225 and 3 sets of 10 pull-ups."</p>
    <textarea class="note" id="talkBox" placeholder="${hasSR ? "Tap the mic and talk, or type." : "Tap here, then the mic on your keyboard."}">${esc(prefill)}</textarea>
    <div class="actions">${hasSR ? `<button class="btn" id="talkMic">${icon(I.mic, 18)} Talk</button>` : ""}<button class="btn volt" id="talkGo" style="flex:1" ${prefill.trim() ? "" : "disabled"}>Go</button></div>
    <div class="small muted" id="talkMsg" style="margin-top:8px">${hasSR ? "The transcript shows here first so you can fix it before sending." : ""}</div>
    <div id="talkReply"></div>`, (el) => {
    const box = el.querySelector("#talkBox"), go = el.querySelector("#talkGo"), msg = el.querySelector("#talkMsg"), mic = el.querySelector("#talkMic");
    box.addEventListener("input", () => (go.disabled = !box.value.trim()));
    if (mic) mic.onclick = () => listen(box, (st) => {
      if (st === "listening") { mic.classList.add("rec"); mic.textContent = "Stop"; msg.textContent = "Listening…"; }
      else { mic.classList.remove("rec"); mic.innerHTML = `${icon(I.mic, 18)} Talk`; msg.textContent = st === "blocked" ? "Microphone is off for this site. Allow it in Settings, or use the mic on your keyboard." : st === "error" ? "Dictation stopped. Tap Talk to continue." : "Check the transcript, then Go."; }
    });
    go.onclick = async () => {
      listenRec?.stop(); const text = box.value.trim(); if (!text) return;
      go.disabled = true; go.innerHTML = `<span class="spin"></span> Thinking`;
      try {
        const r = await api("ai/assist", { method: "POST", body: { text } });
        if (r.intent === "plan_workout" && r.workout) reviewSheet({ ...r.workout, date: todayStr(), status: "planned", source: "voice" }, r.reply);
        else if (r.intent === "log_workout" && r.workout) reviewSheet({ ...r.workout, date: todayStr(), status: "done", source: "voice" }, r.reply);
        else if (r.intent === "note" && r.note) { S.notes.unshift(r.note); closeSheet(); toast("Saved to Notes."); }
        else { el.querySelector("#talkReply").innerHTML = `<p class="summary">${esc(r.reply || "Didn't catch that. Try once more.")}</p>`; go.disabled = false; go.textContent = "Go"; }
      } catch (e) { msg.textContent = e.message; go.disabled = false; go.textContent = "Go"; }
    };
    if (!prefill) box.focus();
  });
}
/* Review a drafted workout before saving */
function reviewSheet(w, reply) {
  const W = JSON.parse(JSON.stringify(w)); W.exercises = W.exercises || [];
  const draw = () => {
    const el = $("#reviewBody"); if (!el) return;
    el.innerHTML = W.exercises.map((e, i) => `<div class="ex"><div class="exh"><input class="exname" data-ex="${i}" value="${esc(e.name)}" aria-label="Exercise"><button class="link small" data-exdel="${i}">Remove</button></div>
      <div class="small muted">Target reps <input class="mini" data-target="${i}" value="${esc(e.targetReps || "")}" placeholder="8-10"> · ${e.sets.length} set${e.sets.length === 1 ? "" : "s"}
      <button class="link small" data-setadd="${i}">+ set</button>${e.sets.length ? ` <button class="link small" data-setrm="${i}">− set</button>` : ""}</div>
      ${W.status === "done" ? `<div class="sets">${e.sets.map((s, j) => `<div class="setrow"><span class="n">${j + 1}</span><input type="number" inputmode="decimal" data-w="${i}:${j}" value="${s.weight ?? ""}" placeholder="0"><span class="u">lb</span><input type="number" inputmode="numeric" data-r="${i}:${j}" value="${s.reps ?? ""}" placeholder="reps"></div>`).join("")}</div>` : ""}</div>`).join("") + `<button class="link" id="exAdd" style="margin-top:8px">+ Add exercise</button>`;
  };
  sheet(`<h2>${W.status === "done" ? "Log this?" : "Your plan"}</h2>${reply ? `<p class="muted">${esc(reply)}</p>` : ""}
    <div class="field"><label class="label" for="rvTitle">Name</label><input id="rvTitle" value="${esc(W.title)}"></div>
    ${W.durationMin ? `<div class="small muted" style="margin-top:6px">About ${W.durationMin} min</div>` : ""}
    <div id="reviewBody" style="margin-top:12px"></div>
    <div class="err" id="rvErr"></div>
    <div class="actions">${W.status === "done" ? `<button class="btn volt wide" id="rvSave">Save to completed</button>` : `<button class="btn volt" id="rvStart" style="flex:1">Start now</button><button class="btn" id="rvSave">Save for today</button>`}</div>`, (el) => {
    draw();
    el.addEventListener("input", (e) => {
      const t = e.target; const [i, j] = (t.dataset.w || t.dataset.r || "").split(":").map(Number);
      if (t.dataset.ex != null) W.exercises[+t.dataset.ex].name = t.value;
      else if (t.dataset.target != null) W.exercises[+t.dataset.target].targetReps = t.value;
      else if (t.dataset.w) W.exercises[i].sets[j].weight = t.value === "" ? null : +t.value;
      else if (t.dataset.r) W.exercises[i].sets[j].reps = t.value === "" ? null : +t.value;
    });
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.exdel != null) { W.exercises.splice(+b.dataset.exdel, 1); draw(); }
      else if (b.dataset.setadd != null) { const ex = W.exercises[+b.dataset.setadd]; const last = ex.sets.at(-1); ex.sets.push({ weight: last?.weight ?? null, reps: last?.reps ?? null, done: W.status === "done" }); draw(); }
      else if (b.dataset.setrm != null) { W.exercises[+b.dataset.setrm].sets.pop(); draw(); }
      else if (b.id === "exAdd") { W.exercises.push({ name: "", targetReps: "", sets: [{ weight: null, reps: null, done: W.status === "done" }, { weight: null, reps: null, done: W.status === "done" }, { weight: null, reps: null, done: W.status === "done" }] }); draw(); el.querySelector(`[data-ex="${W.exercises.length - 1}"]`)?.focus(); }
    });
    const save = async (start) => {
      W.title = el.querySelector("#rvTitle").value.trim() || W.title;
      W.exercises = W.exercises.filter((x) => x.name.trim());
      if (!W.exercises.length) { el.querySelector("#rvErr").textContent = "Add at least one exercise."; return; }
      if (start) W.status = "active";
      try { const r = await api("workouts", { method: "POST", body: W }); upsertWorkout(r.workout); render(); if (start) sessionSheet(r.workout.id); else { closeSheet(); toast(W.status === "done" ? `Logged. ${fmtNum(wVol(r.workout))} lb.` : "Plan saved for today."); } }
      catch (x) { el.querySelector("#rvErr").textContent = x.message; }
    };
    el.querySelector("#rvSave").onclick = () => save(false);
    el.querySelector("#rvStart")?.addEventListener("click", () => save(true));
  });
}
function upsertWorkout(w) { const i = S.workouts.findIndex((x) => x.id === w.id); if (i >= 0) S.workouts[i] = w; else S.workouts.unshift(w); S.workouts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1)); }

/* Live session: log sets */
function sessionSheet(id) {
  const w0 = S.workouts.find((x) => x.id === id); if (!w0) return;
  const W = JSON.parse(JSON.stringify(w0)); if (W.status === "planned") { W.status = "active"; W.startedAt = new Date().toISOString(); }
  let saveT; const persist = () => { clearTimeout(saveT); saveT = setTimeout(async () => { try { const r = await api("workouts", { method: "POST", body: W }); upsertWorkout(r.workout); } catch {} }, 600); };
  const done = () => W.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0), total = () => W.exercises.reduce((a, e) => a + e.sets.length, 0);
  const draw = () => {
    const el = $("#sessBody"); if (!el) return;
    $("#sessPct").textContent = total() ? `${Math.round((done() / total()) * 100)}%` : "0%";
    $("#sessVol").textContent = `${fmtNum(wVol(W))} lb`;
    el.innerHTML = W.exercises.map((e, i) => `<div class="ex"><div class="exh"><button class="exdone ${e.sets.length && e.sets.every((s) => s.done) ? "on" : ""}" data-exall="${i}" aria-label="Mark all sets">${icon(I.check, 16)}</button><input class="exname" data-ex="${i}" value="${esc(e.name)}"><button class="link small" data-exdel="${i}">Remove</button></div>
      <div class="small muted">${e.sets.filter((s) => s.done).length} of ${e.sets.length} sets${e.targetReps ? ` · target ${esc(e.targetReps)} reps` : ""}</div>
      <div class="sets"><div class="setrow head"><span>Set</span><span>Weight</span><span></span><span>Reps</span></div>
      ${e.sets.map((s, j) => `<div class="setrow ${s.done ? "done" : ""}"><button class="n" data-set="${i}:${j}">${j + 1}</button><input type="number" inputmode="decimal" data-w="${i}:${j}" value="${s.weight ?? ""}" placeholder="0"><span class="u">lb</span><input type="number" inputmode="numeric" data-r="${i}:${j}" value="${s.reps ?? ""}" placeholder="${esc(e.targetReps || "reps")}"></div>`).join("")}</div>
      <div class="actions" style="margin-top:8px"><button class="btn ghost" data-setadd="${i}" style="height:36px">+ Add set</button>${e.sets.length ? `<button class="link" data-setrm="${i}">Remove last set</button>` : ""}</div></div>`).join("") + `<button class="link" id="exAdd" style="margin-top:8px">+ Add exercise</button>`;
  };
  sheet(`<div class="sessh"><div><div class="small" style="color:var(--volt-text);font-weight:600"><span id="sessVol"></span> · ${esc(W.date === todayStr() ? "Today" : fmtDay(W.date))}</div><input id="sessTitle" class="h2in" value="${esc(W.title)}"></div><div class="num" id="sessPct" style="font-size:34px;color:var(--volt-text)"></div></div>
    ${W.note ? `<p class="small muted">${esc(W.note)}</p>` : ""}
    <div id="sessBody" style="margin-top:8px"></div>
    <div class="actions" style="margin-top:16px">${W.status !== "done" ? `<button class="btn volt wide" id="sessFinish">Finish workout</button>` : `<button class="btn wide" id="sessReopen">Reopen</button>`}<button class="btn ghost" id="sessRoutine">Save as routine</button><button class="btn ghost" id="sessDelete">Delete</button></div>`, (el) => {
    draw(); persist();
    el.querySelector("#sessTitle").addEventListener("input", (e) => { W.title = e.target.value; persist(); });
    el.addEventListener("input", (e) => {
      const t = e.target; if (!(t.dataset.w || t.dataset.r || t.dataset.ex != null)) return;
      if (t.dataset.ex != null) W.exercises[+t.dataset.ex].name = t.value;
      else { const [i, j] = (t.dataset.w || t.dataset.r).split(":").map(Number); const s = W.exercises[i].sets[j]; if (t.dataset.w) s.weight = t.value === "" ? null : +t.value; else s.reps = t.value === "" ? null : +t.value; if (s.weight && s.reps) s.done = true; }
      $("#sessVol").textContent = `${fmtNum(wVol(W))} lb`; $("#sessPct").textContent = total() ? `${Math.round((done() / total()) * 100)}%` : "0%"; persist();
    });
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.set) { const [i, j] = b.dataset.set.split(":").map(Number); const s = W.exercises[i].sets[j]; s.done = !s.done; if (s.done) { const prev = W.exercises[i].sets[j - 1]; if (s.reps == null) s.reps = prev?.reps ?? (parseInt(W.exercises[i].targetReps) || null); if (s.weight == null && prev?.weight != null) s.weight = prev.weight; } draw(); persist(); }
      else if (b.dataset.exall != null) { const ex = W.exercises[+b.dataset.exall]; const all = ex.sets.every((s) => s.done); ex.sets.forEach((s, j) => { s.done = !all; if (!all && s.reps == null) s.reps = ex.sets[j - 1]?.reps ?? (parseInt(ex.targetReps) || null); }); draw(); persist(); }
      else if (b.dataset.setadd != null) { const ex = W.exercises[+b.dataset.setadd]; const last = ex.sets.at(-1); ex.sets.push({ weight: last?.weight ?? null, reps: last?.reps ?? null, done: false }); draw(); persist(); }
      else if (b.dataset.setrm != null) { W.exercises[+b.dataset.setrm].sets.pop(); draw(); persist(); }
      else if (b.dataset.exdel != null) { W.exercises.splice(+b.dataset.exdel, 1); draw(); persist(); }
      else if (b.id === "exAdd") { W.exercises.push({ name: "", targetReps: "", sets: [{ weight: null, reps: null }, { weight: null, reps: null }, { weight: null, reps: null }] }); draw(); el.querySelector(`[data-ex="${W.exercises.length - 1}"]`)?.focus(); }
      else if (b.id === "sessFinish") {
        clearTimeout(saveT); W.status = "done"; W.completedAt = new Date().toISOString();
        if (W.startedAt) W.durationMin = Math.max(1, Math.round((Date.now() - Date.parse(W.startedAt)) / 60000));
        try { const r = await api("workouts", { method: "POST", body: W }); upsertWorkout(r.workout); closeSheet(); render(); toast(`Workout done. ${fmtNum(wVol(r.workout))} lb logged.`); } catch (x) { toast(esc(x.message)); }
      }
      else if (b.id === "sessReopen") { W.status = "active"; persist(); closeSheet(); render(); sessionSheet(W.id); }
      else if (b.id === "sessRoutine") {
        try { const r = await api("routines", { method: "POST", body: { title: W.title, exercises: W.exercises } }); S.routines.push(r.routine); render(); toast("Saved as a routine."); } catch (x) { toast(esc(x.message)); }
      }
      else if (b.id === "sessDelete") {
        if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; return; }
        clearTimeout(saveT); try { await api(`workouts/${W.id}`, { method: "DELETE", body: {} }); S.workouts = S.workouts.filter((x) => x.id !== W.id); closeSheet(); render(); toast("Workout deleted."); } catch (x) { toast(esc(x.message)); }
      }
    });
  });
}

/* ---------- sheets & toasts ---------- */
function sheet(html, onMount) {
  closeSheet();
  const s = document.createElement("div"); s.className = "scrim"; s.id = "scrim";
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  s.addEventListener("click", (e) => { if (e.target === s || e.target.closest("[data-close]")) closeSheet(); });
  document.body.appendChild(s); onMount && onMount(s.querySelector(".sheet"));
}
function closeSheet() { $("#scrim")?.remove(); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
let toastT;
function toast(msg, action) {
  $("#toast")?.remove(); clearTimeout(toastT);
  const t = document.createElement("div"); t.className = "toast"; t.id = "toast"; t.setAttribute("role", "status");
  t.innerHTML = `<span>${msg}</span>${action ? `<button>${esc(action.label)}</button>` : ""}`;
  if (action) t.querySelector("button").onclick = () => { t.remove(); action.fn(); };
  document.body.appendChild(t); toastT = setTimeout(() => t.remove(), action ? 8000 : 4000);
}
const spinner = (txt) => `<span class="spin" style="width:14px;height:14px;vertical-align:-2px"></span>&nbsp; ${txt}`;

/* ---------- data loading ---------- */
async function loadState() {
  const since = ymd(addDays(new Date(), -400));
  const d = await api(`state?tz=${encodeURIComponent(TZ)}&since=${since}`);
  // A new build went live since this page loaded: pick it up instead of running stale code.
  if (S.deploy && d.deploy && d.deploy !== S.deploy) { location.reload(); return; }
  S.deploy = d.deploy;
  S.settings = d.settings;
  S.days = new Map(d.days.map((x) => [x.date, x]));
  S.trips = d.trips; S.notes = d.notes; S.workouts = d.workouts || []; S.routines = d.routines || [];
  S.cal.connected = !!d.settings.calendar?.connected;
  S.loaded = true;
}
let calTimer;
async function loadCalendar(force = false) {
  if (!S.cal.connected) return;
  S.cal.status = "loading"; if (S.tab === "today" || (S.tab === "more" && S.moreView === "cal")) render();
  try { const d = await api(`calendar${force ? "?force=1" : ""}`); S.cal = { ...S.cal, status: "ok", events: d.events || [], fetchedAt: d.fetchedAt || null, error: d.error || null, connected: d.connected }; }
  catch (e) { S.cal = { ...S.cal, status: "error", error: e.message }; }
  if (["today", "trips"].includes(S.tab) || (S.tab === "more" && S.moreView === "cal")) render();
}
function setDay(day) { if (day) S.days.set(day.date, day); }

/* ---------- screenshots ---------- */
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file); const m = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * m); c.height = Math.round(bmp.height * m);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
  } catch { return file; }
}
async function handleShots(files) {
  files = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|png|jpe?g)$/i.test(f.name));
  for (const [i, file] of files.entries()) {
    toast(spinner(`Reading screenshot${files.length > 1 ? ` ${i + 1} of ${files.length}` : ""}…`));
    try {
      const blob = await shrink(file);
      const r = await api(`screenshot?today=${todayStr()}`, { method: "POST", body: blob, raw: true, headers: { "content-type": blob.type || "image/jpeg" } });
      if (r.logged) { setDay(r.day); render(); confirmLogged(r); }
      else if (r.needsDate) await askDate(r);
      else toast(esc(r.reason || "Nothing was logged."));
    } catch (e) { toast(esc(e.message)); }
  }
}
function confirmLogged(r) {
  const summary = Object.entries(r.fields).filter(([k]) => k !== "workouts" && !/Unit$/.test(k)).slice(0, 3)
    .map(([k, v]) => `${fieldLabel(r.source, k).toLowerCase()} ${/Min$/.test(k) ? fmtMin(v) : v}`).join(", ");
  toast(`Logged ${esc(LABEL[r.source])} · ${esc(fmtDay(r.date))}${summary ? " · " + esc(summary) : ""}`, {
    label: "Undo", fn: async () => {
      try { await api(`day/${r.date}`, { method: "PUT", body: { doc: r.prev ?? null } }); if (r.prev) S.days.set(r.date, r.prev); else S.days.delete(r.date); render(); toast("Undone."); }
      catch (e) { toast(esc(e.message)); }
    },
  });
}
function askDate(r) {
  return new Promise((resolve) => {
    sheet(`<h2>Which day?</h2><p class="muted">This ${esc(LABEL[r.source])} screenshot doesn't show a date.</p>
      ${Object.entries(r.fields).filter(([k]) => k !== "workouts").map(([k, v]) => `<div class="kv"><span>${esc(fieldLabel(r.source, k))}</span><b>${esc(v)}</b></div>`).join("")}
      <div class="field"><label class="label" for="shotDate">Day</label><input type="date" id="shotDate" value="${todayStr()}" max="${todayStr()}"></div>
      <div class="actions"><button class="btn volt wide" id="shotOk">Log it</button><button class="btn ghost wide" data-close>Skip</button></div>`, (el) => {
      el.querySelector("#shotOk").onclick = async () => {
        const date = el.querySelector("#shotDate").value; closeSheet();
        try { const x = await api("log", { method: "POST", body: { date, source: r.source, fields: r.fields, via: "Screenshot", shot: r.shot } }); setDay(x.day); render(); confirmLogged({ ...r, date, prev: x.prev }); }
        catch (e) { toast(esc(e.message)); }
        resolve();
      };
      el.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", resolve));
    });
  });
}

/* ---------- Apple Health file import ---------- */
async function importAppleXml(file, onProgress) {
  const cutoff = ymd(addDays(new Date(), -60)); const days = {};
  const D = (d) => (days[d] ||= { steps: {}, sleep: 0, hrv: [], rhr: [], hr: [], workouts: [] });
  const attr = (tag, a) => { const m = tag.match(new RegExp(`\\b${a}="([^"]*)"`)); return m ? m[1] : null; };
  const toDate = (s) => new Date(s.replace(" ", "T").replace(/ ([+-]\d\d)(\d\d)$/, "$1:$2"));
  const CH = 8 * 1024 * 1024; let carry = "";
  for (let off = 0; off < file.size; off += CH) {
    const text = carry + (await file.slice(off, off + CH).text());
    const cut = text.lastIndexOf("<"); const work = text.slice(0, cut); carry = text.slice(cut);
    const re = /<(Record|Workout)\b[^>]*>/g; let m;
    while ((m = re.exec(work))) {
      const tag = m[0]; const sd = attr(tag, "startDate"); if (!sd) continue;
      const isSleep = m[1] === "Record" && /SleepAnalysis/.test(tag);
      const day = (isSleep ? attr(tag, "endDate") : sd).slice(0, 10);
      if (day < cutoff) continue;
      if (m[1] === "Workout") { D(day).workouts.push({ type: (attr(tag, "workoutActivityType") || "").replace("HKWorkoutActivityType", "") || "Workout", min: Math.round(+attr(tag, "duration") || 0) }); continue; }
      const type = attr(tag, "type"); const v = +attr(tag, "value");
      if (type === "HKQuantityTypeIdentifierStepCount") { const src = attr(tag, "sourceName") || "x"; D(day).steps[src] = (D(day).steps[src] || 0) + (v || 0); }
      else if (type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN") D(day).hrv.push(v);
      else if (type === "HKQuantityTypeIdentifierRestingHeartRate") D(day).rhr.push(v);
      else if (type === "HKQuantityTypeIdentifierHeartRate") D(day).hr.push(v);
      else if (isSleep && /Asleep/.test(attr(tag, "value") || "")) { const ms = toDate(attr(tag, "endDate")) - toDate(sd); if (ms > 0) D(day).sleep += ms / 60000; }
    }
    onProgress(Math.min(1, (off + CH) / file.size));
  }
  return Object.entries(days).sort().map(([date, d]) => {
    const f = { date }; const st = Object.values(d.steps);
    if (st.length) f.steps = Math.round(Math.max(...st));
    if (d.sleep) f.sleepMinutes = Math.round(d.sleep);
    if (d.hrv.length) f.hrv = Math.round(avg(d.hrv)); if (d.rhr.length) f.restingHr = Math.round(avg(d.rhr)); if (d.hr.length) f.heartRate = Math.round(avg(d.hr));
    if (d.workouts.length) f.workouts = d.workouts.slice(0, 12);
    return f;
  });
}

/* ---------- uploads (chunked) ---------- */
const CHUNK = 4 * 1024 * 1024;
async function upload(file, onProgress = () => {}) {
  const id = rid(20); const total = Math.max(1, Math.ceil(file.size / CHUNK));
  let type = file.type || (/\.mov$/i.test(file.name) ? "video/quicktime" : /\.mp4$/i.test(file.name) ? "video/mp4" : /\.heic$/i.test(file.name) ? "image/heic" : "image/jpeg");
  for (let i = 0; i < total; i++) {
    await api("upload", { method: "POST", raw: true, body: file.slice(i * CHUNK, (i + 1) * CHUNK), headers: {
      "content-type": "application/octet-stream", "x-upload-id": id, "x-chunk-index": String(i), "x-chunk-total": String(total),
      "x-total-size": String(file.size), "x-content-type": type, "x-filename": encodeURIComponent(file.name || "file") } });
    onProgress((i + 1) / total);
  }
  return { id, type };
}
async function photoForUpload(file) {
  // Convert HEIC and huge photos to a 2400px JPEG so every browser can show them.
  if (!file.type.startsWith("image/") || (file.size < 3e6 && /jpe?g|png|webp/.test(file.type))) return file;
  try {
    const bmp = await createImageBitmap(file); const m = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * m); c.height = Math.round(bmp.height * m);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    return new File([b], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

/* ---------- trips: create, detail, journal, photo ---------- */
function upsertTrip(t) { const i = S.trips.findIndex((x) => x.id === t.id); if (i >= 0) S.trips[i] = t; else S.trips.push(t); }
function tripForm(t = {}) {
  sheet(`<h2>${t.id ? "Edit card" : "New card"}</h2>
    <div class="field"><label class="label" for="tTitle">Name</label><input id="tTitle" value="${esc(t.title || "")}" placeholder="Tokyo, or the artist and tour"></div>
    <div class="row2"><div class="field"><label class="label" for="tType">Type</label><select id="tType">${["trip", "concert", "event"].map((x) => `<option value="${x}" ${t.type === x ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)}</option>`).join("")}</select></div>
    <div class="field"><label class="label" for="tPlace">Where</label><input id="tPlace" value="${esc(t.place || "")}" placeholder="City or venue"></div></div>
    <div class="row2"><div class="field"><label class="label" for="tStart">Starts</label><input type="date" id="tStart" value="${esc(t.start || todayStr())}"></div>
    <div class="field"><label class="label" for="tEnd">Ends</label><input type="date" id="tEnd" value="${esc(t.end || t.start || todayStr())}"></div></div>
    <div class="err" id="tErr"></div>
    <div class="actions"><button class="btn volt wide" id="tSave">Save card</button>${t.id ? `<button class="btn ghost wide" id="tDel">Delete card</button>` : ""}</div>`, (el) => {
    el.querySelector("#tSave").onclick = async () => {
      const title = el.querySelector("#tTitle").value.trim(); if (!title) { el.querySelector("#tTitle").focus(); return; }
      try {
        const r = await api("trips", { method: "POST", body: { id: t.id, calId: t.calId, title, type: el.querySelector("#tType").value, place: el.querySelector("#tPlace").value, start: el.querySelector("#tStart").value, end: el.querySelector("#tEnd").value } });
        upsertTrip(r.trip); render(); tripDetail(r.trip.id); toast("Card saved.");
      } catch (e) { el.querySelector("#tErr").textContent = e.message; }
    };
    const del = el.querySelector("#tDel");
    if (del) del.onclick = () => {
      if (del.dataset.armed) { api(`trips/${t.id}`, { method: "DELETE", body: {} }).then(() => { S.trips = S.trips.filter((x) => x.id !== t.id); closeSheet(); render(); toast("Card deleted. It's kept in your archive."); }).catch((e) => toast(esc(e.message))); }
      else { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; }
    };
  });
}
function fmtWhen(at) {
  if (!at) return "";
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (!m) return at;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return m[4] ? `${day}\n${fmtTime(d)}` : day;
}
function guideHtml(g) {
  if (!g) return "";
  return `<section class="guide"><div class="label guide-k">${esc(g.kind || "City guide")}</div><h3>${esc(g.title)}</h3><p>${esc(g.body)}</p>${g.linkUrl ? `<a class="link" href="${esc(g.linkUrl)}" target="_blank" rel="noopener">${esc(g.linkLabel || "Open")}</a>` : ""}</section>`;
}
function tripDetail(id) {
  const isSample = false; const t = tripsSrc().find((x) => x.id === id); if (!t) return;
  const long = (s) => parseYmd(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const entries = [...(t.journal || [])].sort((a, b) => (a.at < b.at ? 1 : -1));
  const chips = [...new Set((t.place || "").split(/\s*[·,]\s*/).filter(Boolean))].slice(0, 3);
  const itin = [...(t.itinerary || [])].sort((a, b) => (a.at < b.at ? -1 : 1));
  sheet(`<div class="cover" style="border-radius:16px;margin:0 0 14px">${coverHtml(t)}</div>
    <div class="dates"><b>${esc(long(t.start))}</b>${t.end && t.end !== t.start ? ` <span class="muted">to ${esc(long(t.end))}</span>` : ""}</div>
    <h2>${esc(t.title)}</h2>
    ${t.place ? `<div class="muted">${esc(t.place)}</div>` : ""}
    ${chips.length > 1 ? `<div class="chips">${chips.map((c) => `<span class="chipx">${esc(c)}</span>`).join("")}</div>` : ""}
    ${t.summary ? `<p class="summary">${esc(t.summary)}</p>` : ""}
    ${itin.length ? `<details class="itin"><summary>${itin.length} itinerary item${itin.length === 1 ? "" : "s"}</summary>${itin.map((i) => `<div class="row"><span class="w">${esc(fmtWhen(i.at)).replace("\n", "<br>")}</span><span>${esc(i.text)}</span></div>`).join("")}</details>` : ""}
    <div id="guideSlot">${guideHtml(t.guide)}</div>
    ${t.photo?.source ? `<div class="small" style="margin-top:10px"><a class="link" href="${esc(t.photo.source)}" target="_blank" rel="noopener">Photo source and license</a></div>` : ""}
    ${isSample ? `<div style="margin-top:12px">${sampleBanner("This is a sample card.")}</div><div class="actions"><button class="btn volt wide" data-act="newtrip">Make your first card</button></div>` : `
    <div class="actions"><button class="btn" id="setPhoto">${t.photo ? "Change header photo" : "Add header photo"}</button><button class="btn ghost" id="editTrip">Edit</button></div>
    <section style="margin-top:18px"><div class="label">Journal</div>
      <div class="field"><textarea id="jText" placeholder="What happened? Use your keyboard mic to dictate."></textarea></div>
      <div class="actions"><label class="btn ghost" for="jMedia" style="cursor:pointer">${icon(I.img, 18)} Photos & videos</label><input type="file" id="jMedia" accept="image/*,video/*" multiple hidden><button class="btn volt" id="jSave">Add entry</button></div>
      <div class="small muted" id="jPicked"></div><div class="progress" id="jProg" hidden><i></i></div>
    </section>`}
    <div style="margin-top:10px">${entries.length ? entries.map((e) => `<div class="entry"><div class="label">${esc(new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))}</div>${e.text ? `<p>${esc(e.text)}</p>` : ""}${e.media?.length ? `<div class="media">${e.media.map((m) => (m.type?.startsWith("video") ? `<video src="${mediaUrl(m.id)}#t=0.1" controls playsinline preload="metadata"></video>` : `<a href="${mediaUrl(m.id)}" target="_blank" rel="noopener"><img src="${mediaUrl(m.id)}" alt="" loading="lazy"></a>`)).join("")}</div>` : ""}</div>`).join("") : `<div class="empty small">No journal entries yet.</div>`}</div>`, (el) => {
    if (isSample) return;
    if (!t.guide && S.settings?.ai) {
      api(`trips/${t.id}/guide`, { method: "POST", body: {} }).then((r) => { upsertTrip(r.trip); const slot = el.querySelector("#guideSlot"); if (slot && r.trip.guide) slot.innerHTML = guideHtml(r.trip.guide); }).catch(() => {});
    }
    el.querySelector("#editTrip").onclick = () => tripForm(t);
    el.querySelector("#setPhoto").onclick = () => photoPicker(t);
    const pick = el.querySelector("#jMedia");
    pick.onchange = () => { el.querySelector("#jPicked").textContent = pick.files.length ? `${pick.files.length} file${pick.files.length > 1 ? "s" : ""} ready` : ""; };
    el.querySelector("#jSave").onclick = async () => {
      const text = el.querySelector("#jText").value.trim(); const files = [...pick.files];
      if (!text && !files.length) return;
      const btn = el.querySelector("#jSave"), prog = el.querySelector("#jProg"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Saving`;
      try {
        const media = []; prog.hidden = !files.length;
        for (const [i, f0] of files.entries()) { const f = await photoForUpload(f0); const u = await upload(f, (p) => (prog.firstElementChild.style.width = `${((i + p) / files.length) * 100}%`)); media.push(u.id); }
        const r = await api(`trips/${t.id}/journal`, { method: "POST", body: { text, media } });
        upsertTrip(r.trip); render(); tripDetail(t.id); toast("Entry added.");
      } catch (e) { btn.disabled = false; btn.textContent = "Add entry"; toast(esc(e.message)); }
    };
  });
}
function photoPicker(t) {
  let chosen = null, file = null;
  const base = t.title.replace(/\b(tour|concert|live|show)\b/gi, "").replace(/[:\-–].*$/, "").trim();
  const extra = t.type === "concert" ? "concert" : (t.place && !t.place.toLowerCase().includes(base.toLowerCase()) ? t.place : "");
  const q0 = [base, extra].filter(Boolean).join(" ");
  sheet(`<h2>Header photo</h2><p class="muted">Pick a credited photo, or upload your own. LifeOS frames it so heads stay in the shot.</p>
    <div class="field"><label class="label" for="pq">Search free, credited photos</label><div style="display:flex;gap:8px"><input id="pq" value="${esc(q0)}"><button class="btn" id="pgo" aria-label="Search">${icon(I.search, 18)}</button></div></div>
    <div class="pgrid" id="pres"></div>
    <div class="actions"><label class="btn ghost" for="pFile" style="cursor:pointer">${icon(I.img, 18)} Upload my own</label><input type="file" id="pFile" accept="image/*" hidden></div>
    <div id="pOwn" hidden>
      <div class="cover" style="border-radius:16px;margin-top:12px" id="pv"></div>
      <div class="field"><label class="label" for="pCredit">Photo credit (required)</label><input id="pCredit" placeholder="Photo: your name, or the photographer"></div>
    </div>
    <div class="field" id="pFocusWrap" hidden><label class="label" for="pFocus">Framing (leave on Auto to keep heads in frame)</label><select id="pFocus"><option value="">Auto</option>${[0, 10, 20, 30, 40, 50, 60, 70].map((v) => `<option value="${v}">${v === 0 ? "Top" : v + "% down"}</option>`).join("")}</select></div>
    <div class="err" id="pErr"></div><div class="progress" id="pProg" hidden><i></i></div>
    <div class="actions"><button class="btn volt wide" id="pSave" disabled>Use this photo</button></div>`, (el) => {
    const res = el.querySelector("#pres"), save = el.querySelector("#pSave");
    const search = async () => {
      res.innerHTML = `<div class="small muted" style="grid-column:1/-1">${spinner("Searching…")}</div>`;
      try {
        const { hits } = await api(`photos/search?q=${encodeURIComponent(el.querySelector("#pq").value)}`);
        res.innerHTML = hits.length ? hits.map((h, i) => `<button data-i="${i}" aria-pressed="false"><img src="${esc(h.thumb)}" alt="${esc(h.title)}" loading="lazy" referrerpolicy="no-referrer"><div class="cr">${esc(h.credit)}</div></button>`).join("") : `<div class="small muted" style="grid-column:1/-1">No credited photos found. Try a simpler search, or upload your own.</div>`;
        res.querySelectorAll("button").forEach((b) => (b.onclick = () => { res.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); chosen = hits[+b.dataset.i]; file = null; el.querySelector("#pOwn").hidden = true; el.querySelector("#pFocusWrap").hidden = false; save.disabled = false; }));
      } catch (e) { res.innerHTML = `<div class="small muted" style="grid-column:1/-1">${esc(e.message)}</div>`; }
    };
    el.querySelector("#pgo").onclick = search; el.querySelector("#pq").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); search(); } };
    search();
    el.querySelector("#pFile").onchange = (e) => {
      file = e.target.files[0]; if (!file) return; chosen = null;
      res.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      el.querySelector("#pOwn").hidden = false; el.querySelector("#pFocusWrap").hidden = false;
      el.querySelector("#pv").innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`; save.disabled = false;
    };
    save.onclick = async () => {
      const err = el.querySelector("#pErr"); err.textContent = "";
      const focusV = el.querySelector("#pFocus").value; const focus = focusV === "" ? undefined : +focusV;
      save.disabled = true; save.innerHTML = `<span class="spin"></span> Saving`;
      try {
        let body;
        if (chosen) body = { remoteUrl: chosen.url, credit: chosen.credit, source: chosen.source, focus };
        else {
          const credit = el.querySelector("#pCredit").value.trim();
          if (!credit) throw new Error("Add a photo credit first.");
          const prog = el.querySelector("#pProg"); prog.hidden = false;
          const u = await upload(await photoForUpload(file), (p) => (prog.firstElementChild.style.width = `${p * 100}%`));
          body = { media: u.id, credit, focus };
        }
        const r = await api(`trips/${t.id}/photo`, { method: "POST", body });
        upsertTrip(r.trip); render(); tripDetail(t.id); toast("Header photo saved.");
      } catch (e) { err.textContent = e.message; save.disabled = false; save.textContent = "Use this photo"; }
    };
  });
}

/* ---------- cards from the calendar ---------- */
async function syncCards(quiet = false) {
  if (S.syncing || !S.settings?.calendar?.connected) return;
  S.syncing = true; if (S.tab === "trips") render();
  try {
    const r = await api("cards/sync", { method: "POST", body: {} });
    S.settings = r.settings;
    await loadState(); if (S.tab === "trips" || S.tab === "today") render();
    if (!quiet || r.created) toast(r.created ? `${r.created} new card${r.created === 1 ? "" : "s"} from your calendar.` : r.merged ? "Cards updated from your calendar." : "Your cards are up to date.");
    for (let i = 0; i < 12; i++) { const ph = await api("cards/photos", { method: "POST", body: {} }); if (ph.done) { await loadState(); if (S.tab === "trips" || S.tab === "today") render(); } if (!ph.remaining || !ph.done) break; }
  } catch (e) { if (!quiet) toast(esc(e.message)); }
  S.syncing = false; if (S.tab === "trips") render();
}

/* ---------- settings ---------- */
function settingsSheet(onboarding = false) {
  const st = S.settings; const ingestUrl = `${location.origin}/api/ingest/apple`;
  sheet(`${onboarding
    ? `<h2>Set up LifeOS</h2><p class="muted">Three connections, all optional, each about a minute. You can come back to any of them from the gear icon.</p>`
    : `<h2>Connections</h2><p class="muted small">Signed in as ${esc(st.email)}</p>`}
    <div class="conn"><div><h4>Oura</h4><div class="small muted">${st.oura.connected ? `Connected${st.oura.lastSync ? ` · synced ${esc(new Date(st.oura.lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}` : ""}. Syncs every morning.` : "Daily sync of readiness, sleep, HRV and resting heart rate."}</div></div><span class="chip ${st.oura.connected ? "ok" : "wait"}">${st.oura.connected ? "On" : "Off"}</span></div>
    ${st.oura.connected ? `<div class="actions"><button class="btn" data-act="ourasync">Sync now</button><button class="btn ghost" id="ouraOff">Disconnect</button></div>` : `
      <div class="field"><label class="label" for="ouraTok">Personal access token</label><input id="ouraTok" type="password" autocomplete="off" placeholder="Paste from cloud.ouraring.com"></div>
      <div class="small muted" style="margin-top:6px">Create one at <a class="link" href="https://cloud.ouraring.com/personal-access-tokens" target="_blank" rel="noopener">cloud.ouraring.com/personal-access-tokens</a>. It's stored encrypted.</div>
      <div class="actions"><button class="btn volt" id="ouraOn">Connect Oura</button></div>`}
    <div class="conn"><div><h4>Google Calendar</h4><div class="small muted">${st.calendar.connected ? "Connected. Refreshes every 5 minutes." : "Uses your calendar's private iCal address."}</div></div><span class="chip ${st.calendar.connected ? "ok" : "wait"}">${st.calendar.connected ? "On" : "Off"}</span></div>
    ${st.calendar.connected ? `<div class="actions"><button class="btn ghost" id="calOff">Disconnect</button></div>` : `
      <div class="small">Your trips, concerts and events build themselves from this. On a computer, open <a class="link" href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener">Google Calendar settings</a>, pick your calendar on the left, scroll to <b>Integrate calendar</b>, and copy <b>Secret address in iCal format</b>.</div>
      <div class="field"><label class="label" for="icsUrl">Secret iCal address</label><input id="icsUrl" type="url" autocomplete="off" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"></div>
      <div class="actions"><button class="btn volt" id="calOn">Connect calendar</button></div>`}
    <div class="conn"><div><h4>Apple Health</h4><div class="small muted">A Shortcut automation sends each day's numbers here.</div></div><span class="chip ${latestFor(S.days, "apple") ? "ok" : "wait"}">${latestFor(S.days, "apple") ? "On" : "Off"}</span></div>
    <div class="small">In the Shortcuts app, build a daily automation that finds today's Health samples and sends them with <b>Get Contents of URL</b>:</div>
    <div class="field"><span class="label">URL (method POST)</span><code class="key">${esc(ingestUrl)}</code></div>
    <div class="field"><span class="label">Header: Authorization</span><code class="key">Bearer ${esc(st.ingestKey || "")}</code></div>
    <div class="small muted" style="margin-top:6px">JSON body: <code>{"date":"2026-11-03","steps":9120,"sleep_minutes":452,"resting_hr":55,"hrv":62,"heart_rate":71}</code>. You can also import the full Health export (export.xml) from the Health tab.</div>
    <div class="actions"><button class="btn ghost" id="copyKey">Copy key</button><button class="btn ghost" id="newKey">New key</button></div>
    <div class="conn"><div><h4>Screenshot reading</h4><div class="small muted">${st.ai ? "On. Oura, Eight Sleep, Health and scale screenshots are read by Claude and logged to the right day." : "Off. Needs an Anthropic key or Netlify AI in the project settings."}</div></div><span class="chip ${st.ai ? "ok" : "wait"}">${st.ai ? "On" : "Off"}</span></div>
    <div class="conn"><div><h4>Eight Sleep</h4><div class="small muted">Eight Sleep has no public API. Drop screenshots and LifeOS logs score, HRV, deep sleep and bio age.</div></div></div>
    <div class="conn"><div><h4>Appearance</h4><div class="small muted">Follow your phone, or pick one.</div></div></div>
    <div class="seg" role="group" aria-label="Appearance">${["system", "light", "dark"].map((v) => `<button data-theme-set="${v}" aria-pressed="${(store.get("lifeos.theme") || "system") === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div>
    <div class="conn"><div><h4>Advanced</h4><div class="small muted">Load cards from a LifeOS cards file.</div></div><button class="btn ghost" data-act="importcards" style="height:36px">Import file</button></div>
    <div class="err" id="sErr"></div>
    <div class="actions" style="margin-top:22px">${onboarding ? `<button class="btn volt wide" id="onboardDone">Done, take me in</button>` : `<button class="btn ghost wide" id="signOut">Sign out</button>`}</div>`, (el) => {
    el.querySelector("#onboardDone")?.addEventListener("click", async () => { closeSheet(); try { const r = await api("settings/onboarded", { method: "POST", body: {} }); S.settings = r.settings; } catch {} });
    el.querySelectorAll("[data-theme-set]").forEach((b) => (b.onclick = () => { store.set("lifeos.theme", b.dataset.themeSet); applyTheme(); el.querySelectorAll("[data-theme-set]").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
    const err = (e) => (el.querySelector("#sErr").textContent = e.message);
    const busy = (b, t) => { b.disabled = true; b.innerHTML = `<span class="spin"></span> ${t}`; };
    el.querySelector("#ouraOn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget; busy(btn, "Connecting");
      try { const r = await api("settings/oura", { method: "POST", body: { token: el.querySelector("#ouraTok").value } }); S.settings = r.settings; await loadState(); render(); settingsSheet(); toast(r.sync?.error ? esc(r.sync.error) : `Oura connected. ${r.sync?.days ?? 0} days synced.`); }
      catch (x) { err(x); btn.disabled = false; btn.textContent = "Connect Oura"; }
    });
    el.querySelector("#ouraOff")?.addEventListener("click", async () => { try { const r = await api("settings/oura", { method: "DELETE", body: {} }); S.settings = r.settings; settingsSheet(); render(); toast("Oura disconnected. Your history stays."); } catch (x) { err(x); } });
    el.querySelector("#calOn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget; busy(btn, "Connecting");
      try { const r = await api("settings/calendar", { method: "POST", body: { url: el.querySelector("#icsUrl").value } }); S.settings = r.settings; S.cal.connected = true; settingsSheet(onboarding); loadCalendar(true); toast(`Calendar connected. Building your cards…`); syncCards(); }
      catch (x) { err(x); btn.disabled = false; btn.textContent = "Connect calendar"; }
    });
    el.querySelector("#calOff")?.addEventListener("click", async () => { try { const r = await api("settings/calendar", { method: "DELETE", body: {} }); S.settings = r.settings; S.cal = { status: "idle", events: [], fetchedAt: null, error: null, connected: false }; settingsSheet(); render(); } catch (x) { err(x); } });
    el.querySelector("#copyKey").onclick = async () => { try { await navigator.clipboard.writeText(st.ingestKey); toast("Key copied."); } catch { toast("Press and hold the key to copy it."); } };
    el.querySelector("#newKey").onclick = async (e) => {
      const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again: old key stops working"; return; }
      try { const r = await api("settings/ingest-key", { method: "POST", body: {} }); S.settings = r.settings; settingsSheet(); toast("New key made. Update your Shortcut."); } catch (x) { err(x); }
    };
    el.querySelector("#signOut")?.addEventListener("click", async () => { await api("auth/logout", { method: "POST", body: {} }).catch(() => {}); closeSheet(); location.reload(); });
  });
}

/* ---------- events ---------- */
document.addEventListener("click", async (e) => {
  const tab = e.target.closest("[data-tab]"); if (tab) { S.tab = tab.dataset.tab; if (S.tab === "more") S.moreView = null; render(); scrollTo({ top: 0 }); return; }
  const go = e.target.closest("[data-go]"); if (go) { const g = go.dataset.go; if (g === "cal" || g === "notes") { S.tab = "more"; S.moreView = g; } else { S.tab = g; } render(); scrollTo({ top: 0 }); return; }
  const mv = e.target.closest("[data-more]"); if (mv) { S.moreView = mv.dataset.more === "none" ? null : mv.dataset.more; render(); scrollTo({ top: 0 }); return; }
  const seg = e.target.closest("[data-seg]"); if (seg) { S.tripSeg = seg.dataset.seg; render(); return; }
  const tr = e.target.closest("[data-trip]"); if (tr) { tripDetail(tr.dataset.trip); return; }
  const ss = e.target.closest("[data-session]"); if (ss) { sessionSheet(ss.dataset.session); return; }
  const rs = e.target.closest("[data-routine-start]");
  if (rs) {
    const r = S.routines.find((x) => x.id === rs.dataset.routineStart); if (!r) return;
    try { const res = await api("workouts", { method: "POST", body: { title: r.title, date: todayStr(), status: "active", source: "routine", exercises: r.exercises.map((x) => ({ ...x, sets: x.sets.map((s) => ({ weight: s.weight, reps: s.reps, done: false })) })) } }); upsertWorkout(res.workout); render(); sessionSheet(res.workout.id); }
    catch (x) { toast(esc(x.message)); }
    return;
  }
  const rd = e.target.closest("[data-routine-del]");
  if (rd) { if (!rd.dataset.armed) { rd.dataset.armed = "1"; rd.textContent = "Tap again to delete"; return; } try { await api(`routines/${rd.dataset.routineDel}`, { method: "DELETE", body: {} }); S.routines = S.routines.filter((x) => x.id !== rd.dataset.routineDel); render(); } catch (x) { toast(esc(x.message)); } return; }
  const mk = e.target.closest("[data-mkcard]");
  if (mk) {
    const ev = calEvents().find((x) => x.id === mk.dataset.mkcard); if (!ev) return;
    const type = /(tour|concert|live|festival|show)/i.test(ev.title) ? "concert" : /(flight|hotel|trip|vacation|airbnb)/i.test(ev.title) ? "trip" : "event";
    try { const r = await api("trips", { method: "POST", body: { calId: ev.id, title: ev.title, type, place: ev.location, start: ymd(ev.s), end: ymd(new Date(ev.e - 1)) } }); upsertTrip(r.trip); render(); photoPicker(r.trip); }
    catch (x) { toast(esc(x.message)); }
    return;
  }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const act = a.dataset.act;
  if (act === "shots") $("#fileShots").click();
  else if (act === "apple") $("#fileApple").click();
  else if (act === "settings") settingsSheet();
  else if (act === "newtrip") tripForm();
  else if (act === "importcards") $("#fileCards").click();
  else if (act === "synccards") syncCards();
  else if (act === "talk") talkSheet();
  else if (act === "newworkout") reviewSheet({ title: "Workout", date: todayStr(), status: "done", source: "manual", exercises: [{ name: "", targetReps: "", sets: [{ weight: null, reps: null, done: true }, { weight: null, reps: null, done: true }, { weight: null, reps: null, done: true }] }] }, "Fill in what you did and save it.");
  else if (act === "ourasync") {
    a.disabled = true; toast(spinner("Syncing Oura…"));
    try { const r = await api("sync/oura", { method: "POST", body: {} }); S.settings = r.settings; await loadState(); render(); if ($("#scrim")) settingsSheet(); toast(`Oura synced. ${r.sync.days} day${r.sync.days === 1 ? "" : "s"} updated.`); }
    catch (x) { toast(esc(x.message)); a.disabled = false; }
  }
  else if (act === "clearnote") { draft = ""; store.del("lifeos.draft"); vNotes(); }
  else if (act === "savenote") {
    const text = $("#noteBox").value.trim(); if (!text) return; a.disabled = true;
    try { const r = await api("notes", { method: "POST", body: { text } }); S.notes.unshift(r.note); draft = ""; store.del("lifeos.draft"); toast("Note saved."); vNotes(); }
    catch (x) { a.disabled = false; toast(`${esc(x.message)} Your text is still here.`); }
  }
  else if (act === "dictate") dictate();
});
$("#fileShots").onchange = (e) => { const f = [...e.target.files]; e.target.value = ""; handleShots(f); };
$("#fileCards").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  let cards;
  try { const j = JSON.parse(await f.text()); cards = Array.isArray(j) ? j : j.cards || j.trips || []; } catch { toast("That file isn't a cards file (JSON)."); return; }
  if (!cards.length) { toast("No cards in that file."); return; }
  const prog = $("#cardsProg"); if (prog) prog.hidden = false;
  let done = 0, skipped = 0;
  try {
    for (let i = 0; i < cards.length; i += 2) {
      toast(spinner(`Making cards ${Math.min(i + 2, cards.length)} of ${cards.length}…`));
      const r = await api("import/cards", { method: "POST", body: { cards: cards.slice(i, i + 2) } });
      done += r.imported.length; skipped += r.skipped;
      if (prog) prog.firstElementChild.style.width = `${((i + 2) / cards.length) * 100}%`;
    }
    await loadState(); render();
    toast(done ? `${done} card${done === 1 ? "" : "s"} added${skipped ? `, ${skipped} already there` : ""}.` : "Those cards were already here.");
  } catch (x) { toast(esc(x.message)); if (prog) prog.hidden = true; }
};
$("#fileApple").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    let rows;
    if (/\.xml$/i.test(f.name) || f.type.includes("xml")) rows = await importAppleXml(f, (p) => toast(spinner(`Reading Health export ${Math.round(p * 100)}%`)));
    else { const j = JSON.parse(await f.text()); rows = Array.isArray(j) ? j : j.days || j.data || [j]; }
    let n = 0;
    for (let i = 0; i < rows.length; i += 60) { toast(spinner(`Saving ${Math.min(i + 60, rows.length)} of ${rows.length} days`)); n += (await api("import/apple", { method: "POST", body: { rows: rows.slice(i, i + 60) } })).days; }
    await loadState(); render(); toast(n ? `Logged ${n} day${n > 1 ? "s" : ""} of Apple Health.` : "No Health data found in that file.");
  } catch (x) { toast(esc(x.message || "That file couldn't be read.")); }
};
["dragover", "drop"].forEach((t) => document.addEventListener(t, (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }));
document.addEventListener("drop", (e) => { const f = [...(e.dataTransfer?.files || [])]; if (f.length && S.loaded) handleShots(f); });
document.addEventListener("paste", (e) => { if (e.target.closest?.("textarea,input")) return; const f = [...(e.clipboardData?.files || [])]; if (f.length && S.loaded) handleShots(f); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !S.loaded) return;
  loadState().then(render).catch(() => {});
  loadCalendar();
});

/* ---------- boot ---------- */
async function boot() {
  $("#auth").hidden = true; $("#shell").hidden = false;
  $("#view").innerHTML = `<div class="empty"><span class="spin"></span></div>`;
  try { await loadState(); } catch { return; }
  render();
  loadCalendar();
  clearInterval(calTimer); calTimer = setInterval(() => { if (document.visibilityState === "visible") loadCalendar(); }, 5 * 60_000);
  if (!S.settings.onboarded) settingsSheet(true);
  // Rebuild cards from the calendar if it hasn't happened in the last 6 hours.
  const cs = S.settings.cardsSyncedAt;
  if (S.settings.calendar?.connected && (!cs || Date.now() - Date.parse(cs) > 6 * 3600e3)) syncCards(true);
  // Pull Oura if the morning sync hasn't run in the last 3 hours.
  const ls = S.settings.oura?.lastSync;
  if (S.settings.oura?.connected && (!ls || Date.now() - Date.parse(ls) > 3 * 3600e3)) api("sync/oura", { method: "POST", body: {} }).then(async () => { await loadState(); render(); }).catch(() => {});
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
boot();
