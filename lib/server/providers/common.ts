import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import sharp from "sharp";

export type CheckResult =
  | { state: "pending"; detail?: string }
  | { state: "done"; url: string }
  | { state: "failed"; error: string };

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
};

export const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  srt: "text/plain; charset=utf-8",
};

/** Download a provider result to `baseNoExt.<ext>`. Provider URLs expire, so we always keep a local copy. */
export async function downloadTo(url: string, baseNoExt: string, fallbackExt: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url.slice(0, 120)}`);
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const urlExt = new URL(url).pathname.split(".").pop()?.toLowerCase();
  const ext = MIME_EXT[mime] ?? (urlExt && EXT_MIME[urlExt] ? urlExt : fallbackExt);
  const abs = `${baseNoExt}.${ext}`;
  await pipeline(Readable.fromWeb(res.body as unknown as NodeWebStream), createWriteStream(abs));
  return { abs, mime: EXT_MIME[ext] ?? mime };
}

/** Re-encode an image as a <=2048px JPEG: small enough to upload or inline as base64. */
export async function jpegForUpload(abs: string) {
  return sharp(abs).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
}

export async function jpegDataUri(abs: string) {
  return `data:image/jpeg;base64,${(await jpegForUpload(abs)).toString("base64")}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll a provider until the job finishes. Tolerates a few transient network errors. */
export async function pollUntilDone(check: () => Promise<CheckResult>, timeoutMs = 30 * 60_000) {
  const started = Date.now();
  let delay = 2500;
  let failures = 0;
  for (;;) {
    await sleep(delay);
    let result: CheckResult;
    try {
      result = await check();
      failures = 0;
    } catch (err) {
      if (++failures >= 5) throw err;
      continue;
    }
    if (result.state === "done") return result.url;
    if (result.state === "failed") throw new Error(result.error);
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for the provider (30 min).");
    delay = Math.min(delay + 1000, 8000);
  }
}
