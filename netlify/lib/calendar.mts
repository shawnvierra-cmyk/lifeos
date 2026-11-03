// Calendars from three kinds of source: a Google account (sign in), an iCloud account
// (Apple ID + app-specific password), or a private iCal link (Google, iCloud, Outlook).
// Any mix per account. Fetched server-side, recurring events expanded, merged, and
// cached for 5 minutes per user.
import ical from "node-ical";
import { decrypt, getJSON, setJSON, type Profile } from "./core.mts";
import { googleEvents } from "./google.mts";
import { icloudEvents } from "./icloud.mts";

export type CalEvent = { id: string; title: string; location: string; start: string; end: string; allDay: boolean; cal?: string };
/** One event as loaded from any source, before it is shaped for the app. */
export type RawEvent = { uid: string; title: string; location: string; description: string; start: Date; end: Date; allDay: boolean; recurring: boolean };
export type CalSource = {
  id: string; label: string; kind?: "ics" | "google" | "icloud"; enc: string; host: string; addedAt?: string;
  email?: string; calendars?: { id: string; name: string }[]; lastError?: string;
};
export const MAX_CALENDARS = 6;
const text = (v: unknown): string => (typeof v === "string" ? v : (v as any)?.val ?? "");
const allDayYmd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export function validIcsUrl(u: string) {
  try {
    const url = new URL(u.trim().replace(/^webcal:/i, "https:"));
    return url.protocol === "https:" && /(^|\.)google\.com$|(^|\.)icloud\.com$|(^|\.)outlook\.(com|office365\.com)$|(^|\.)office365\.com$|(^|\.)live\.com$|(^|\.)office\.com$/i.test(url.hostname) ? url.toString() : null;
  } catch { return null; }
}
/** Friendly provider name for a calendar address. */
export function icsHost(u: string) {
  const h = (() => { try { return new URL(u).hostname; } catch { return ""; } })();
  return /google\.com$/i.test(h) ? "Google" : /icloud\.com$/i.test(h) ? "iCloud" : "Outlook";
}

/** Every calendar source on the account. An address saved before multi-calendar support shows as "Calendar". */
export function calendarSources(p: Profile): CalSource[] {
  const list: CalSource[] = [...(p.calendars || [])];
  if (p.ics?.enc) list.unshift({ id: "legacy", label: "Calendar", kind: "ics", enc: p.ics.enc, host: "Google" });
  return list;
}
export const hasCalendar = (p: Profile) => calendarSources(p).length > 0;
export const sourceKind = (s: CalSource) => s.kind || "ics";

/** Download one calendar's iCal text, with a message that says what to fix when it fails. */
export async function fetchIcs(enc: string, label = "your calendar"): Promise<string> {
  const res = await fetch(await decrypt(enc), { headers: { "user-agent": "LifeOS/1.0" } }).catch(() => null);
  if (res?.ok) return res.text();
  if (!res) throw new Error(`Couldn't reach ${label}. Try again in a minute.`);
  if (res.status === 404 || res.status === 401 || res.status === 403)
    throw new Error(`${cap(label)} returned ${res.status}, which happens with the public iCal address or one your workplace has turned off. In calendar settings, scroll to Integrate calendar and copy the one labelled Secret address in iCal format.`);
  throw new Error(`${cap(label)} returned ${res.status}. Copy its secret iCal address again.`);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Parse iCal text into events inside the window, recurring ones expanded. */
export function parseIcs(icsText: string, from: Date, to: Date): RawEvent[] {
  const data = ical.sync.parseICS(icsText);
  const events: RawEvent[] = [];
  for (const c of Object.values(data) as any[]) {
    if (c?.type !== "VEVENT" || c.status === "CANCELLED" || c.recurrenceid) continue;
    let instances: any[] = [];
    try { instances = ical.expandRecurringEvent(c, { from, to, expandOngoing: true }); } catch { instances = []; }
    for (const inst of instances) {
      const ev = inst.event ?? c;
      if (ev.status === "CANCELLED") continue;
      events.push({
        uid: String(c.uid), title: text(inst.summary ?? ev.summary) || "Busy", location: text(ev.location),
        description: text(ev.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        start: new Date(inst.start), end: new Date(inst.end ?? inst.start), allDay: !!inst.isFullDay, recurring: !!c.rrule,
      });
    }
  }
  return events;
}

/** Events from one source inside the window. */
export async function loadSource(s: CalSource, from: Date, to: Date): Promise<RawEvent[]> {
  const kind = sourceKind(s);
  if (kind === "google") return googleEvents(s, from, to);
  if (kind === "icloud") return icloudEvents(s, from, to);
  return parseIcs(await fetchIcs(s.enc, `your ${s.label} calendar`), from, to);
}

/** Every source merged and deduplicated. One failing never hides the others. */
export async function loadAll(p: Profile, from: Date, to: Date) {
  const sources = calendarSources(p);
  const results = await Promise.allSettled(sources.map((s) => loadSource(s, from, to)));
  const errors: string[] = []; const seen = new Set<string>(); const events: (RawEvent & { cal: string })[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") { errors.push(r.reason?.message || `Couldn't read your ${sources[i].label} calendar.`); return; }
    for (const e of r.value) { const k = `${e.uid}_${e.start.getTime()}`; if (seen.has(k)) continue; seen.add(k); events.push({ ...e, cal: sources[i].label }); }
  });
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, errors, total: sources.length };
}

type CalResult = { events: CalEvent[]; fetchedAt: string; error?: string };

/** Merged events from every calendar, -2 to +45 days, shaped for the app. */
export async function calendarEvents(p: Profile, force = false): Promise<CalResult> {
  if (!hasCalendar(p)) return { events: [], fetchedAt: "" };
  const cacheKey = `u/${p.uid}/cache/calendar`;
  const cached = await getJSON<CalResult>(cacheKey);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < 5 * 60_000) return cached;
  const from = new Date(Date.now() - 2 * 864e5), to = new Date(Date.now() + 45 * 864e5);
  const { events, errors, total } = await loadAll(p, from, to);
  if (errors.length === total) {
    if (cached) return { ...cached, error: errors[0] };
    throw new Error(errors[0]);
  }
  const shaped: CalEvent[] = events.slice(0, 500).map((e) => ({
    id: `${e.uid}_${e.start.getTime()}`, title: e.title, location: e.location, allDay: e.allDay,
    start: e.allDay ? allDayYmd(e.start) : e.start.toISOString(), end: e.allDay ? allDayYmd(e.end) : e.end.toISOString(), cal: e.cal,
  }));
  const out: CalResult = { events: shaped, fetchedAt: new Date().toISOString(), ...(errors.length ? { error: errors[0] } : {}) };
  await setJSON(cacheKey, { events: out.events, fetchedAt: out.fetchedAt });
  return out;
}
