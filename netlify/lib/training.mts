// Workouts, routines and the assistant that builds or logs a workout from one sentence.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getJSON, newId, setJSON, store } from "./core.mts";
import { aiAvailable } from "./health.mts";

export type SetRow = { weight: number | null; reps: number | null; done?: boolean };
export type Exercise = { name: string; targetReps?: string; sets: SetRow[] };
export type Workout = {
  id: string; date: string; title: string; note?: string; durationMin?: number; exercises: Exercise[];
  status: "planned" | "active" | "done"; source: "voice" | "manual" | "routine"; createdAt: string; startedAt?: string; completedAt?: string; volume?: number;
};
export type Routine = { id: string; title: string; exercises: Exercise[]; createdAt: string };

export const workoutKey = (uid: string, id: string) => `u/${uid}/workout/${id}`;
export const routineKey = (uid: string, id: string) => `u/${uid}/routine/${id}`;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v) * 10) / 10));

export function cleanExercises(input: unknown): Exercise[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 25).map((e: any) => ({
    name: str(e?.name, 80) || "Exercise",
    targetReps: str(e?.targetReps, 20) || undefined,
    sets: (Array.isArray(e?.sets) ? e.sets : []).slice(0, 15).map((s: any) => ({ weight: num(s?.weight), reps: s?.reps == null ? null : Math.round(Number(s.reps) || 0), done: !!s?.done })),
  })).filter((e) => e.name);
}
export function volumeOf(w: { exercises: Exercise[] }) {
  let v = 0;
  for (const e of w.exercises) for (const s of e.sets) if (s.done && s.weight && s.reps) v += s.weight * s.reps;
  return Math.round(v);
}

export async function listDocs<T>(prefix: string, limit = 400): Promise<T[]> {
  const { blobs } = await store().list({ prefix });
  const keys = blobs.map((b) => b.key).sort().slice(-limit);
  const out: T[] = [];
  for (let i = 0; i < keys.length; i += 25) { const got = await Promise.all(keys.slice(i, i + 25).map((k) => getJSON<T>(k))); for (const g of got) if (g) out.push(g); }
  return out;
}

const Plan = z.object({
  intent: z.enum(["plan_workout", "log_workout", "note", "unknown"]),
  reply: z.string().describe("One short sentence back to the person, plain, no exclamation marks"),
  workout: z.object({
    title: z.string(), note: z.string().nullable(), durationMin: z.number().nullable(),
    exercises: z.array(z.object({
      name: z.string(), targetReps: z.string().nullable().describe("e.g. 8-10"),
      sets: z.array(z.object({ weight: z.number().nullable(), reps: z.number().nullable() })),
    })),
  }).nullable(),
  noteText: z.string().nullable(),
});

const envGet = (k: string) => (globalThis as any).Netlify?.env?.get(k) ?? process.env[k];

/** Turn what the person said into a planned workout, a logged workout, or a note. */
export async function assist(text: string, ctx: { date: string; routines: string[]; recent: string[]; unit: string }) {
  if (!aiAvailable()) throw Object.assign(new Error("The assistant needs Claude, which isn't switched on for this site yet."), { code: 503 });
  const apiKey = envGet("ANTHROPIC_API_KEY"), baseURL = envGet("ANTHROPIC_BASE_URL");
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}), ...(baseURL ? { baseURL } : {}), timeout: 50_000, maxRetries: 0 });
  const prompt = `You are the assistant inside a personal training app. The person said (dictated, may have speech errors):
"${text}"

Today is ${ctx.date}. Weights are in ${ctx.unit}. Their saved routines: ${ctx.routines.join("; ") || "none"}. Recent workouts: ${ctx.recent.join("; ") || "none"}.

Decide the intent:
- plan_workout: they want a workout built ("45 minutes, dumbbells, chest and biceps"). Build a sensible session for the time, equipment and focus they gave: 4 to 8 exercises, 3 to 4 sets each, a targetReps range, weight null unless they said it. Warm-up first if time allows. Title it plainly ("Chest & biceps, dumbbells").
- log_workout: they describe something already done ("did 3 sets of 10 bench at 135, then squats 5x5 at 225"). Record exactly the sets, reps and weights they said, nothing more.
- note: a thought to save, not a workout.
- unknown: none of the above; ask one short clarifying question in reply.
Never invent weights or exercises they didn't ask for when logging. Keep exercise names standard ("Dumbbell Bench Press").`;
  const res = await client.messages.parse({ model: "claude-opus-5-5", max_tokens: 4000, output_config: { effort: "low", format: zodOutputFormat(Plan) }, messages: [{ role: "user", content: prompt }] });
  const o = res.parsed_output;
  if (!o) throw new Error("Didn't catch that. Try once more.");
  const workout = o.workout ? { title: str(o.workout.title, 80) || "Workout", note: str(o.workout.note, 500) || undefined, durationMin: num(o.workout.durationMin) ?? undefined, exercises: cleanExercises(o.workout.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: o.intent === "log_workout" })) }))) } : null;
  return { intent: o.intent, reply: str(o.reply, 300), workout, noteText: str(o.noteText, 5000) || null };
}

export function newWorkout(uid: string, d: any, source: Workout["source"]): Workout {
  const exercises = cleanExercises(d.exercises);
  const status: Workout["status"] = ["planned", "active", "done"].includes(d.status) ? d.status : "planned";
  const w: Workout = {
    id: str(d.id, 40) || newId(), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : new Date().toISOString().slice(0, 10),
    title: str(d.title, 80) || "Workout", note: str(d.note, 500) || undefined, durationMin: num(d.durationMin) ?? undefined,
    exercises, status, source, createdAt: str(d.createdAt, 40) || new Date().toISOString(),
    startedAt: str(d.startedAt, 40) || undefined, completedAt: str(d.completedAt, 40) || undefined,
  };
  w.volume = volumeOf(w);
  return w;
}
