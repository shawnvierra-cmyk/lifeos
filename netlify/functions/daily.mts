// Once a day at 12:00 UTC (5 AM Mountain Standard, 6 AM during daylight time):
// pull Oura for everyone who connected it, rebuild cards from each calendar,
// and fetch a few missing header photos.
import type { Config } from "@netlify/functions";
import { getJSON, store, type Profile } from "../lib/core.mts";
import { syncOura } from "../lib/health.mts";
import { fillPhotos, syncCards } from "../lib/cards.mts";

export default async () => {
  const { blobs } = await store().list({ prefix: "u/" });
  const keys = blobs.map((b) => b.key).filter((k) => /^u\/[^/]+\/profile$/.test(k));
  for (const key of keys) {
    const p = await getJSON<Profile>(key);
    if (!p) continue;
    if (p.oura?.enc) { try { await syncOura(p, 3); } catch (e: any) { console.error(`Oura sync failed for ${p.uid}: ${e.message}`); } }
    if (p.ics?.enc) {
      try { await syncCards(p); await fillPhotos(p.uid, 4); } catch (e: any) { console.error(`Card sync failed for ${p.uid}: ${e.message}`); }
    }
  }
};

export const config: Config = { schedule: "0 12 * * *" };
