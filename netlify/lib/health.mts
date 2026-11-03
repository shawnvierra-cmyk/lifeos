// Health data: per-day documents that only ever add to history, Oura v2 sync,
// Apple Health row mapping, and screenshot reading with Claude.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { addDaysYmd, decrypt, getJSON, isYmd, setJSON, store, type Profile, saveProfile, ymdInTz } from "./core.mts";

export type Source = "apple" | "oura" | "eight" | "body";
export const SOURCES: Source[] = ["apple", "oura", "eight", "body"];
export type LogEntry = { at: string; source: Source; via: string; fields: Record<string, unknown>; shot?: string };
export type Day = { date: string; sources: Partial<Record<Source, Record<string, unknown>>>; log: LogEntry[] };

export const ALLOWED: Record<Source, string[]> = {
  oura: ["readiness", "sleepScore", "hrv", "restingHr", "totalSleepMin", "deepMin", "steps"],
  eight: ["sleepScore", "hrv", "hrvAvg", "deepMin", "bioAge", "totalSleepMin", "restingHr"],
  apple: ["steps", "sleepMin", "restingHr", "hrv", "avgHr", "workouts"],
  body: ["weight", "weightUnit", "bodyFat", "muscle", "muscleUnit", "metabolicAge"],
};
const TEXT_FIELDS = new Set(["weightUnit", "muscleUnit"]);

export function cleanFields(source: Source, input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED[source]) {
    const v = input?.[k];
    if (v === null || v === undefined || v === "") continue;
    if (TEXT_FIELDS.has(k)) out[k] = String(v).toLowerCase().slice(0, 8);
    else if (k === "workouts" && Array.isArray(v))
      out[k] = v.slice(0, 12).map((w: any) => ({ type: String(w?.type ?? "Workout").slice(0, 40), min: Math.round(Number(w?.min) || 0), ...(Number.isFinite(Number(w?.kcal)) && w?.kcal != null ? { kcal: Math.round(Number(w.kcal)) } : {}) }));
    else if (Number.isFinite(Number(v))) out[k] = Number(v);
  }
  return out;
}

const dayKey = (uid: string, date: string) => `u/${uid}/day/${date}`;
export const getDay = (uid: string, date: string) => getJSON<Day>(dayKey(uid, date));

/** Merge new fields into a day. History is append-only: every write adds a log entry. */
export async function logDay(uid: string, date: string, source: Source, fields: Record<string, unknown>, via: string, shot?: string) {
  if (!isYmd(date)) throw new Error("Bad date");
  const prev = await getDay(uid, date);
  const day: Day = prev ? structuredClone(prev) : { date, sources: {}, log: [] };
  const before = JSON.stringify(day.sources[source] ?? {});
  day.sources[source] = { ...(day.sources[source] ?? {}), ...fields };
  const changed = JSON.stringify(day.sources[source]) !== before;
  if (!changed && !shot) return { day, prev, changed: false };
  day.log.push({ at: new Date().toISOString(), source, via, fields, ...(shot ? { shot } : {}) });
  if (day.log.length > 200) day.log = day.log.slice(-200);
  await setJSON(dayKey(uid, date), day);
  return { day, prev, changed: true };
}
export async function putDay(uid: string, date: string, doc: Day | null) {
  if (!isYmd(date)) throw new Error("Bad date");
  if (doc === null) await store().delete(dayKey(uid, date));
  else await setJSON(dayKey(uid, date), { date, sources: doc.sources ?? {}, log: doc.log ?? [] });
}
export async function listDays(uid: string, sinceYmd?: string) {
  const { blobs } = await store().list({ prefix: `u/${uid}/day/` });
  const keys = blobs.map((b) => b.key).filter((k) => !sinceYmd || k.slice(-10) >= sinceYmd).sort();
  const out: Day[] = [];
  for (let i = 0; i < keys.length; i += 25) {
    const batch = await Promise.all(keys.slice(i, i + 25).map((k) => getJSON<Day>(k)));
    for (const d of batch) if (d) out.push(d);
  }
  return out;
}

