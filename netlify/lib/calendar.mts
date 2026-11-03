// Google Calendar via its private iCal address. Fetched server-side, recurring
// events expanded, cached for 5 minutes per user.
import ical from "node-ical";
import { decrypt, getJSON, setJSON, type Profile } from "./core.mts";

export type CalEvent = { id: string; title: string; location: string; start: string; end: string; allDay: boolean };
const text = (v: unknown): string => (typeof v === "string" ? v : (v as any)?.val ?? "");
const allDayYmd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export function validIcsUrl(u: string) {
  try {
    const url = new URL(u.trim().replace(/^webcal:/i, "https:"));
    return url.protocol === "https:" && /(^|\.)google\.com$|(^|\.)icloud\.com$|(^|\.)outlook\.(com|office365\.com)$|(^|\.)office365\.com$/i.test(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

export async function calendarEvents(p: Profile, force = false): Promise<{ events: CalEvent[]; fetchedAt: string }> {
  if (!p.ics?.enc) return { events: [], fetchedAt: "" };
  const cacheKey = `u/${p.uid}/cache/calendar`;
  const cached = await getJSON<{ events: CalEvent[]; fetchedAt: string }>(cacheKey);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < 5 * 60_000) return cached;
  const res = await fetch(await decrypt(p.ics.enc), { headers: { "user-agent": "LifeOS/1.0" } }).catch(() => null);
  if (!res?.ok) {
    if (cached) return cached;
    throw new Error(res ? `The calendar address returned ${res.status}. Copy the secret iCal address again.` : "Couldn't reach your calendar. Try again in a minute.");
  }
  const data = ical.sync.parseICS(await res.text());
  const from = new Date(Date.now() - 2 * 864e5), to = new Date(Date.now() + 45 * 864e5);
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
      });
    }
  }
  events.sort((a, b) => (a.start < b.start ? -1 : 1));
  const out = { events: events.slice(0, 400), fetchedAt: new Date().toISOString() };
  await setJSON(cacheKey, out);
  return out;
}
