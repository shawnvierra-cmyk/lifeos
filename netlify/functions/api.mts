// LifeOS API. Every route except signup, login and the Apple Health Shortcut
// endpoint requires a signed session cookie, and every read and write is scoped
// to that user's own keys (u/<uid>/...), which keeps tenants apart.
import type { Config, Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import {
  clearSessionCookie, emailKey, encrypt, env_, err, getJSON, getProfile, hashPassword, isYmd, json, makeSessionCookie,
  newId, saveProfile, sessionUid, setJSON, store, verifyPassword, ymdInTz, type Profile,
} from "../lib/core.mts";
import { checkOuraToken, ingestAppleRows, listDays, logDay, putDay, readScreenshot, faceFocus, writeGuide, aiAvailable, aiSource, SOURCES, cleanFields, type Source, type Day } from "../lib/health.mts";
import { calendarEvents, calendarSources, hasCalendar, fetchIcs, icsHost, parseEvents, validIcsUrl, MAX_CALENDARS } from "../lib/calendar.mts";
import { deleteMedia, getMeta, putChunk, putWhole, readWhole, serveMedia } from "../lib/media.mts";
import { downloadCommons, searchCommons } from "../lib/photos.mts";
import { syncOura } from "../lib/health.mts";
import { syncCards, fillPhotos, autoPhoto, tripKey, type Trip } from "../lib/cards.mts";
import { assist, listDocs, newWorkout, routineKey, workoutKey, cleanExercises, type Workout, type Routine } from "../lib/training.mts";
import { cleanSocials, readSocialShot, PLATFORMS } from "../lib/social.mts";

type Note = { id: string; at: string; text: string };

const noteKey = (uid: string, id: string) => `u/${uid}/note/${id}`;

async function listJSON<T>(prefix: string): Promise<T[]> {
  const { blobs } = await store().list({ prefix });
  const out: T[] = [];
  for (let i = 0; i < blobs.length; i += 25) {
    const got = await Promise.all(blobs.slice(i, i + 25).map((b) => getJSON<T>(b.key)));
    for (const g of got) if (g) out.push(g);
  }
  return out;
}
const body = async (req: Request) => { try { return await req.json(); } catch { return {}; } };
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function publicSettings(p: Profile) {
  return {
    email: p.email, tz: p.tz,
    oura: p.oura ? { connected: true, lastSync: p.oura.lastSync ?? null, lastError: p.oura.lastError ?? null } : { connected: false },
    calendar: { connected: hasCalendar(p), list: calendarSources(p).map((c) => ({ id: c.id, label: c.label, host: c.host })) },
    ingestKey: p.ingestKey ?? null,
    ai: aiAvailable(),
    onboarded: !!p.onboarded,
    cardsSyncedAt: p.cardsSyncedAt ?? null,
    name: p.name ?? "", avatar: p.avatar ?? null, createdAt: p.createdAt, socials: p.socials ?? [],
  };
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = path;
  const m = req.method;

  try {
    /* ----- public routes ----- */
    if (a === "auth" && b === "signup" && m === "POST") {
      const { email, password, invite, tz } = await body(req);
      // The first account is the owner. After that, sign-ups need INVITE_CODE (set in Netlify) to match.
      const want = env_("INVITE_CODE");
      const owner = await getJSON("system/owner");
      if (owner && !want) return err("Sign-ups are closed. Ask the owner for an invite.", 403);
      if (owner && str(invite, 200) !== want) return err("That invite code isn't right.", 403);
      if (!/^\S+@\S+\.\S+$/.test(str(email, 200))) return err("Enter a valid email.");
      if (str(password, 200).length < 10) return err("Use a password of at least 10 characters.");
      const key = emailKey(email);
      const uid = newId(12);
      const { modified } = await store().setJSON(key, { uid, email: str(email, 200).toLowerCase(), hash: await hashPassword(password) }, { onlyIfNew: true });
      if (!modified) return err("An account with that email already exists. Sign in instead.", 409);
      if (!owner) await store().setJSON("system/owner", { uid, at: new Date().toISOString() }, { onlyIfNew: true });
      const p: Profile = { uid, email: str(email, 200).toLowerCase(), createdAt: new Date().toISOString(), ingestKey: newId(24), tz: str(tz, 60) || undefined };
      await saveProfile(p);
      await setJSON(`ingest/${p.ingestKey}`, { uid });
      return json({ ok: true }, 200, { "set-cookie": await makeSessionCookie(uid) });
    }
    if (a === "auth" && b === "login" && m === "POST") {
      const { email, password } = await body(req);
      const u = await getJSON<{ uid: string; hash: string }>(emailKey(str(email, 200)));
      if (!u || !(await verifyPassword(str(password, 200), u.hash))) return err("Email or password is wrong.", 401);
      return json({ ok: true }, 200, { "set-cookie": await makeSessionCookie(u.uid) });
    }
    if (a === "auth" && b === "status" && m === "GET") {
      const owner = await getJSON("system/owner");
      console.log(`LifeOS status: ai=${aiSource()} owner=${owner ? "yes" : "none"}`);
      return json({ firstUser: !owner, signupsOpen: !owner || !!env_("INVITE_CODE") });
    }
    if (a === "health" && m === "GET") {
      let storage = false;
      try { await store().list({ prefix: "system/" }); storage = true; } catch {}
      console.log(`LifeOS health: ai=${aiSource()} storage=${storage}`);
      return json({ ok: storage, ai: aiAvailable(), aiSource: aiSource(), storage, deploy: context.deploy?.id || "dev", time: new Date().toISOString() });
    }
    if (a === "auth" && b === "logout" && m === "POST") return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });

    // Apple Health Shortcut: POST /api/ingest/apple with header Authorization: Bearer <key>
    if (a === "ingest" && b === "apple" && m === "POST") {
      const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
      const map = key.length > 20 ? await getJSON<{ uid: string }>(`ingest/${key}`) : null;
      if (!map) return err("Unknown Shortcut key. Copy it again from LifeOS settings.", 401);
      const n = await ingestAppleRows(map.uid, await body(req), "Shortcut");
      return json({ ok: true, days: n });
    }

    /* ----- everything below needs a session ----- */
    const uid = await sessionUid(req);
    if (!uid) return err("Sign in first.", 401);
    if (m !== "GET" && req.headers.get("x-lifeos") !== "1") return err("Bad request.", 400); // CSRF guard
    const p = await getProfile(uid);
    if (!p) return err("Account not found.", 401);

    if (a === "state" && m === "GET") {
      const tz = url.searchParams.get("tz");
      if (tz && tz !== p.tz && tz.length < 60) { p.tz = tz; await saveProfile(p); }
      const since = url.searchParams.get("since") || undefined;
      const [days, trips, notes, workouts, routines] = await Promise.all([listDays(uid, since), listJSON<Trip>(`u/${uid}/trip/`), listJSON<Note>(`u/${uid}/note/`), listDocs<Workout>(`u/${uid}/workout/`, 400), listDocs<Routine>(`u/${uid}/routine/`, 50)]);
      notes.sort((x, y) => (x.at < y.at ? 1 : -1));
      workouts.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.createdAt < y.createdAt ? 1 : -1));
      return json({ settings: publicSettings(p), days, trips, notes, workouts, routines, deploy: context.deploy?.id || "dev" });
    }

    /* health */
    if (a === "log" && m === "POST") {
      const { date, source, fields, via, shot } = await body(req);
      if (!SOURCES.includes(source)) return err("Unknown source.");
      if (!isYmd(date)) return err("Pick a valid day.");
      const clean = cleanFields(source as Source, fields || {});
      if (!Object.keys(clean).length) return err("No values to log.");
      const r = await logDay(uid, date, source, clean, str(via, 40) || "Manual", str(shot, 40) || undefined);
      return json({ day: r.day, prev: r.prev });
    }
    if (a === "day" && b && m === "PUT") {
      const { doc } = await body(req);
      await putDay(uid, b, doc as Day | null);
      return json({ ok: true });
    }
    if (a === "screenshot" && m === "POST") {
      const type = (req.headers.get("content-type") || "").split(";")[0];
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return err("Send a JPEG or PNG screenshot.");
      const buf = Buffer.from(await req.arrayBuffer());
      if (buf.byteLength > 4.5 * 1024 * 1024) return err("That screenshot is too large.");
      const today = isYmd(url.searchParams.get("today")) ? url.searchParams.get("today")! : ymdInTz(new Date(), p.tz);
      const shot = newId(12);
      const [read] = await Promise.all([readScreenshot(buf, type, today), putWhole(uid, shot, type, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "screenshot")]);
      if (!read.source || !Object.keys(read.fields).length) return json({ logged: false, reason: "No health numbers found in that screenshot, so nothing was logged.", shot });
      if (!read.date) return json({ logged: false, needsDate: true, source: read.source, fields: read.fields, shot });
      const r = await logDay(uid, read.date, read.source, read.fields, "Screenshot", shot);
      return json({ logged: true, source: read.source, date: read.date, fields: read.fields, day: r.day, prev: r.prev, shot });
    }
    if (a === "import" && b === "apple" && m === "POST") {
      const n = await ingestAppleRows(uid, (await body(req)).rows ?? [], "Health export");
      return json({ days: n });
    }

    /* connections */
    if (a === "settings" && b === "oura" && m === "POST") {
      const token = str((await body(req)).token, 300);
      if (!token) return err("Paste your Oura personal access token.");
      if (!(await checkOuraToken(token))) return err("Oura didn't accept that token. Create a new one and try again.");
      p.oura = { enc: await encrypt(token) }; await saveProfile(p);
      const r = await syncOura(p, 30).catch((e) => ({ days: 0, error: e.message }));
      return json({ settings: publicSettings(p), sync: r });
    }
    if (a === "settings" && b === "oura" && m === "DELETE") { delete p.oura; await saveProfile(p); return json({ settings: publicSettings(p) }); }
    if (a === "sync" && b === "oura" && m === "POST") {
      if (!p.oura) return err("Connect Oura first.");
      const r = await syncOura(p, 7);
      return json({ settings: publicSettings(p), sync: r });
    }
    if (a === "settings" && b === "calendar" && m === "POST") {
      const d = await body(req);
      const u = validIcsUrl(str(d.url, 2000));
      if (!u) return err("Paste the secret address in iCal format from your calendar's settings.");
      const have = calendarSources(p);
      if (have.length >= MAX_CALENDARS) return err(`Up to ${MAX_CALENDARS} calendars per account.`);
      const enc = await encrypt(u);
      const label = str(d.label, 30) || (have.length === 0 ? "Personal" : have.length === 1 ? "Work" : `Calendar ${have.length + 1}`);
      if (have.some((c) => c.label.toLowerCase() === label.toLowerCase())) return err(`You already have a calendar called ${label}. Pick another name.`);
      let count = 0;
      try { count = parseEvents(await fetchIcs(enc, `your ${label} calendar`), new Date(Date.now() - 2 * 864e5), new Date(Date.now() + 45 * 864e5)).length; }
      catch (e: any) { return err(e.message); }
      // Move a single pre-existing address into the list so everything lives in one place.
      if (p.ics?.enc) { p.calendars = [{ id: newId(6), label: "Calendar", enc: p.ics.enc, host: "Google", addedAt: p.createdAt }, ...(p.calendars || [])]; delete p.ics; }
      p.calendars = [...(p.calendars || []), { id: newId(6), label, enc, host: icsHost(u), addedAt: new Date().toISOString() }];
      await saveProfile(p); await store().delete(`u/${uid}/cache/calendar`);
      return json({ settings: publicSettings(p), count, label });
    }
    if (a === "settings" && b === "calendar" && m === "DELETE") {
      const id = str((await body(req)).id, 40);
      if (!id) { delete p.ics; delete p.calendars; }
      else if (id === "legacy") delete p.ics;
      else p.calendars = (p.calendars || []).filter((c) => c.id !== id);
      await saveProfile(p); await store().delete(`u/${uid}/cache/calendar`);
      return json({ settings: publicSettings(p) });
    }
    if (a === "settings" && b === "profile" && m === "POST") {
      const d = await body(req);
      if (typeof d.name === "string") p.name = str(d.name, 60);
      if (typeof d.avatar === "string") { const mm = await getMeta(uid, str(d.avatar, 40)); if (!mm?.type.startsWith("image/")) return err("Upload a photo first."); p.avatar = mm.id; }
      if (d.avatar === null) p.avatar = undefined;
      await saveProfile(p);
      return json({ settings: publicSettings(p) });
    }
    if (a === "settings" && b === "socials" && m === "POST") {
      const d = await body(req);
      const next = cleanSocials(d.socials);
      // keep stats already recorded for accounts that stay
      for (const s of next) { const old = p.socials?.find((o) => o.platform === s.platform && o.handle.toLowerCase() === s.handle.toLowerCase()); if (old) Object.assign(s, { followers: s.followers ?? old.followers, following: s.following ?? old.following, posts: s.posts ?? old.posts, reach: s.reach ?? old.reach, views: s.views ?? old.views, engagement: s.engagement ?? old.engagement, statsAt: s.statsAt ?? old.statsAt, history: old.history ?? [] }); }
      p.socials = next; await saveProfile(p);
      return json({ settings: publicSettings(p) });
    }
    if (a === "social" && b === "screenshot" && m === "POST") {
      const type = (req.headers.get("content-type") || "").split(";")[0];
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return err("Send a JPEG or PNG screenshot.");
      const buf = Buffer.from(await req.arrayBuffer());
      if (buf.byteLength > 4.5 * 1024 * 1024) return err("That screenshot is too large.");
      const r = await readSocialShot(buf, type);
      if (!r.platform) return json({ logged: false, reason: "Couldn't tell which platform that is. Nothing was saved." });
      const socials = p.socials ?? [];
      let s = socials.find((x) => x.platform === r.platform && (!r.handle || x.handle.toLowerCase() === r.handle.toLowerCase())) || socials.find((x) => x.platform === r.platform);
      if (!s) { if (!r.handle) return json({ logged: false, reason: `No ${r.platform} account on your profile yet, and the screenshot doesn't show a handle. Add the account first.` }); s = { platform: r.platform, handle: r.handle, url: undefined, history: [] }; socials.push(s); }
      const now = new Date().toISOString(); const fields: string[] = [];
      for (const k of ["followers", "following", "posts", "reach", "views", "engagement"] as const) if (r[k] != null) { (s as any)[k] = r[k]; fields.push(`${k} ${r[k]!.toLocaleString()}`); }
      if (!fields.length) return json({ logged: false, reason: "No numbers found on that screenshot, so nothing was saved." });
      s.statsAt = now; s.history = [...(s.history ?? []), { at: now, followers: r.followers, reach: r.reach, views: r.views }].slice(-60);
      p.socials = cleanSocials(socials); await saveProfile(p);
      return json({ logged: true, platform: r.platform, handle: s.handle, fields, period: r.period, settings: publicSettings(p) });
    }
    if (a === "account" && m === "DELETE") {
      const d = await body(req);
      if (str(d.confirm, 200).toLowerCase() !== p.email) return err("Type your email exactly to confirm.");
      const { blobs } = await store().list({ prefix: `u/${uid}/` });
      for (let i = 0; i < blobs.length; i += 20) await Promise.all(blobs.slice(i, i + 20).map((b) => store().delete(b.key)));
      await store().delete(emailKey(p.email));
      if (p.ingestKey) await store().delete(`ingest/${p.ingestKey}`);
      const owner = await getJSON<{ uid: string }>("system/owner");
      if (owner?.uid === uid) await store().delete("system/owner");
      return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
    }
    if (a === "settings" && b === "onboarded" && m === "POST") { p.onboarded = true; await saveProfile(p); return json({ settings: publicSettings(p) }); }
    if (a === "cards" && b === "sync" && m === "POST") {
      if (!hasCalendar(p)) return err("Connect a calendar first.");
      if (!aiAvailable()) return err("Card building needs Claude, which isn't switched on for this site yet.", 503);
      const r = await syncCards(p);
      return json({ ...r, settings: publicSettings(p) });
    }
    if (a === "cards" && b === "photos" && m === "POST") return json(await fillPhotos(uid, 2));
    if (a === "settings" && b === "ingest-key" && m === "POST") {
      if (p.ingestKey) await store().delete(`ingest/${p.ingestKey}`);
      p.ingestKey = newId(24); await saveProfile(p); await setJSON(`ingest/${p.ingestKey}`, { uid });
      return json({ settings: publicSettings(p) });
    }
    if (a === "calendar" && m === "GET") {
      if (!hasCalendar(p)) return json({ connected: false, events: [] });
      try { const r = await calendarEvents(p, url.searchParams.get("force") === "1"); return json({ connected: true, ...r }); }
      catch (e: any) { return json({ connected: true, events: [], error: e.message }); }
    }

    /* media */
    if (a === "upload" && m === "POST") {
      const h = (k: string) => req.headers.get(k) || "";
      await putChunk(uid, h("x-upload-id"), Number(h("x-chunk-index")), Number(h("x-chunk-total")), Number(h("x-total-size")), h("x-content-type"), decodeURIComponent(h("x-filename")), await req.arrayBuffer());
      return json({ ok: true });
    }
    if (a === "media" && b && m === "GET") return serveMedia(req, uid, b);

    /* trips */
    if (a === "trips" && !b && m === "POST") {
      const d = await body(req);
      const id = str(d.id, 40) || newId();
      const prev = await getJSON<Trip>(tripKey(uid, id));
      const start = isYmd(d.start) ? d.start : ymdInTz(new Date(), p.tz);
      const end = isYmd(d.end) && d.end >= start ? d.end : start;
      const t: Trip = {
        id, title: str(d.title, 120) || "Untitled", type: ["trip", "concert", "event"].includes(d.type) ? d.type : "trip",
        place: str(d.place, 160), start, end, calId: str(d.calId, 300) || prev?.calId,
        seedId: prev?.seedId, summary: typeof d.summary === "string" ? str(d.summary, 4000) : prev?.summary,
        itinerary: Array.isArray(d.itinerary) ? d.itinerary.slice(0, 60).map((x: any) => ({ at: str(x?.at, 20), text: str(x?.text, 300) })).filter((x: any) => x.text) : prev?.itinerary,
        photo: prev?.photo, journal: prev?.journal ?? [], createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
      await setJSON(tripKey(uid, id), t);
      return json({ trip: t });
    }
    if (a === "trips" && b && !c && m === "DELETE") {
      const t = await getJSON<Trip>(tripKey(uid, b));
      if (t) { await setJSON(`u/${uid}/archive/trip-${b}-${Date.now()}`, t); await store().delete(tripKey(uid, b)); }
      return json({ ok: true });
    }
    if (a === "trips" && b && c === "journal" && m === "POST") {
      const t = await getJSON<Trip>(tripKey(uid, b));
      if (!t) return err("Card not found.", 404);
      const d = await body(req);
      const media = [];
      for (const id of (Array.isArray(d.media) ? d.media : []).slice(0, 30)) { const mm = await getMeta(uid, String(id)); if (mm) media.push({ id: mm.id, type: mm.type }); }
      const text = str(d.text, 20000);
      if (!text && !media.length) return err("Add text or a photo.");
      t.journal.push({ id: newId(), at: new Date().toISOString(), text, media });
      await setJSON(tripKey(uid, b), t);
      return json({ trip: t });
    }
    if (a === "trips" && b && c === "guide" && m === "POST") {
      const t = await getJSON<Trip>(tripKey(uid, b));
      if (!t) return err("Card not found.", 404);
      if (!t.guide) { const g = await writeGuide(t); if (g) { t.guide = g; await setJSON(tripKey(uid, b), t); } }
      return json({ trip: t });
    }
    if (a === "trips" && b && c === "photo" && m === "POST") {
      const t = await getJSON<Trip>(tripKey(uid, b));
      if (!t) return err("Card not found.", 404);
      const d = await body(req);
      const credit = str(d.credit, 200);
      if (!credit) return err("Every header photo needs a credit.");
      let mediaId = str(d.media, 40);
      let img: { type: string; data: Buffer } | null = null;
      if (d.remoteUrl) {
        const dl = await downloadCommons(String(d.remoteUrl));
        mediaId = newId(12); await putWhole(uid, mediaId, dl.type, dl.data, "header");
        img = { type: dl.type, data: Buffer.from(dl.data) };
      } else if (mediaId) {
        const w = await readWhole(uid, mediaId);
        if (!w || !w.meta.type.startsWith("image/")) return err("Upload a photo first.");
        if (w.data.byteLength < 4.5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(w.meta.type)) img = { type: w.meta.type, data: w.data };
      } else return err("Choose a photo.");
      let focus = Number.isFinite(Number(d.focus)) ? Math.max(0, Math.min(100, Number(d.focus))) : null;
      if (focus === null && img) { const f = await faceFocus(img.data, img.type); if (f !== null) focus = Math.max(0, f - 8); }
      t.photo = { media: mediaId, credit, focus: focus ?? 25, source: str(d.source, 500) || undefined };
      await setJSON(tripKey(uid, b), t);
      return json({ trip: t });
    }
    if (a === "photos" && b === "search" && m === "GET") {
      const q = str(url.searchParams.get("q"), 120);
      if (!q) return json({ hits: [] });
      return json({ hits: await searchCommons(q) });
    }

    /* cards from a file (Claude's email scan, a Muse export, or your own JSON). At most 2 per call: each may fetch a photo. */
    if (a === "import" && b === "cards" && m === "POST") {
      const d = await body(req);
      const cards: any[] = Array.isArray(d.cards) ? d.cards.slice(0, 2) : [];
      if (!cards.length) return err("No cards in that file.");
      const have = new Set((await listJSON<Trip>(`u/${uid}/trip/`)).map((t) => t.seedId).filter(Boolean));
      const imported: string[] = []; let skipped = 0;
      for (const c of cards) {
        const title = str(c?.title, 120); const start = isYmd(c?.start) ? c.start : null;
        if (!title || !start) { skipped++; continue; }
        const seedId = str(c?.seedId, 80) || undefined;
        if (seedId && have.has(seedId)) { skipped++; continue; }
        const type = ["trip", "concert", "event"].includes(c?.type) ? c.type : "trip";
        const t: Trip = {
          id: newId(), seedId, title, type, place: str(c?.place, 160), start, end: isYmd(c?.end) && c.end >= start ? c.end : start,
          summary: str(c?.summary, 4000) || undefined,
          guide: c?.guide && typeof c.guide.body === "string" ? { kind: str(c.guide.kind, 30) || "City guide", title: str(c.guide.title, 80), body: str(c.guide.body, 900), linkLabel: str(c.guide.linkLabel, 60) || undefined, linkUrl: /^https:\/\/\S+$/.test(c.guide.linkUrl || "") ? str(c.guide.linkUrl, 300) : undefined, at: new Date().toISOString() } : undefined,
          itinerary: Array.isArray(c?.itinerary) ? c.itinerary.slice(0, 60).map((x: any) => ({ at: str(x?.at, 20), text: str(x?.text, 300) })).filter((x: any) => x.text) : undefined,
          journal: [], createdAt: new Date().toISOString(),
        };
        t.photo = await autoPhoto(uid, str(c?.photoQuery, 120) || `${title} ${t.place}`.trim(), type === "concert");
        await setJSON(tripKey(uid, t.id), t);
        if (seedId) have.add(seedId);
        imported.push(title);
      }
      return json({ imported, skipped });
    }

    /* training */
    if (a === "ai" && b === "assist" && m === "POST") {
      const text = str((await body(req)).text, 2000);
      if (!text) return err("Say or type what you'd like.");
      const [routines, recent] = await Promise.all([listDocs<Routine>(`u/${uid}/routine/`, 20), listDocs<Workout>(`u/${uid}/workout/`, 8)]);
      const r = await assist(text, { date: ymdInTz(new Date(), p.tz), routines: routines.map((x) => x.title), recent: recent.map((x) => `${x.date} ${x.title}`), unit: "lb" });
      if (r.intent === "note" && r.noteText) { const n: Note = { id: `${Date.now()}-${newId(4)}`, at: new Date().toISOString(), text: r.noteText }; await setJSON(noteKey(uid, n.id), n); return json({ ...r, note: n }); }
      return json(r);
    }
    if (a === "workouts" && !b && m === "POST") {
      const d = await body(req);
      const prev = d.id ? await getJSON<Workout>(workoutKey(uid, str(d.id, 40))) : null;
      const w = newWorkout(uid, { ...prev, ...d, createdAt: prev?.createdAt }, prev?.source ?? (["voice", "manual", "routine"].includes(d.source) ? d.source : "manual"));
      if (w.status === "done" && !w.completedAt) w.completedAt = new Date().toISOString();
      if (w.status === "active" && !w.startedAt) w.startedAt = new Date().toISOString();
      await setJSON(workoutKey(uid, w.id), w);
      return json({ workout: w });
    }
    if (a === "workouts" && b && m === "DELETE") {
      const w = await getJSON<Workout>(workoutKey(uid, b));
      if (w) { await setJSON(`u/${uid}/archive/workout-${b}`, w); await store().delete(workoutKey(uid, b)); }
      return json({ ok: true });
    }
    if (a === "routines" && !b && m === "POST") {
      const d = await body(req);
      const r: Routine = { id: str(d.id, 40) || newId(), title: str(d.title, 80) || "Routine", exercises: cleanExercises(d.exercises).map((e) => ({ ...e, sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })) })), createdAt: new Date().toISOString() };
      if (!r.exercises.length) return err("A routine needs at least one exercise.");
      await setJSON(routineKey(uid, r.id), r);
      return json({ routine: r });
    }
    if (a === "routines" && b && m === "DELETE") { await store().delete(routineKey(uid, b)); return json({ ok: true }); }

    /* notes */
    if (a === "notes" && !b && m === "POST") {
      const text = str((await body(req)).text, 20000);
      if (!text) return err("The note is empty.");
      const n: Note = { id: `${Date.now()}-${newId(4)}`, at: new Date().toISOString(), text };
      await setJSON(noteKey(uid, n.id), n);
      return json({ note: n });
    }
    if (a === "notes" && b && m === "DELETE") {
      const n = await getJSON<Note>(noteKey(uid, b));
      if (n) { await setJSON(`u/${uid}/archive/note-${b}`, n); await store().delete(noteKey(uid, b)); }
      return json({ ok: true });
    }
    if (a === "media" && b && m === "DELETE") { await deleteMedia(uid, b); return json({ ok: true }); }

    return err("Not found.", 404);
  } catch (e: any) {
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return err("Screenshot reading isn't switched on for this site yet.", 503);
    if (e instanceof Anthropic.RateLimitError) return err("Too many screenshots at once. Try again in a minute.", 429);
    if (e instanceof Anthropic.APIError) return err("The screenshot reader is unavailable right now. Try again shortly.", 503);
    return err(e?.message || "Something went wrong.", e?.code === 503 ? 503 : e?.code === 401 ? 400 : 500);
  }
};

export const config: Config = { path: "/api/*" };
