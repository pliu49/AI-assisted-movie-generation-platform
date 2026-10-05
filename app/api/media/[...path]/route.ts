import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { mediaAbs } from "@/lib/server/paths";
import { EXT_MIME } from "@/lib/server/providers/common";

export const dynamic = "force-dynamic";

// Serves generated files from data/media with HTTP range support (needed for video seeking).
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  let abs: string;
  try {
    abs = mediaAbs(parts.join("/"));
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  let size: number;
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) throw new Error("not a file");
    size = stat.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const ext = path.extname(abs).slice(1).toLowerCase();
  const headers: Record<string, string> = {
    "Content-Type": EXT_MIME[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    // File names contain a timestamp, so a given URL never changes content.
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  if (new URL(req.url).searchParams.has("download")) {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`;
  }

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
