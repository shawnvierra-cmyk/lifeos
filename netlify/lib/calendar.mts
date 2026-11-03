// Calendars via their private iCal addresses: Google (personal or work), iCloud, Outlook.
// Any number per account. Fetched server-side, recurring events expanded, merged and
// cached for 5 minutes per user.
import ical from "node-ical";
import { decrypt, getJSON, setJSON, type Profile } from "./core.mts";

export type CalEvent = { id: string; title: string; location: string; start: string; end: string; allDay: boolean; cal?: string };
export type CalSource = { id: string; label: string; enc: string; host: string; addedAt?: string };
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

/** Every calendar on the account. An address saved before multi-calendar support shows as "Calendar". */
export function calendarSources(p: Profile): CalSource[] {
  const list: CalSource[] = [...(p.calendars || [])];
  if (p.ics?.enc) list.unshift({ id: "legacy", label: "Calendar", enc: p.ics.enc, host: "Google" });
  return list;
}
export const hasCalendar = (p: Profile) => calendarSources(p).length > 0;

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

/** Parse one calendar into events inside the window. */
export function parseEvents(icsText: string, from: Date, to: Date, cal?: string): CalEvent[] {
  const data = ical.sync.parseICS(icsText);
  const events: CalEvent[] = [];
  for (const c of Object.values(data) as any[]) {
    if (c?.type !== "VEVENT" || c.status === "CANCELLED" || c.recurrenceid) continue;
    let instances: any[] = [];
    try { instances = ical.expandRecurringEvent(c, { from, to, expandOngoing: true }); } catch { instances = []; }
    for (const inst of instances) {
      const ev = inst.event ?? c;
      if (ev.status === "CANCELLED") continue;
      const start = new Date(inst.start), end = new Date(inst.end ?? inst.start);
      events.push({
        id: `${c.uid}_${start.getTime()}`,
        title: text(inst.summary ?? ev.summary) || "Busy",
        location: text(ev.location),
        allDay: !!inst.isFullDay,
        start: inst.isFullDay ? allDayYmd(start) : start.toISOString(),
        end: inst.isFullDay ? allDayYmd(end) : end.toISOString(),
        ...(cal ? { cal } : {}),
      });
    }
  }
  return events;
}

type CalResult = { events: CalEvent[]; fetchedAt: string; error?: string };

/** Merged events from every calendar, -2 to +45 days. One calendar failing never hides the others. */
export async function calendarEvents(p: Profile, force = false): Promise<CalResult> {
  const sources = calendarSources(p);
  if (!sources.length) return { events: [], fetchedAt: "" };
  const cacheKey = `u/${p.uid}/cache/calendar`;
  const cached = await getJSON<CalResult>(cacheKey);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < 5 * 60_000) return cached;
  const from = new Date(Date.now() - 2 * 864e5), to = new Date(Date.now() + 45 * 864e5);
  const results = await Promise.allSettled(sources.map(async (s) => parseEvents(await fetchIcs(s.enc, `your ${s.label} calendar`), from, to, s.label)));
  const errors: string[] = []; const seen = new Set<string>(); const events: CalEvent[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") { errors.push(r.reason?.message || `Couldn't read your ${sources[i].label} calendar.`); return; }
    for (const e of r.value) { if (seen.has(e.id)) continue; seen.add(e.id); events.push(e); }
  });
  if (errors.length === sources.length) {
    if (cached) return { ...cached, error: errors[0] };
    throw new Error(errors[0]);
  }
  events.sort((a, b) => (a.start < b.start ? -1 : 1));
  const out: CalResult = { events: events.slice(0, 500), fetchedAt: new Date().toISOString(), ...(errors.length ? { error: errors[0] } : {}) };
  await setJSON(cacheKey, { events: out.events, fetchedAt: out.fetchedAt });
  return out;
}