/* ---------- Apple Health rows (Shortcut JSON or parsed export) ---------- */
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
export function mapAppleRow(r: Record<string, any>) {
  const o: Record<string, unknown> = {}; let date: string | null = null;
  for (const [k0, v] of Object.entries(r || {})) {
    const k = norm(k0); const n = v === "" || v === null ? NaN : Number(v);
    if (["date", "day", "startdate"].includes(k)) date = String(v).slice(0, 10);
    else if (["steps", "stepcount"].includes(k) && Number.isFinite(n)) o.steps = Math.round(n);
    else if (["sleepminutes", "sleepmin", "sleep", "timeasleep", "asleepminutes"].includes(k) && Number.isFinite(n)) o.sleepMin = n < 24 ? Math.round(n * 60) : Math.round(n);
    else if (k === "sleephours" && Number.isFinite(n)) o.sleepMin = Math.round(n * 60);
    else if (["restinghr", "restingheartrate"].includes(k) && Number.isFinite(n)) o.restingHr = Math.round(n);
    else if (["hrv", "heartratevariability", "hrvsdnn"].includes(k) && Number.isFinite(n)) o.hrv = Math.round(n);
    else if (["heartrate", "avghr", "averageheartrate"].includes(k) && Number.isFinite(n)) o.avgHr = Math.round(n);
    else if (k === "workouts" && Array.isArray(v)) o.workouts = v.map((w: any) => ({ type: w.type || w.name || "Workout", min: w.minutes ?? w.duration ?? w.min, kcal: w.kcal ?? w.calories }));
  }
  return { date, fields: cleanFields("apple", o) };
}
export async function ingestAppleRows(uid: string, rows: unknown, via: string) {
  const list = Array.isArray(rows) ? rows : (rows as any)?.days ?? (rows as any)?.data ?? [rows];
  let n = 0;
  for (const r of list.slice(0, 400)) {
    const { date, fields } = mapAppleRow(r as any);
    if (date && isYmd(date) && Object.keys(fields).length) { await logDay(uid, date, "apple", fields, via); n++; }
  }
  return n;
}

