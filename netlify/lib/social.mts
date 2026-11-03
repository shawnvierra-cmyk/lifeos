// Social accounts: handles the person adds, plus numbers read from Insights screenshots.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { aiAvailable } from "./health.mts";

export const PLATFORMS = ["instagram", "facebook", "threads", "tiktok", "youtube", "linkedin", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Social = {
  platform: Platform; handle: string; url?: string;
  followers?: number | null; following?: number | null; posts?: number | null; reach?: number | null; views?: number | null; engagement?: number | null;
  statsAt?: string; history?: { at: string; followers?: number | null; reach?: number | null; views?: number | null }[];
};

const str = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
export const profileUrl = (p: Platform, h: string) => ({
  instagram: `https://instagram.com/${h}`, facebook: `https://facebook.com/${h}`, threads: `https://threads.net/@${h}`, tiktok: `https://tiktok.com/@${h}`,
  youtube: `https://youtube.com/@${h}`, linkedin: `https://linkedin.com/in/${h}`, x: `https://x.com/${h}`,
})[p];

export function cleanSocials(input: unknown): Social[] {
  if (!Array.isArray(input)) return [];
  const out: Social[] = [];
  for (const s of input.slice(0, 12)) {
    const platform = PLATFORMS.find((x) => x === s?.platform); const handle = str(s?.handle, 80).replace(/^@/, "");
    if (!platform || !handle) continue;
    out.push({
      platform, handle, url: profileUrl(platform, handle),
      followers: num(s?.followers), following: num(s?.following), posts: num(s?.posts), reach: num(s?.reach), views: num(s?.views), engagement: num(s?.engagement),
      statsAt: str(s?.statsAt, 40) || undefined, history: Array.isArray(s?.history) ? s.history.slice(-60).map((h: any) => ({ at: str(h?.at, 40), followers: num(h?.followers), reach: num(h?.reach), views: num(h?.views) })) : [],
    });
  }
  return out;
}

const Shot = z.object({
  platform: z.enum([...PLATFORMS, "unknown"]),
  handle: z.string().nullable().describe("The account handle shown, without @, or null"),
  followers: z.number().nullable(), following: z.number().nullable(), posts: z.number().nullable(),
  reach: z.number().nullable().describe("Accounts reached in the period shown, if visible"),
  views: z.number().nullable().describe("Views or impressions in the period shown, if visible"),
  engagement: z.number().nullable().describe("Engagement rate as a percent, only if the screen states it"),
  period: z.string().nullable().describe("The period the stats cover, as shown, e.g. 'Last 30 days'"),
});
const envGet = (k: string) => (globalThis as any).Netlify?.env?.get(k) ?? process.env[k];

/** Read follower and reach numbers off an Insights or profile screenshot. Only what is printed on screen. */
export async function readSocialShot(image: Buffer, mediaType: string) {
  if (!aiAvailable()) throw Object.assign(new Error("Screenshot reading isn't switched on for this site yet."), { code: 503 });
  const apiKey = envGet("ANTHROPIC_API_KEY"), baseURL = envGet("ANTHROPIC_BASE_URL");
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}), ...(baseURL ? { baseURL } : {}), timeout: 50_000, maxRetries: 1 });
  const res = await client.messages.parse({
    model: "claude-opus-5-5", max_tokens: 4000, output_config: { effort: "low", format: zodOutputFormat(Shot) },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: image.toString("base64") } },
      { type: "text", text: "This is a screenshot of a social media profile or its Insights/Analytics screen. Identify the platform and copy only the numbers printed on it. Expand abbreviations exactly (4.7K = 4700, 1.2M = 1200000). Use null for anything not visible. Never estimate." },
    ] }],
  });
  const o = res.parsed_output;
  if (!o || res.stop_reason === "refusal") throw new Error("Couldn't read that screenshot.");
  return { platform: o.platform === "unknown" ? null : o.platform, handle: o.handle ? o.handle.replace(/^@/, "").slice(0, 80) : null, followers: num(o.followers), following: num(o.following), posts: num(o.posts), reach: num(o.reach), views: num(o.views), engagement: num(o.engagement), period: o.period };
}
