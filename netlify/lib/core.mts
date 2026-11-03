// Shared helpers: storage, auth sessions, encryption and small utilities.
import { getStore } from "@netlify/blobs";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const store = () => getStore({ name: "lifeos", consistency: "strong" });

const env = (k: string) => (globalThis as any).Netlify?.env?.get(k) ?? process.env[k];

/* ---------- JSON helpers ---------- */
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
export const err = (message: string, status = 400) => json({ error: message }, status);

export async function getJSON<T = any>(key: string): Promise<T | null> {
  return (await store().get(key, { type: "json" })) as T | null;
}
export async function setJSON(key: string, value: unknown) {
  await store().setJSON(key, value);
}

/* ---------- ids & dates ---------- */
export const newId = (bytes = 9) => randomBytes(bytes).toString("base64url");
export const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
export function ymdInTz(d: Date, tz = "America/Denver") {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // en-CA formats as YYYY-MM-DD
}
export function addDaysYmd(ymd: string, n: number) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- passwords ---------- */
const scryptAsync = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt);
  return `s1$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [v, s, k] = stored.split("$");
  if (v !== "s1") return false;
  const key = await scryptAsync(pw, Buffer.from(s, "base64"));
  const want = Buffer.from(k, "base64");
  return key.length === want.length && timingSafeEqual(key, want);
}
export const emailKey = (email: string) => "users/" + createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/* ---------- app secrets ----------
   Env vars win when set. Otherwise LifeOS creates random keys on first run and keeps
   them in this site's private Blobs store, so no secret has to be copied by hand. */
type Secrets = { session: string; enc: string };
let cached: Secrets | null = null;
async function secrets(): Promise<Secrets> {
  if (cached) return cached;
  let s = await getJSON<Secrets>("system/secrets");
  if (!s) {
    await store().setJSON("system/secrets", { session: randomBytes(48).toString("base64url"), enc: randomBytes(48).toString("base64url") }, { onlyIfNew: true });
    s = (await getJSON<Secrets>("system/secrets"))!;
  }
  cached = { session: env("SESSION_SECRET") || s.session, enc: env("ENCRYPTION_KEY") || s.enc };
  return cached;
}

/* ---------- sessions (signed cookie) ---------- */
const COOKIE = "lifeos_s";
const SESSION_DAYS = 90;
export async function makeSessionCookie(uid: string) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const body = `${uid}.${exp}`;
  const sig = createHmac("sha256", (await secrets()).session).update(body).digest("base64url");
  return `${COOKIE}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export async function sessionUid(req: Request): Promise<string | null> {
  const raw = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const [uid, exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!uid || !exp || !sig) return null;
  const want = createHmac("sha256", (await secrets()).session).update(`${uid}.${exp}`).digest("base64url");
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  if (Number(exp) < Date.now()) return null;
  return uid;
}

/* ---------- encryption for third-party tokens ---------- */
async function encKey() {
  return createHash("sha256").update((await secrets()).enc).digest();
}
export async function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", await encKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
export async function decrypt(box: string) {
  const [iv, tag, data] = box.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", await encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/* ---------- profile ---------- */
export type Profile = {
  uid: string; email: string; createdAt: string; tz?: string;
  ingestKey?: string; onboarded?: boolean; cardsSyncedAt?: string;
  name?: string; avatar?: string; socials?: import("./social.mts").Social[];
  oura?: { enc: string; lastSync?: string; lastError?: string };
  ics?: { enc: string }; // one calendar, from before several were allowed
  calendars?: import("./calendar.mts").CalSource[];
};
export const profileKey = (uid: string) => `u/${uid}/profile`;
export const getProfile = (uid: string) => getJSON<Profile>(profileKey(uid));
export const saveProfile = (p: Profile) => setJSON(profileKey(p.uid), p);

export function env_(k: string) { return env(k); }
