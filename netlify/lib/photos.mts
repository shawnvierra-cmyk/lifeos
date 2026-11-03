// Credited header photos from Wikimedia Commons (free licenses, author always named).
const UA = "LifeOS/1.0 (https://life.from5to10million.com; personal dashboard)";
const strip = (h: string) => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

export type PhotoHit = { title: string; thumb: string; url: string; width: number; height: number; credit: string; source: string };

export async function searchCommons(q: string): Promise<PhotoHit[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "24",
    gsrsearch: `${q} filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1600",
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "user-agent": UA } })
    .catch(() => { throw new Error("Photo search is unavailable right now. Upload your own photo instead."); });
  if (!res.ok) throw new Error("Photo search is unavailable right now.");
  const data: any = await res.json();
  const pages: any[] = Object.values(data?.query?.pages ?? {}).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
  const hits: PhotoHit[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime) || ii.width < 700) continue;
    const md = ii.extmetadata ?? {};
    const artist = strip(md.Artist?.value) || "Unknown author";
    const license = strip(md.LicenseShortName?.value) || "see source";
    if (/^(Unknown|Anonymous)/i.test(artist) && !/public domain/i.test(license)) continue;
    hits.push({
      title: strip(p.title).replace(/^File:/, "").replace(/\.\w+$/, ""),
      thumb: ii.thumburl?.replace(/\/\d+px-/, "/480px-") ?? ii.url,
      url: ii.thumburl ?? ii.url,
      width: ii.thumbwidth ?? ii.width, height: ii.thumbheight ?? ii.height,
      credit: `Photo: ${artist.slice(0, 80)} / Wikimedia Commons, ${license}`,
      source: ii.descriptionurl,
    });
    if (hits.length >= 16) break;
  }
  // Wide photos first: they fill a 16:10 header without heavy cropping.
  return hits.sort((a, b) => Number(b.width >= b.height * 0.9) - Number(a.width >= a.height * 0.9)).slice(0, 12);
}

export async function downloadCommons(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "upload.wikimedia.org") throw new Error("Only Wikimedia Commons photos can be fetched.");
  const res = await fetch(u, { headers: { "user-agent": UA } }).catch(() => { throw new Error("Couldn't download that photo."); });
  if (!res.ok) throw new Error("Couldn't download that photo.");
  const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Error("That isn't a photo.");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 15 * 1024 * 1024) throw new Error("That photo is too large.");
  return { type, data: buf };
}
