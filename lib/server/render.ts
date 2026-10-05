// Final edit: one normalized segment per shot, concatenated, with burned-in subtitles.
//   - shots with a clip use it (frozen on the last frame if the dub runs longer)
//   - shots with only a keyframe get a Ken Burns move
//   - dub mode uses the TTS track, native mode keeps the clip's own audio
import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "../types";
import { getProject, mutateProject } from "./db";
import { ffmpeg, frameSize, kenBurnsFilter, probe } from "./ffmpeg";
import { mediaAbs, mediaRel, nowIso, projectMediaDir } from "./paths";
import { registry, runTask } from "./registry";

const FPS = 24;
const DUB_DELAY = 0.2;

interface Cue {
  start: number;
  end: number;
  text: string;
}

async function renderSegment(p: Project, index: number, out: string, cues: Cue[], offset: number) {
  const shot = p.shots[index];
  const { w, h } = frameSize(p.aspectRatio);
  const inputs: string[] = [];
  const filters: string[] = [];

  const videoAbs = shot.video ? mediaAbs(shot.video.file) : null;
  const imageAbs = shot.keyframe ? mediaAbs(shot.keyframe.file) : null;
  const dubAbs = p.audioMode === "dub" && shot.audio ? mediaAbs(shot.audio.file) : null;

  let clipLen = shot.duration;
  let clipHasAudio = false;
  if (videoAbs) {
    const info = await probe(videoAbs);
    clipLen = info.duration || shot.duration;
    clipHasAudio = info.hasAudio;
  }
  const dubLen = dubAbs ? (shot.audio?.duration ?? (await probe(dubAbs)).duration) : 0;
  const seconds = Math.max(videoAbs ? clipLen : shot.duration, dubAbs ? dubLen + DUB_DELAY + 0.3 : 0, 1);

  // --- picture
  if (videoAbs) {
    inputs.push("-i", videoAbs);
    filters.push(
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,` +
        `fps=${FPS},tpad=stop_mode=clone:stop_duration=${seconds.toFixed(2)},trim=duration=${seconds.toFixed(3)},format=yuv420p[v]`,
    );
  } else if (imageAbs) {
    inputs.push("-i", imageAbs);
    filters.push(`[0:v]${kenBurnsFilter(w, h, seconds, shot.camera, FPS)}[v]`);
  } else {
    inputs.push("-f", "lavfi", "-i", `color=c=0x0d1117:s=${w}x${h}:r=${FPS}:d=${seconds.toFixed(3)}`);
    filters.push("[0:v]format=yuv420p[v]");
  }

  // --- sound
  const norm = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  if (dubAbs) {
    inputs.push("-i", dubAbs);
    const ms = Math.round(DUB_DELAY * 1000);
    filters.push(`[1:a]${norm},adelay=${ms}:all=1,apad,atrim=duration=${seconds.toFixed(3)}[a]`);
  } else if (videoAbs && clipHasAudio && p.audioMode === "native") {
    filters.push(`[0:a]${norm},apad,atrim=duration=${seconds.toFixed(3)}[a]`);
  } else {
    inputs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
    filters.push(`[1:a]${norm},atrim=duration=${seconds.toFixed(3)}[a]`);
  }

  await ffmpeg([
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    seconds.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-r",
    String(FPS),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-ac",
    "2",
    out,
  ]);

  // --- subtitles for this segment
  const lines = shot.dialogue.filter((d) => d.line.trim());
  if (dubAbs && shot.audio?.cues?.length) {
    for (const c of shot.audio.cues) {
      cues.push({ start: offset + DUB_DELAY + c.start, end: offset + DUB_DELAY + c.end + 0.15, text: c.text });
    }
  } else if (lines.length) {
    const slice = seconds / lines.length;
    lines.forEach((d, i) => cues.push({ start: offset + i * slice + 0.1, end: offset + (i + 1) * slice - 0.1, text: d.line }));
  }
  return seconds;
}

function srtTime(t: number) {
  const ms = Math.max(0, Math.round(t * 1000));
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function subtitleStyle(p: Project, cjk: boolean) {
  // libass sizes are relative to a 288px-high canvas, scaled to the video height.
  const size = p.aspectRatio === "9:16" ? 11 : p.aspectRatio === "1:1" ? 13 : 16;
  const margin = p.aspectRatio === "9:16" ? 34 : 16;
  const font = cjk ? "Microsoft YaHei" : "Arial";
  return `FontName=${font},FontSize=${size},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.4,Shadow=0,Bold=1,Alignment=2,MarginV=${margin}`;
}

async function render(projectId: string) {
  const p = await getProject(projectId);
  if (!p) throw new Error("Project not found");
  if (!p.shots.length) throw new Error("Nothing to render: the project has no shots");
  const dir = path.join(projectMediaDir(projectId), `export-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });

  const cues: Cue[] = [];
  const list: string[] = [];
  let t = 0;
  for (let i = 0; i < p.shots.length; i++) {
    await mutateProject(projectId, (d) => {
      if (d.export) d.export.detail = `Rendering shot ${i + 1} of ${p.shots.length}`;
    });
    const name = `seg_${String(i).padStart(3, "0")}.mp4`;
    t += await renderSegment(p, i, path.join(dir, name), cues, t);
    list.push(`file '${name}'`);
  }
  await fs.writeFile(path.join(dir, "concat.txt"), list.join("\n"));
  await mutateProject(projectId, (d) => {
    if (d.export) d.export.detail = "Joining shots";
  });
  // Relative paths + cwd avoid Windows drive-letter escaping inside ffmpeg filters.
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", "joined.mp4"], dir);

  const safeTitle = (p.title || "episode").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "episode";
  const finalName = `${safeTitle}.mp4`;
  if (p.subtitles && cues.length) {
    const srt = cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
    await fs.writeFile(path.join(dir, "subs.srt"), srt, "utf8");
    await mutateProject(projectId, (d) => {
      if (d.export) d.export.detail = "Burning subtitles";
    });
    const cjk = cues.some((c) => /[㐀-鿿]/.test(c.text));
    await ffmpeg(
      [
        "-i",
        "joined.mp4",
        "-vf",
        `subtitles=subs.srt:force_style='${subtitleStyle(p, cjk)}'`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        finalName,
      ],
      dir,
    );
    await fs.rm(path.join(dir, "joined.mp4"), { force: true });
  } else {
    await fs.rename(path.join(dir, "joined.mp4"), path.join(dir, finalName));
  }
  await Promise.all(list.map((l) => fs.rm(path.join(dir, l.slice(6, -1)), { force: true })));
  return { file: mediaRel(path.join(dir, finalName)), seconds: t };
}

export async function startExport(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const name = `export:${projectId}`;
  if (registry.tasks.has(name)) return { ok: false, error: "An export is already running" };
  await mutateProject(projectId, (p) => {
    p.export = { status: "running", detail: "Starting", startedAt: nowIso() };
  });
  runTask(name, async () => {
    await exportNow(projectId);
  });
  return { ok: true };
}

/** Render and record the result on the project (also used by the pipeline). */
export async function exportNow(projectId: string) {
  try {
    await mutateProject(projectId, (p) => {
      if (p.export?.status !== "running") p.export = { status: "running", detail: "Starting", startedAt: nowIso() };
    });
    const { file, seconds } = await render(projectId);
    await mutateProject(projectId, (p) => {
      p.export = {
        status: "succeeded",
        file,
        detail: `${Math.round(seconds)}s episode`,
        startedAt: p.export?.startedAt ?? nowIso(),
        finishedAt: nowIso(),
      };
    });
    return true;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[export]", error);
    await mutateProject(projectId, (p) => {
      p.export = { status: "failed", error, startedAt: p.export?.startedAt ?? nowIso(), finishedAt: nowIso() };
    }).catch(() => undefined);
    return false;
  }
}
