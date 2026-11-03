// Private media storage. Files arrive in chunks of at most 4 MB (function request limit),
// are stored as numbered parts, and are served back with HTTP Range support so
// iPhone video playback works.
import { getJSON, setJSON, store } from "./core.mts";

export const CHUNK = 4 * 1024 * 1024;
export const MAX_BYTES = 200 * 1024 * 1024;
export type MediaMeta = { id: string; type: string; size: number; chunks: number; name?: string; createdAt: string; done?: boolean };

const metaKey = (uid: string, id: string) => `u/${uid}/mediameta/${id}`;
const partKey = (uid: string, id: string, i: number) => `u/${uid}/media/${id}/${i}`;
export const getMeta = (uid: string, id: string) => getJSON<MediaMeta>(metaKey(uid, id));

const OK_TYPES = /^(image\/(jpeg|png|heic|heif|webp|gif)|video\/(mp4|quicktime|webm))$/;

export async function putChunk(uid: string, id: string, index: number, total: number, size: number, type: string, name: string, body: ArrayBuffer) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw new Error("Bad upload id");
  if (!OK_TYPES.test(type)) throw new Error("Only photos and videos can be uploaded");
  if (size > MAX_BYTES) throw new Error("Files can be up to 200 MB");
  if (total !== Math.max(1, Math.ceil(size / CHUNK)) || index < 0 || index >= total) throw new Error("Bad chunk");
  if (body.byteLength > CHUNK) throw new Error("Chunk too large");
  await store().set(partKey(uid, id, index), body);
  if (index === total - 1) await setJSON(metaKey(uid, id), { id, type, size, chunks: total, name: name.slice(0, 120), createdAt: new Date().toISOString(), done: true } satisfies MediaMeta);
}

export async function putWhole(uid: string, id: string, type: string, data: ArrayBuffer, name = "") {
  const total = Math.max(1, Math.ceil(data.byteLength / CHUNK));
  for (let i = 0; i < total; i++) await store().set(partKey(uid, id, i), data.slice(i * CHUNK, (i + 1) * CHUNK));
  await setJSON(metaKey(uid, id), { id, type, size: data.byteLength, chunks: total, name, createdAt: new Date().toISOString(), done: true } satisfies MediaMeta);
}

export async function readWhole(uid: string, id: string) {
  const m = await getMeta(uid, id);
  if (!m) return null;
  const parts = await Promise.all(Array.from({ length: m.chunks }, (_, i) => store().get(partKey(uid, id, i), { type: "arrayBuffer" })));
  return { meta: m, data: Buffer.concat(parts.map((p) => Buffer.from(p as ArrayBuffer))) };
}

export async function serveMedia(req: Request, uid: string, id: string) {
  const m = await getMeta(uid, id);
  if (!m?.done) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = { "content-type": m.type, "accept-ranges": "bytes", "cache-control": "private, max-age=31536000, immutable" };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    let start = range[1] ? Number(range[1]) : NaN, end = range[2] ? Number(range[2]) : NaN;
    if (isNaN(start)) { start = Math.max(0, m.size - end); end = m.size - 1; }
    if (isNaN(end) || end >= m.size) end = m.size - 1;
    if (start >= m.size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${m.size}` } });
    // serve at most the rest of the chunk that holds `start`
    const ci = Math.floor(start / CHUNK);
    end = Math.min(end, (ci + 1) * CHUNK - 1);
    const part = (await store().get(partKey(uid, id, ci), { type: "arrayBuffer" })) as ArrayBuffer | null;
    if (!part) return new Response("Not found", { status: 404 });
    const slice = part.slice(start - ci * CHUNK, end - ci * CHUNK + 1);
    return new Response(slice, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${m.size}`, "content-length": String(slice.byteLength) } });
  }
  if (m.chunks === 1) {
    const part = (await store().get(partKey(uid, id, 0), { type: "arrayBuffer" })) as ArrayBuffer | null;
    if (!part) return new Response("Not found", { status: 404 });
    return new Response(part, { headers: { ...headers, "content-length": String(part.byteLength) } });
  }
  let i = 0;
  const stream = new ReadableStream({
    async pull(c) {
      if (i >= m.chunks) return c.close();
      const p = (await store().get(partKey(uid, id, i++), { type: "arrayBuffer" })) as ArrayBuffer | null;
      if (p) c.enqueue(new Uint8Array(p));
    },
  });
  return new Response(stream, { headers: { ...headers, "content-length": String(m.size) } });
}

export async function deleteMedia(uid: string, id: string) {
  const m = await getMeta(uid, id);
  if (!m) return;
  for (let i = 0; i < m.chunks; i++) await store().delete(partKey(uid, id, i));
  await store().delete(metaKey(uid, id));
}
