// Trips, concerts and events built automatically from the user's calendar.
// Google copies flight, hotel, ticket and reservation emails into Calendar as
// events, so reading the calendar is enough: Claude groups the events into
// cards, and every card remembers which events it came from so a re-run never
// duplicates and a new booking merges into the trip it belongs to.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getJSON, newId, setJSON, store, type Profile, saveProfile } from "./core.mts";
import { aiAvailable, faceFocus } from "./health.mts";
import { hasCalendar, loadAll } from "./calendar.mts";
import { downloadCommons, searchCommons } from "./photos.mts";
import { putWhole } from "./media.mts";

export type Trip = {
  id: string; title: string; type: "trip" | "concert" | "event"; place: string; start: string; end: string; calId?: string;
  seedId?: string; calIds?: string[]; photoQuery?: string; summary?: string; itinerary?: { at: string; text: string }[];
  guide?: { kind: string; title: string; body: string; linkLabel?: string; linkUrl?: string; at: string };
  photo?: { media: string; credit: string; focus: number; source?: string };
  journal: { id: string; at: string; text: string; media: { id: string; type: string }[] }[];
  createdAt: string;
};
export const tripKey = (uid: string, id: string) => `u/${uid}/trip/${id}`;

const envGet = (k: string) => (globalThis as any).Netlify?.env?.get(k) ?? process.env[k];
function claude(timeout: number) {
  const apiKey = envGet("ANTHROPIC_API_KEY"), baseURL = envGet("ANTHROPIC_BASE_URL");
  return new Anthropic({ ...(apiKey ? { apiKey } : {}), ...(baseURL ? { baseURL } : {}), timeout, maxRetries: 0 });
}
const text = (v: unknown): string => (typeof v === "string" ? v : (v as any)?.val ?? "");
const pad = (n: number) => String(n).padStart(2, "0");
function localStamp(d: Date, tz: string, allDay: boolean) {
  if (allDay) return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Calendar events that look like travel, tickets, stays or reservations, in a wide window. */
export async function candidateEvents(p: Profile) {
  if (!hasCalendar(p)) return [];
  const tz = p.tz || "America/Denver";
  const from = new Date(Date.now() - 45 * 864e5), to = new Date(Date.now() + 400 * 864e5);
  const { events, errors, total } = await loadAll(p, from, to);
  if (errors.length === total) throw new Error(errors[0] || "Couldn't read your calendar right now.");
  const looks = /\b(flight|airline|airport|depart|arriv|boarding|check[- ]?in|hotel|resort|airbnb|vrbo|stay|reservation|booking|confirm|tickets?|concert|tour|festival|show|game|match|vs\.?|@|stadium|arena|center|centre|theat|trip|vacation|cruise|rental|car|train|amtrak|itinerary|wedding|conference|summit|expo|\b[A-Z]{2}\s?\d{2,4}\b)/i;
  const out: { id: string; title: string; location: string; description: string; start: string; end: string; allDay: boolean }[] = [];
  for (const e of events) {
    if (e.recurring) continue; // weekly routines are never trips
    const fromGmail = /created from an email you received/i.test(e.description);
    if (!fromGmail && !looks.test(`${e.title} ${e.location} ${e.description.slice(0, 200)}`)) continue;
    out.push({ id: `${e.uid}_${e.start.getTime()}`, title: e.title, location: e.location, description: e.description.slice(0, 500), start: localStamp(e.start, tz, e.allDay), end: localStamp(e.end, tz, e.allDay), allDay: e.allDay });
    if (out.length >= 150) break;
  }
  return out;
}

const Card = z.object({
  title: z.string(), type: z.enum(["trip", "concert", "event"]),
  place: z.string().describe("City and state, or venue and city"),
  start: z.string().describe("YYYY-MM-DD"), end: z.string().describe("YYYY-MM-DD, same as start for one-day events"),
  summary: z.string().describe("2 to 4 plain sentences from the event details only"),
  itinerary: z.array(z.object({ at: z.string().describe("YYYY-MM-DD or YYYY-MM-DD HH:MM local"), text: z.string() })),
  photoQuery: z.string().describe("A short search for a landmark or skyline photo of the place, or the artist's name for a concert"),
  eventIds: z.array(z.string()).describe("Every calendar event id this card was built from"),
});
const Cards = z.object({ cards: z.array(Card) });

export async function cardsFromEvents(events: Awaited<ReturnType<typeof candidateEvents>>, tz: string) {
  if (!events.length || !aiAvailable()) return [];
  const client = claude(55_000);
  const prompt = `You turn a person's calendar events into cards for a "Trips" tab in their personal dashboard. Times are in ${tz}.

Rules:
- A trip is a group: outbound flight, everything in the destination (hotel, dinners, shows, games, car rental), and the flight home. One card per trip; type "trip"; start and end are the travel dates.
- A concert, show or game that is not part of a trip gets its own card: type "concert" for music, "event" for sports and everything else.
- Check-in reminders, "pack" reminders and similar belong in the trip's itinerary, never their own card.
- Skip anything that is not travel, tickets, a stay or a reservation: work meetings, school, custody, medication, errands.
- Use only what the events say. Never invent flight numbers, prices, hotels or dates. If a detail isn't in an event, leave it out.
- itinerary: one item per flight, stay, reservation or show, in time order, written as a short plain sentence (e.g. "WN 381 Salt Lake City → Las Vegas, lands 4:15 PM").
- Titles: a city for trips ("Las Vegas"), the artist and tour for concerts, the matchup for games.
- Return every card the events support, including past ones in the list.

Events (id | title | location | start | end | details):
${events.map((e) => `${e.id} | ${e.title} | ${e.location} | ${e.start} | ${e.end} | ${e.description}`).join("\n")}`;
  const res = await client.messages.parse({ model: "claude-opus-5-5", max_tokens: 12000, output_config: { effort: "medium", format: zodOutputFormat(Cards) }, messages: [{ role: "user", content: prompt }] });
  return res.parsed_output?.cards ?? [];
}

async function listTrips(uid: string) {
  const { blobs } = await store().list({ prefix: `u/${uid}/trip/` });
  const out: Trip[] = [];
  for (let i = 0; i < blobs.length; i += 25) { const got = await Promise.all(blobs.slice(i, i + 25).map((b) => getJSON<Trip>(b.key))); for (const g of got) if (g) out.push(g); }
  return out;
}
const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Read the calendar, build cards, create new ones and merge new bookings into existing ones. Photos are fetched separately. */
export async function syncCards(p: Profile) {
  const events = await candidateEvents(p);
  const cards = await cardsFromEvents(events, p.tz || "America/Denver");
  const existing = await listTrips(p.uid);
  const byEvent = new Map<string, Trip>();
  for (const t of existing) for (const id of [...(t.calIds || []), ...(t.calId ? [t.calId] : [])]) byEvent.set(id, t);
  let created = 0, merged = 0;
  for (const c of cards) {
    if (!isYmd(c.start) || !c.title) continue;
    const ids = c.eventIds.filter(Boolean);
    const hit = ids.map((id) => byEvent.get(id)).find(Boolean);
    const itinerary = c.itinerary.filter((i) => i.text).slice(0, 60).map((i) => ({ at: i.at.slice(0, 16), text: i.text.slice(0, 300) }));
    if (hit) {
      const known = new Set((hit.itinerary || []).map((i) => i.text.trim().toLowerCase()));
      const add = itinerary.filter((i) => !known.has(i.text.trim().toLowerCase()));
      const newIds = ids.filter((id) => !(hit.calIds || []).includes(id));
      if (!add.length && !newIds.length) continue;
      hit.itinerary = [...(hit.itinerary || []), ...add];
      hit.calIds = [...(hit.calIds || []), ...newIds];
      if (isYmd(c.end) && c.end > hit.end) hit.end = c.end;
      if (c.start < hit.start) hit.start = c.start;
      await setJSON(tripKey(p.uid, hit.id), hit);
      for (const id of newIds) byEvent.set(id, hit);
      merged++;
      continue;
    }
    const t: Trip = {
      id: newId(), title: c.title.slice(0, 120), type: c.type, place: c.place.slice(0, 160), start: c.start, end: isYmd(c.end) && c.end >= c.start ? c.end : c.start,
      calIds: ids, photoQuery: c.photoQuery.slice(0, 120), summary: c.summary.slice(0, 4000), itinerary, journal: [], createdAt: new Date().toISOString(),
    };
    await setJSON(tripKey(p.uid, t.id), t);
    for (const id of ids) byEvent.set(id, t);
    created++;
  }
  p.cardsSyncedAt = new Date().toISOString();
  await saveProfile(p);
  const photosPending = (await listTrips(p.uid)).filter((t) => !t.photo && t.photoQuery).length;
  return { created, merged, photosPending, events: events.length };
}

/** A credited Wikimedia Commons header. Undefined when nothing suitable is found. */
export async function autoPhoto(uid: string, query: string, framePerson: boolean): Promise<Trip["photo"] | undefined> {
  try {
    const hit = (await searchCommons(query))[0];
    if (!hit) return undefined;
    const dl = await downloadCommons(hit.url);
    const id = newId(12);
    await putWhole(uid, id, dl.type, dl.data, "header");
    let focus = 25;
    if (framePerson && dl.data.byteLength < 4.5 * 1024 * 1024) { const f = await faceFocus(Buffer.from(dl.data), dl.type); if (f !== null) focus = Math.max(0, f - 8); }
    return { media: id, credit: hit.credit, focus, source: hit.source };
  } catch (e) { console.error("autoPhoto failed", (e as any)?.message); return undefined; }
}

/** Fill header photos for up to `n` cards that still need one. Each is a few seconds, so callers loop. */
export async function fillPhotos(uid: string, n = 2) {
  const todo = (await listTrips(uid)).filter((t) => !t.photo && t.photoQuery).sort((a, b) => (a.start > b.start ? -1 : 1));
  let done = 0;
  for (const t of todo.slice(0, n)) {
    const photo = await autoPhoto(uid, t.photoQuery!, t.type === "concert");
    if (photo) { t.photo = photo; done++; } else { t.photoQuery = undefined; } // nothing found: stop retrying, keep the poster
    await setJSON(tripKey(uid, t.id), t);
  }
  return { done, remaining: Math.max(0, todo.length - Math.min(n, todo.length)) };
}
