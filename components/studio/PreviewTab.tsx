"use client";

import { useEffect, useRef, useState } from "react";
import { api, mediaUrl } from "@/lib/client/api";
import type { Shot } from "@/lib/types";
import { Button, isActive, Spinner } from "../ui";
import { useStudio } from "./context";

const DUB_DELAY = 0.2; // must match lib/server/render.ts

function segmentSeconds(shot: Shot, dub: boolean) {
  const base = shot.video?.duration ?? shot.duration;
  const voice = dub && shot.audio?.duration ? shot.audio.duration + DUB_DELAY + 0.3 : 0;
  return Math.max(base, voice, 1);
}

function subtitleAt(shot: Shot, t: number, dub: boolean, seg: number) {
  if (dub && shot.audio?.cues?.length) {
    return shot.audio.cues.find((c) => t >= c.start + DUB_DELAY && t <= c.end + DUB_DELAY + 0.15)?.text ?? null;
  }
  const lines = shot.dialogue.filter((d) => d.line.trim());
  if (!lines.length) return null;
  return lines[Math.min(lines.length - 1, Math.floor(t / (seg / lines.length)))].line;
}

/** Plays the shots back to back in the browser, so you can check timing before rendering. */
function Player() {
  const { project } = useStudio();
  const shots = project.shots;
  const dub = project.audioMode === "dub";
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clock = useRef({ start: 0, elapsed: 0 });
  const safeIndex = Math.min(index, Math.max(0, shots.length - 1));
  const shot = shots[safeIndex];
  const seg = shot ? segmentSeconds(shot, dub) : 0;
  const total = shots.reduce((s, x) => s + segmentSeconds(x, dub), 0);
  const before = shots.slice(0, safeIndex).reduce((s, x) => s + segmentSeconds(x, dub), 0);

  // New shot: rewind the clock and media.
  useEffect(() => {
    clock.current = { start: performance.now(), elapsed: 0 };
    setT(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [safeIndex]);

  useEffect(() => {
    if (!playing || !shot) return;
    clock.current.start = performance.now() - clock.current.elapsed * 1000;
    void videoRef.current?.play().catch(() => undefined);
    // A plain interval (not requestAnimationFrame) keeps time even in a background tab.
    const timer = setInterval(() => {
      const now = (performance.now() - clock.current.start) / 1000;
      clock.current.elapsed = now;
      setT(now);
      const a = audioRef.current;
      if (a && a.paused && !a.ended && now >= DUB_DELAY && now - DUB_DELAY < (a.duration || Infinity)) {
        a.currentTime = now - DUB_DELAY;
        void a.play().catch(() => undefined);
      }
      if (now >= seg) {
        clearInterval(timer);
        clock.current.elapsed = 0;
        if (safeIndex < shots.length - 1) setIndex(safeIndex + 1);
        else {
          setPlaying(false);
          setIndex(0);
        }
      }
    }, 100);
    const video = videoRef.current;
    const audio = audioRef.current;
    return () => {
      clearInterval(timer);
      video?.pause();
      audio?.pause();
    };
  }, [playing, safeIndex, seg, shot, shots.length]);

  if (!shot) return <p className="text-sm text-ink-400">No shots yet.</p>;

  const ratio = project.aspectRatio === "9:16" ? "aspect-[9/16] h-[62vh]" : project.aspectRatio === "16:9" ? "aspect-video w-full max-w-3xl" : "aspect-square h-[62vh]";
  const video = mediaUrl(shot.video);
  const still = mediaUrl(shot.keyframe);
  const sub = project.subtitles ? subtitleAt(shot, t, dub, seg) : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative overflow-hidden rounded-xl border border-ink-700 bg-black ${ratio}`}>
        {video ? (
          <video key={video} ref={videoRef} src={video} muted={dub} playsInline preload="auto" className="h-full w-full object-cover" />
        ) : still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${still}-${safeIndex}`}
            src={still}
            alt=""
            className="h-full w-full object-cover"
            style={{ animation: `kenburns ${seg}s linear forwards`, animationPlayState: playing ? "running" : "paused" }}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-500">Shot {safeIndex + 1} has no frame yet</div>
        )}
        {dub && shot.audio && <audio key={shot.audio.file} ref={audioRef} src={mediaUrl(shot.audio)} preload="auto" />}
        {sub && (
          <div className="absolute inset-x-4 bottom-[9%] text-center text-[17px] leading-snug font-bold text-white [text-shadow:0_0_3px_#000,0_2px_4px_#000]">
            {sub}
          </div>
        )}
        <div className="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
          {safeIndex + 1}/{shots.length}
        </div>
      </div>
      <div className="flex w-full max-w-xl items-center gap-2">
        <Button variant="ghost" onClick={() => setIndex(Math.max(0, safeIndex - 1))} aria-label="Previous shot">
          ⏮
        </Button>
        <Button variant="primary" className="w-24" onClick={() => setPlaying(!playing)}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </Button>
        <Button variant="ghost" onClick={() => setIndex(Math.min(shots.length - 1, safeIndex + 1))} aria-label="Next shot">
          ⏭
        </Button>
        <div className="relative mx-2 h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
          <div className="absolute inset-y-0 left-0 bg-cyan-400" style={{ width: `${Math.min(100, ((before + Math.min(t, seg)) / total) * 100)}%` }} />
        </div>
        <span className="w-24 text-right text-xs text-ink-400 tabular-nums">
          {Math.floor(before + Math.min(t, seg))}s / {Math.round(total)}s
        </span>
      </div>
      <div className="flex w-full gap-1.5 overflow-x-auto pb-1">
        {shots.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIndex(i)}
            className={`relative shrink-0 overflow-hidden rounded-md border ${i === safeIndex ? "border-cyan-400" : "border-ink-700 opacity-70 hover:opacity-100"} ${
              project.aspectRatio === "9:16" ? "h-24 w-[54px]" : "h-16 w-28"
            } bg-ink-950`}
            title={`Shot ${i + 1}`}
          >
            {s.keyframe && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(s.keyframe)} alt="" className="h-full w-full object-cover" />
            )}
            <span className="absolute bottom-0 left-0 bg-black/70 px-1 text-[9px] text-white">{i + 1}</span>
            {s.video && <span className="absolute top-0 right-0 bg-cyan-600/80 px-1 text-[8px] text-white">clip</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExportPanel() {
  const { project, apply, notify } = useStudio();
  const [starting, setStarting] = useState(false);
  const ex = project.export;
  const running = isActive(ex);
  const url = ex?.status === "succeeded" && ex.file ? mediaUrl({ file: ex.file }) : undefined;
  const dub = project.audioMode === "dub";
  const noFrame = project.shots.filter((s) => !s.keyframe).length;
  const noClip = project.shots.filter((s) => !s.video).length;
  const noVoice = dub ? project.shots.filter((s) => !s.audio && s.dialogue.some((d) => d.line.trim())).length : 0;
  const srt = ex?.file && project.subtitles ? { file: `${ex.file.slice(0, ex.file.lastIndexOf("/"))}/subs.srt` } : null;

  async function render() {
    setStarting(true);
    try {
      apply(await api.exportVideo(project.id));
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-300">
        Joins all shots in order: video clips where they exist, slow camera moves over keyframes otherwise,{" "}
        {dub ? "TTS voices" : "each clip's own audio"}
        {project.subtitles ? ", plus burned-in subtitles" : ""}.
      </p>
      {(noFrame > 0 || noClip > 0 || noVoice > 0) && (
        <ul className="space-y-0.5 rounded-lg border border-amber-900/50 bg-amber-950/20 p-2.5 text-xs text-amber-200">
          {noFrame > 0 && <li>{noFrame} shot(s) have no keyframe (rendered as a blank card)</li>}
          {noClip > 0 && <li>{noClip} shot(s) have no video clip (keyframe with a camera move)</li>}
          {noVoice > 0 && <li>{noVoice} shot(s) have dialogue but no voice (subtitles only)</li>}
        </ul>
      )}
      <Button variant="primary" onClick={render} disabled={running || starting || !project.shots.length}>
        {(running || starting) && <Spinner />} {url ? "Re-render MP4" : "Render MP4"}
      </Button>
      {running && <p className="text-xs text-cyan-300">{ex?.detail ?? "Rendering…"}</p>}
      {ex?.status === "failed" && <p className="text-xs break-words text-red-300">Export failed: {ex.error}</p>}
      {url && (
        <div className="space-y-2">
          <video key={url} src={url} controls playsInline className={`rounded-lg border border-ink-700 bg-black ${project.aspectRatio === "9:16" ? "max-h-[60vh]" : "w-full"}`} />
          <div className="flex gap-3 text-xs">
            <a className="text-cyan-300 hover:underline" href={mediaUrl({ file: ex!.file! }, true)}>
              Download MP4
            </a>
            {srt && (
              <a className="text-cyan-300 hover:underline" href={mediaUrl(srt, true)}>
                Download subtitles (.srt)
              </a>
            )}
            <span className="text-ink-400">{ex?.detail}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function PreviewTab() {
  return (
    <div className="grid h-full grid-cols-[1fr_380px] overflow-hidden">
      <div className="overflow-y-auto p-6">
        <Player />
      </div>
      <aside className="overflow-y-auto border-l border-ink-700 bg-ink-850/40 p-5">
        <h2 className="mb-3 text-sm font-semibold">Export</h2>
        <ExportPanel />
      </aside>
    </div>
  );
}
