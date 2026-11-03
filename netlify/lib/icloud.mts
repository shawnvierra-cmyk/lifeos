// iCloud Calendar over CalDAV. The person signs in with their Apple ID and an
// app-specific password (Apple's rule for third-party apps); LifeOS finds every
// calendar on the account and reads it. Credentials are stored encrypted.
import { decrypt, encrypt } from "./core.mts";
import { parseIcs, type CalSource, type RawEvent } from "./calendar.mts";

const ROOT = "https://caldav.icloud.com/";
type Creds = { user: string; pass: string };

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
/** Pull `<x:tag>…</x:tag>` bodies regardless of namespace prefix. */
const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "g"))].map((m) => m[1]);
const responses = (xml: string) => tag(xml, "response");
const absolute = (href: string, base: string) => new URL(unescape(href.trim()), base).toString();

async function dav(c: Creds, url: string, method: string, depth: string, body: string) {
  const res = await fetch(url, {
    method, headers: { authorization: "Basic " + Buffer.from(`${c.user}:${c.pass}`).toString("base64"), depth, "content-type": "application/xml; charset=utf-8", "user-agent": "LifeOS/1.0" }, body,
  }).catch(() => null);
  if (!res) throw new Error("Couldn't reach iCloud. Try again in a minute.");
  if (res.status === 401 || res.status === 403) throw new Error("Apple didn't accept that Apple ID or app-specific password. Make a fresh app-specific password at account.apple.com and try again.");
  if (!res.ok && res.status !== 207) throw new Error(`iCloud returned ${res.status}. Try again in a minute.`);
  return res.text();
}

/** Sign in, then find the calendar home and every calendar that holds events. */
export async function icloudConnect(user: string, pass: string) {
  const c: Creds = { user: user.trim(), pass: pass.replace(/[\s-]/g, "") };
  const p1 = await dav(c, ROOT, "PROPFIND", "0", `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`);
  const principalHref = tag(tag(p1, "current-user-principal")[0] || "", "href")[0];
  if (!principalHref) throw new Error("iCloud signed in but didn't show a calendar account. Is iCloud Calendar turned on for this Apple ID?");
  const principal = absolute(principalHref, ROOT);
  const p2 = await dav(c, principal, "PROPFIND", "0", `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`);
  const homeHref = tag(tag(p2, "calendar-home-set")[0] || "", "href")[0];
  if (!homeHref) throw new Error("iCloud didn't show a calendar home for this account.");
  const home = absolute(homeHref, principal);
  const calendars = await listCalendars(c, home);
  if (!calendars.length) throw new Error("No calendars with events were found on this iCloud account.");
  return { enc: await encrypt(JSON.stringify(c)), email: c.user, home, calendars };
}

async function listCalendars(c: Creds, home: string) {
  const xml = await dav(c, home, "PROPFIND", "1", `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`);
  const out: { id: string; name: string }[] = [];
  for (const r of responses(xml)) {
    const href = tag(r, "href")[0]; if (!href) continue;
    const rt = tag(r, "resourcetype")[0] || "";
    if (!/<(?:[\w-]+:)?calendar(?:\s[^>]*)?\/>/.test(rt) && !/<(?:[\w-]+:)?calendar(?:\s[^>]*)?>\s*<\//.test(rt)) continue;
    const comps = tag(r, "supported-calendar-component-set")[0] || "";
    if (comps && !/name="VEVENT"/i.test(comps)) continue;
    const name = unescape(tag(r, "displayname")[0] || "").trim() || "Calendar";
    if (/^(inbox|outbox|notification)/i.test(href.split("/").filter(Boolean).pop() || "")) continue;
    out.push({ id: absolute(href, home), name: name.slice(0, 60) });
  }
  return out.slice(0, 25);
}

const davStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Events across every iCloud calendar inside the window. */
export async function icloudEvents(s: CalSource, from: Date, to: Date): Promise<RawEvent[]> {
  const c = JSON.parse(await decrypt(s.enc)) as Creds;
  const cals = s.calendars || [];
  const out: RawEvent[] = [];
  await Promise.all(cals.map(async (cal) => {
    const xml = await dav(c, cal.id, "REPORT", "1", `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${davStamp(from)}" end="${davStamp(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`);
    for (const data of tag(xml, "calendar-data")) {
      const ics = unescape(data.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, ""));
      try { out.push(...parseIcs(ics, from, to)); } catch { /* one bad event never hides the rest */ }
    }
  }));
  return out;
}
