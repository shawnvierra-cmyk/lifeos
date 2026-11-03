// Google account sign-in (OAuth) and the Calendar API. The person taps Continue with
// Google once; LifeOS keeps an encrypted refresh token and reads every calendar on the
// account. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the site's environment.
import { decrypt, encrypt, env_ } from "./core.mts";
import type { CalSource, RawEvent } from "./calendar.mts";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/userinfo.email"];
export const googleAvailable = () => !!(env_("GOOGLE_CLIENT_ID") && env_("GOOGLE_CLIENT_SECRET"));
export const googleRedirect = (origin: string) => `${origin}/api/connect/google/callback`;

export function googleAuthUrl(origin: string, state: string) {
  const q = new URLSearchParams({
    client_id: env_("GOOGLE_CLIENT_ID")!, redirect_uri: googleRedirect(origin), response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenCall(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env_("GOOGLE_CLIENT_ID")!, client_secret: env_("GOOGLE_CLIENT_SECRET")!, ...params }),
  }).catch(() => null);
  if (!res) throw new Error("Couldn't reach Google. Try again in a minute.");
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw Object.assign(new Error("Google has disconnected LifeOS. Tap Continue with Google again."), { code: "reconnect" });
    throw new Error(`Google sign-in failed (${j.error_description || j.error || res.status}).`);
  }
  return j as { access_token: string; refresh_token?: string; expires_in: number };
}

/** Finish sign-in: trade the code for tokens and learn which calendars the account has. */
export async function googleConnect(origin: string, code: string) {
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: googleRedirect(origin) });
  if (!t.refresh_token) throw new Error("Google didn't give LifeOS lasting access. Remove LifeOS at myaccount.google.com/permissions and try again.");
  const who = await apiGet(t.access_token, "https://www.googleapis.com/oauth2/v3/userinfo").catch(() => ({}));
  const calendars = await googleCalendarList(t.access_token);
  return { enc: await encrypt(t.refresh_token), email: String(who.email || ""), calendars };
}

async function apiGet(token: string, url: string) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res) throw new Error("Couldn't reach Google. Try again in a minute.");
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google returned ${res.status}${j?.error?.message ? `: ${j.error.message}` : ""}.`);
  return j;
}

export async function googleCalendarList(token: string) {
  const j = await apiGet(token, "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50");
  return ((j.items || []) as any[])
    .filter((c) => c.selected !== false && !/holiday|weeknum|#contacts/i.test(c.id || ""))
    .map((c) => ({ id: String(c.id), name: String(c.summaryOverride || c.summary || c.id).slice(0, 60) }))
    .slice(0, 25);
}

const iso = (d: Date) => d.toISOString();
const stamp = (v: any) => (v?.dateTime ? new Date(v.dateTime) : v?.date ? new Date(v.date + "T00:00:00Z") : new Date(NaN));

/** Events across every calendar on the account inside the window. */
export async function googleEvents(s: CalSource, from: Date, to: Date): Promise<RawEvent[]> {
  const refresh = await decrypt(s.enc);
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
  const cals = s.calendars?.length ? s.calendars : [{ id: "primary", name: "Primary" }];
  const out: RawEvent[] = [];
  await Promise.all(cals.map(async (c) => {
    let pageToken = "";
    for (let page = 0; page < 4; page++) {
      const q = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin: iso(from), timeMax: iso(to), maxResults: "250", ...(pageToken ? { pageToken } : {}) });
      const j = await apiGet(t.access_token, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${q}`);
      for (const e of (j.items || []) as any[]) {
        if (e.status === "cancelled") continue;
        const start = stamp(e.start), end = stamp(e.end);
        if (isNaN(start.getTime())) continue;
        out.push({
          uid: String(e.iCalUID || e.id), title: String(e.summary || "Busy"), location: String(e.location || ""),
          description: String(e.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          start, end: isNaN(end.getTime()) ? start : end, allDay: !!e.start?.date, recurring: !!e.recurringEventId,
        });
      }
      pageToken = j.nextPageToken || "";
      if (!pageToken) break;
    }
  }));
  return out;
}
