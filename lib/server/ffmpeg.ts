import { spawn } from "node:child_process";
import path from "node:path";
import type { AspectRatio } from "../types";

export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => {
      stderr += d;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    const timer = opts.timeoutMs ? setTimeout(() => child.kill(), opts.timeoutMs) : undefined;
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const tail = stderr.trim().split(/\r?\n/).slice(-6).join("\n");
      reject(new Error(`${path.basename(cmd)} exited with code ${code}${tail ? `: ${tail}` : ""}`));
    });
  });
}

export function ffmpeg(args: string[], cwd?: string) {
  return runProcess(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd, timeoutMs: 15 * 60_000 });
}

export async function probe(file: string): Promise<{ duration: number; hasAudio: boolean }> {
  const { stdout } = await runProcess(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type",
    "-of",
    "json",
    file,
  ]);
  const info = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  return {
    duration: Number(info.format?.duration ?? 0) || 0,
    hasAudio: (info.streams ?? []).some((s) => s.codec_type === "audio"),
  };
}

const g = globalThis as unknown as { __dramaFfmpegOk?: Promise<boolean> };
export function ffmpegAvailable(): Promise<boolean> {
  g.__dramaFfmpegOk ??= runProcess(FFMPEG, ["-version"]).then(
    () => true,
    () => false,
  );
  return g.__dramaFfmpegOk;
}

/** Output frame size for renders (720p class). */
export function frameSize(ar: AspectRatio) {
  if (ar === "16:9") return { w: 1280, h: 720 };
  if (ar === "1:1") return { w: 960, h: 960 };
  return { w: 720, h: 1280 };
}

/**
 * Ken Burns move over a single still image. Feed it exactly one input frame;
 * zoompan then emits `seconds * fps` frames. The camera text picks the move.
 */
export function kenBurnsFilter(w: number, h: number, seconds: number, camera: string, fps = 24) {
  const n = Math.max(1, Math.round(seconds * fps));
  const cam = camera.toLowerCase();
  // Work at 2x so the sub-pixel motion of zoompan doesn't jitter.
  const W = w * 2;
  const H = h * 2;
  let z = `min(1+0.10*on/${n},1.10)`;
  let x = "iw/2-(iw/zoom/2)";
  let y = "ih/2-(ih/zoom/2)";
  if (/pull|zoom out|dolly out|reveal|widen/.test(cam)) z = `max(1.10-0.10*on/${n},1.0)`;
  if (/pan left|left/.test(cam)) {
    z = "1.08";
    x = `(iw-iw/zoom)*(1-on/${n})`;
  } else if (/pan right|right|track/.test(cam)) {
    z = "1.08";
    x = `(iw-iw/zoom)*on/${n}`;
  } else if (/tilt up|crane up|rise/.test(cam)) {
    z = "1.08";
    y = `(ih-ih/zoom)*(1-on/${n})`;
  } else if (/tilt down|crane down/.test(cam)) {
    z = "1.08";
    y = `(ih-ih/zoom)*on/${n}`;
  } else if (/static|locked|still|fixed/.test(cam)) {
    z = `min(1+0.03*on/${n},1.03)`;
  }
  return (
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,` +
    `zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=${w}x${h}:fps=${fps},format=yuv420p`
  );
}

/** Still image -> silent mp4 with a camera move. */
export async function animateStill(image: string, out: string, seconds: number, camera: string, ar: AspectRatio) {
  const { w, h } = frameSize(ar);
  const fps = 24;
  await ffmpeg([
    "-i",
    image,
    "-vf",
    kenBurnsFilter(w, h, seconds, camera, fps),
    "-frames:v",
    String(Math.round(seconds * fps)),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ]);
}

/** Join audio files with a gap between them into one AAC file. */
export async function concatAudio(files: string[], out: string, gapSeconds: number) {
  const args: string[] = [];
  const parts: string[] = [];
  files.forEach((f, i) => {
    args.push("-i", f);
    const pad = i < files.length - 1 ? `,apad=pad_dur=${gapSeconds}` : "";
    parts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo${pad}[a${i}]`);
  });
  const joined = files.map((_, i) => `[a${i}]`).join("");
  const filter = `${parts.join(";")};${joined}concat=n=${files.length}:v=0:a=1[out]`;
  await ffmpeg([...args, "-filter_complex", filter, "-map", "[out]", "-c:a", "aac", "-b:a", "160k", out]);
}

export async function silence(out: string, seconds: number) {
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t",
    seconds.toFixed(2),
    "-c:a",
    "pcm_s16le",
    out,
  ]);
}
