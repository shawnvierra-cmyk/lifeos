// Pulls the last 3 days from Oura for every user who connected a token.
// Runs at 12:00 UTC = 5:00 AM Mountain Standard Time (6:00 AM during daylight time).
import type { Config } from "@netlify/functions";
import { getJSON, store, type Profile } from "../lib/core.mts";
import { syncOura } from "../lib/health.mts";

export default async () => {
  const { blobs } = await store().list({ prefix: "u/" });
  const profiles = blobs.map((b) => b.key).filter((k) => /^u\/[^/]+\/profile$/.test(k));
  for (const key of profiles) {
    const p = await getJSON<Profile>(key);
    if (!p?.oura?.enc) continue;
    try { await syncOura(p, 3); } catch (e: any) { console.error(`Oura sync failed for ${p.uid}: ${e.message}`); }
  }
};

export const config: Config = { schedule: "0 12 * * *" };