/* ---------- Oura v2 ---------- */
const OURA = "https://api.ouraring.com/v2/usercollection";
async function oura(token: string, path: string, params: Record<string, string>) {
  const res = await fetch(`${OURA}/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } })
    .catch(() => { throw new Error("Couldn't reach Oura. Try again in a minute."); });
  if (res.status === 401) throw Object.assign(new Error("Oura rejected the token. Create a new one and paste it again."), { code: 401 });
  if (!res.ok) throw new Error(`Oura returned ${res.status}`);
  return (await res.json()) as any;
}
export async function checkOuraToken(token: string) {
  const res = await fetch(`${OURA}/personal_info`, { headers: { Authorization: `Bearer ${token}` } })
    .catch(() => { throw new Error("Couldn't reach Oura. Try again in a minute."); });
  return res.ok;
}
export async function syncOura(p: Profile, days = 7) {
  if (!p.oura?.enc) return { days: 0 };
  const token = await decrypt(p.oura.enc);
  const tz = p.tz || "America/Denver";
  const end = addDaysYmd(ymdInTz(new Date(), tz), 1);
  const start = addDaysYmd(end, -days);
  const range = { start_date: start, end_date: end };
  try {
    const [readiness, sleepDaily, sleep, activity] = await Promise.all([
      oura(token, "daily_readiness", range), oura(token, "daily_sleep", range), oura(token, "sleep", range), oura(token, "daily_activity", range),
    ]);
    const per: Record<string, Record<string, unknown>> = {};
    const f = (d: string) => (per[d] ||= {});
    for (const r of readiness.data ?? []) if (r.day && r.score != null) f(r.day).readiness = r.score;
    for (const r of sleepDaily.data ?? []) if (r.day && r.score != null) f(r.day).sleepScore = r.score;
    const longest: Record<string, any> = {};
    for (const s of sleep.data ?? []) if (s.day && (!longest[s.day] || (s.total_sleep_duration ?? 0) > (longest[s.day].total_sleep_duration ?? 0))) longest[s.day] = s;
    for (const [d, s] of Object.entries(longest)) {
      if (s.average_hrv != null) f(d).hrv = Math.round(s.average_hrv);
      if (s.lowest_heart_rate != null) f(d).restingHr = s.lowest_heart_rate;
      if (s.total_sleep_duration != null) f(d).totalSleepMin = Math.round(s.total_sleep_duration / 60);
      if (s.deep_sleep_duration != null) f(d).deepMin = Math.round(s.deep_sleep_duration / 60);
    }
    for (const r of activity.data ?? []) if (r.day && r.steps != null) f(r.day).steps = r.steps;
    let n = 0;
    for (const [d, fields] of Object.entries(per).sort()) {
      const r = await logDay(p.uid, d, "oura", cleanFields("oura", fields), "Oura sync");
      if (r.changed) n++;
    }
    p.oura = { ...p.oura, lastSync: new Date().toISOString(), lastError: undefined };
    await saveProfile(p);
    return { days: n };
  } catch (e: any) {
    p.oura = { ...p.oura!, lastError: e.message };
    await saveProfile(p);
    throw e;
  }
}

/* ---------- Screenshot reading ---------- */
const num = z.number().nullable();
const Extract = z.object({
  source: z.enum(["oura", "eight", "apple", "body", "unknown"]),
  date: z.string().nullable().describe("YYYY-MM-DD the data belongs to, or null if no date is shown"),
  dateText: z.string().nullable(),
  fields: z.object({
    readiness: num, sleepScore: num, hrv: num, hrvAvg: num, restingHr: num, totalSleepMin: num, deepMin: num, bioAge: num,
    steps: num, sleepMin: num, avgHr: num, workoutMin: num, workoutType: z.string().nullable(),
    weight: num, weightUnit: z.enum(["lb", "kg"]).nullable(), bodyFat: num, muscle: num, muscleUnit: z.enum(["lb", "kg"]).nullable(), metabolicAge: num,
  }),
});

/** Claude is reachable either through a key set in Netlify or through Netlify's AI Gateway,
 *  which injects ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL into functions at runtime. */
const envGet = (k: string) => (globalThis as any).Netlify?.env?.get(k) ?? process.env[k];
export function aiAvailable() { return !!envGet("ANTHROPIC_API_KEY"); }
export function aiSource() { return !aiAvailable() ? "none" : envGet("ANTHROPIC_BASE_URL") && !String(envGet("ANTHROPIC_API_KEY")).startsWith("sk-ant-") ? "netlify-gateway" : "api-key"; }
function claude(timeout: number, maxRetries: number) {
  // No explicit apiKey: the SDK reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from the environment.
  const apiKey = envGet("ANTHROPIC_API_KEY"), baseURL = envGet("ANTHROPIC_BASE_URL");
  return new Anthropic({ ...(apiKey ? { apiKey } : {}), ...(baseURL ? { baseURL } : {}), timeout, maxRetries });
}

export async function readScreenshot(image: Buffer, mediaType: string, todayYmd: string) {
  if (!aiAvailable()) throw Object.assign(new Error("Screenshot reading isn't switched on for this site yet."), { code: 503 });
  const client = claude(50_000, 1);
  const weekday = new Date(todayYmd + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const prompt = `This is one screenshot from a health app. Record only what it visibly shows.
Today is ${weekday} ${todayYmd} in the user's time zone. "Today" means ${todayYmd}; "Yesterday" means ${addDaysYmd(todayYmd, -1)}. A date without a year is the most recent such date on or before today. Sleep and readiness for "last night" belong to the date the person woke up.
Identify the app: oura (Oura), eight (Eight Sleep), apple (Apple Health, Fitness or Watch), body (a smart scale or body-composition app), or unknown.
Copy only numbers printed on the screen. Never estimate, infer or calculate a value that is not shown; use null for anything not visible.
Durations go in minutes (7h 32m = 452). hrv is heart rate variability in ms; hrvAvg is the user's average HRV if the screen shows one. bioAge is a biological age; metabolicAge is a scale's metabolic age. bodyFat is a percentage. muscle is skeletal muscle mass.`;
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(Extract) },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: image.toString("base64") } },
      { type: "text", text: prompt },
    ] }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("The screenshot couldn't be read.");
  const out = res.parsed_output;
  const f = out.fields as Record<string, any>;
  const raw: Record<string, unknown> = { ...f };
  if (f.workoutMin != null) raw.workouts = [{ type: f.workoutType || "Workout", min: f.workoutMin }];
  const source = out.source === "unknown" ? null : (out.source as Source);
  const fields = source ? cleanFields(source, raw) : {};
  // Units only count when a number came with them.
  if (source === "body") { if (fields.weight == null) delete fields.weightUnit; if (fields.muscle == null) delete fields.muscleUnit; }
  const date = isYmd(out.date) && out.date <= addDaysYmd(todayYmd, 1) ? out.date : null;
  return { source, date, dateText: out.dateText, fields };
}

/** Pick the vertical focus point (0-100) that keeps the main subject's head in a wide crop. */
export async function faceFocus(image: Buffer, mediaType: string): Promise<number | null> {
  if (!aiAvailable()) return null;
  try {
    const client = claude(30_000, 0);
    const res = await client.messages.parse({
      model: "claude-opus-5-5", max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(z.object({ focusY: z.number().describe("0 = top edge, 100 = bottom edge") })) },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: image.toString("base64") } },
        { type: "text", text: "This photo will be shown as a wide 16:10 header and cropped top and bottom. Give the vertical position, as a percentage of image height, of the center of the main person's face (or of the main subject if there is no person), so the whole head stays in frame." },
      ] }],
    });
    const y = res.parsed_output?.focusY;
    return typeof y === "number" ? Math.max(0, Math.min(100, Math.round(y))) : null;
  } catch { return null; }
}
