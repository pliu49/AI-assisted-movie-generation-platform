"use client";

import { useState } from "react";
import { mediaUrl } from "@/lib/client/api";
import { clipOutdated, estimateItem, voiceOutdated, type ItemRef } from "@/lib/cost";
import { formatUsd, modelByKey, projectModelKey, providerReady } from "@/lib/models";
import { keyframePrompt, videoPrompt, characterPrompt } from "@/lib/prompts";
import type { Character, GenKind, JobState, Shot } from "@/lib/types";
import { Button, isActive, JobChip, Label, Spinner, TextField } from "../ui";
import { useStudio } from "./context";

export function GenButton({
  kind,
  target,
  job,
  has,
  label,
  blocked,
  className = "",
}: {
  kind: GenKind;
  target: ItemRef;
  job?: JobState;
  has: boolean;
  label: string;
  blocked?: string;
  className?: string;
}) {
  const { project, status, generate } = useStudio();
  const model = modelByKey(projectModelKey(project, kind));
  const needsKey = model && !providerReady(model.provider, status) ? `${model.label} needs an API key (see Models & keys)` : undefined;
  const reason = blocked ?? needsKey;
  const active = isActive(job);
  const cost = estimateItem(project, target, kind);
  return (
    <Button
      className={className}
      onClick={() => generate(kind, [target])}
      disabled={active || !!reason}
      title={reason ?? `${model?.label ?? ""} · ${cost > 0 ? `≈${formatUsd(cost)}` : "free"}`}
    >
      {active ? <Spinner /> : null}
      {active ? (job?.status === "queued" ? "Queued" : "Working") : has ? `↻ ${label}` : label}
    </Button>
  );
}

function ErrorLine({ job }: { job?: JobState }) {
  if (job?.status !== "failed" || !job.error) return null;
  return <p className="mt-1 text-[11px] leading-snug break-words text-red-300">{job.error}</p>;
}

function PromptPreview({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/60">
      <button className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] text-ink-300" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && <p className="border-t border-ink-700 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-200">{text}</p>}
    </div>
  );
}

export function MediaBox({ shot, aspect, compact }: { shot: Shot; aspect: string; compact?: boolean }) {
  const ratio = aspect === "9:16" ? "aspect-[9/16]" : aspect === "16:9" ? "aspect-video" : "aspect-square";
  const src = mediaUrl(shot.video);
  const poster = mediaUrl(shot.keyframe);
  return (
    <div className={`relative overflow-hidden rounded-lg border border-ink-700 bg-ink-950 ${ratio} ${compact ? "" : "w-full"}`}>
      {src ? (
        <video key={src} src={src} poster={poster} controls playsInline className="h-full w-full object-cover" preload="metadata" />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="Keyframe" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center p-3 text-center text-[11px] text-ink-500">No keyframe yet</div>
      )}
      {(isActive(shot.jobs.image) || isActive(shot.jobs.video)) && (
        <div className="absolute inset-0 grid place-items-center bg-black/50 text-xs text-cyan-200">
          <span className="flex items-center gap-1.5">
            <Spinner /> {isActive(shot.jobs.video) ? "Animating" : "Drawing"}
          </span>
        </div>
      )}
    </div>
  );
}

export function ShotEditor({ shot, index, layout }: { shot: Shot; index: number; layout: "row" | "panel" }) {
  const { project, op } = useStudio();
  const target: ItemRef = { type: "shot", id: shot.id };
  const set = (patch: Record<string, unknown>) => op({ op: "updateShot", id: shot.id, patch });
  const nativeAudio = project.audioMode === "native" && !!modelByKey(project.models.video)?.nativeAudio;
  const hasDialogue = shot.dialogue.some((d) => d.line.trim());

  const header = (
    <div className="flex items-center gap-2">
      <span className="rounded-md bg-ink-700 px-1.5 py-0.5 text-[11px] font-semibold text-ink-100">#{index + 1}</span>
      <input
        type="number"
        min={1}
        max={30}
        className="field !w-16 !py-0.5 !text-xs"
        defaultValue={shot.duration}
        key={`${shot.id}-${shot.duration}`}
        onBlur={(e) => {
          const v = Math.min(30, Math.max(1, Math.round(Number(e.target.value) || shot.duration)));
          if (v !== shot.duration) set({ duration: v });
        }}
        title="Duration in seconds"
      />
      <span className="text-[11px] text-ink-400">sec</span>
      <div className="ml-auto flex items-center gap-1">
        <JobChip label="frame" job={shot.jobs.image} done={!!shot.keyframe} />
        <JobChip label="clip" job={shot.jobs.video} done={!!shot.video} stale={clipOutdated(shot)} />
        {project.audioMode === "dub" && hasDialogue && (
          <JobChip label="voice" job={shot.jobs.audio} done={!!shot.audio} stale={voiceOutdated(shot)} />
        )}
        <Button variant="ghost" className="!px-1.5 !py-0.5" title="Move up" onClick={() => op({ op: "moveShot", id: shot.id, dir: -1 })}>
          ↑
        </Button>
        <Button variant="ghost" className="!px-1.5 !py-0.5" title="Move down" onClick={() => op({ op: "moveShot", id: shot.id, dir: 1 })}>
          ↓
        </Button>
        <Button
          variant="ghost"
          className="!px-1.5 !py-0.5 hover:!text-red-300"
          title="Delete shot"
          onClick={() => confirm(`Delete shot ${index + 1}?`) && op({ op: "deleteShot", id: shot.id })}
        >
          ✕
        </Button>
      </div>
    </div>
  );

  const actions = (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <GenButton kind="image" target={target} job={shot.jobs.image} has={!!shot.keyframe} label="Keyframe" />
        <GenButton
          kind="video"
          target={target}
          job={shot.jobs.video}
          has={!!shot.video}
          label="Video"
          blocked={shot.keyframe ? undefined : "Generate the keyframe first"}
        />
        {project.audioMode === "dub" && (
          <GenButton
            kind="audio"
            target={target}
            job={shot.jobs.audio}
            has={!!shot.audio}
            label="Voice"
            blocked={hasDialogue ? undefined : "No dialogue in this shot"}
          />
        )}
      </div>
      <ErrorLine job={shot.jobs.image} />
      <ErrorLine job={shot.jobs.video} />
      <ErrorLine job={shot.jobs.audio} />
      {shot.audio && project.audioMode === "dub" && <audio key={shot.audio.file} src={mediaUrl(shot.audio)} controls className="mt-1 h-8 w-full" />}
    </div>
  );

  const fields = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Shot type</Label>
          <TextField value={shot.shotType} onCommit={(v) => set({ shotType: v })} placeholder="Close-up" />
        </div>
        <div>
          <Label>Camera</Label>
          <TextField value={shot.camera} onCommit={(v) => set({ camera: v })} placeholder="slow push in" />
        </div>
      </div>
      <div>
        <Label>Location</Label>
        <TextField value={shot.location} onCommit={(v) => set({ location: v })} placeholder="Rooftop bar, night" />
      </div>
      <div>
        <Label hint="who is in frame">Cast</Label>
        <div className="flex flex-wrap gap-1">
          {project.characters.map((c) => {
            const on = shot.characters.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => set({ characters: on ? shot.characters.filter((x) => x !== c.id) : [...shot.characters, c.id] })}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-cyan-600 bg-cyan-950/40 text-cyan-200" : "border-ink-600 text-ink-400 hover:text-ink-200"}`}
              >
                {c.name}
              </button>
            );
          })}
          {!project.characters.length && <span className="text-[11px] text-ink-500">No characters yet</span>}
        </div>
      </div>
      <div>
        <Label>Action</Label>
        <TextField multiline rows={2} value={shot.action} onCommit={(v) => set({ action: v })} placeholder="What happens in this shot" />
      </div>
      <div>
        <Label hint={nativeAudio ? "spoken by the video model" : "voiced by TTS"}>Dialogue</Label>
        <div className="space-y-1.5">
          {shot.dialogue.map((d, i) => (
            <div key={i} className="flex gap-1.5">
              <select
                className="field !w-28 !text-xs"
                value={d.speaker}
                onChange={(e) => set({ dialogue: shot.dialogue.map((x, j) => (j === i ? { ...x, speaker: e.target.value } : x)) })}
              >
                {[...project.characters.map((c) => c.name), "Narrator"].map((n) => (
                  <option key={n}>{n}</option>
                ))}
                {!project.characters.some((c) => c.name === d.speaker) && d.speaker !== "Narrator" && <option>{d.speaker}</option>}
              </select>
              <TextField
                value={d.line}
                onCommit={(v) => set({ dialogue: shot.dialogue.map((x, j) => (j === i ? { ...x, line: v } : x)) })}
                className="!text-xs"
              />
              <Button variant="ghost" className="!px-1.5" onClick={() => set({ dialogue: shot.dialogue.filter((_, j) => j !== i) })}>
                ✕
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            className="!px-1.5 !py-0.5 text-xs"
            onClick={() =>
              set({
                dialogue: [
                  ...shot.dialogue,
                  { speaker: project.characters.find((c) => shot.characters.includes(c.id))?.name ?? "Narrator", line: "" },
                ],
              })
            }
          >
            + line
          </Button>
        </div>
      </div>
      <div>
        <Label hint="first frame, as a still">Image prompt</Label>
        <TextField multiline rows={3} value={shot.imagePrompt} onCommit={(v) => set({ imagePrompt: v })} />
      </div>
      <div>
        <Label hint="what moves">Motion prompt</Label>
        <TextField multiline rows={2} value={shot.motionPrompt} onCommit={(v) => set({ motionPrompt: v })} />
      </div>
      <PromptPreview title="Final keyframe prompt" text={keyframePrompt(project, shot)} />
      <PromptPreview title="Final video prompt" text={videoPrompt(project, shot, nativeAudio)} />
    </div>
  );

  if (layout === "panel") {
    return (
      <div className="space-y-3">
        {header}
        <MediaBox shot={shot} aspect={project.aspectRatio} />
        {actions}
        {fields}
      </div>
    );
  }
  const narrowMedia = project.aspectRatio === "9:16" ? "w-44" : "w-72";
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 p-3">
      {header}
      <div className="mt-3 flex gap-4">
        <div className={`${narrowMedia} shrink-0 space-y-2`}>
          <MediaBox shot={shot} aspect={project.aspectRatio} />
          {actions}
        </div>
        <div className="min-w-0 flex-1">{fields}</div>
      </div>
    </div>
  );
}

export function CharacterEditor({ character, compact }: { character: Character; compact?: boolean }) {
  const { project, op } = useStudio();
  const target: ItemRef = { type: "character", id: character.id };
  const set = (patch: Record<string, string>) => op({ op: "updateCharacter", id: character.id, patch });
  const img = mediaUrl(character.image);
  const appears = project.shots.filter((s) => s.characters.includes(character.id)).length;
  const placeholder = /add age, face, hair/.test(character.description);
  return (
    <div className={`rounded-2xl border border-ink-700 bg-ink-850 p-3 ${compact ? "w-72 shrink-0" : ""}`}>
      <div className="flex gap-3">
        <div className="relative aspect-[9/16] w-24 shrink-0 overflow-hidden rounded-lg border border-ink-700 bg-ink-950">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={character.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-2xl text-ink-600">?</div>
          )}
          {isActive(character.job) && (
            <div className="absolute inset-0 grid place-items-center bg-black/50 text-cyan-200">
              <Spinner />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <TextField value={character.name} onCommit={(v) => v.trim() && set({ name: v.trim() })} className="!font-semibold" />
          <div className="flex gap-1.5">
            <select className="field !w-24 !text-xs" value={character.gender} onChange={(e) => set({ gender: e.target.value })}>
              <option value="female">female</option>
              <option value="male">male</option>
              <option value="other">other</option>
            </select>
            <TextField
              value={character.voice ?? ""}
              onCommit={(v) => set({ voice: v.trim() })}
              placeholder="voice: auto"
              className="!text-xs"
            />
          </div>
          <div className="text-[11px] text-ink-400">In {appears} shot{appears === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div className="mt-2">
        <Label hint={placeholder ? <span className="text-amber-300">fill this in</span> : "reused in every prompt"}>Look</Label>
        <TextField
          multiline
          rows={compact ? 3 : 4}
          value={character.description}
          onCommit={(v) => set({ description: v })}
          placeholder="Age, face, hair, build, signature outfit and colors"
        />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <GenButton kind="image" target={target} job={character.job} has={!!character.image} label="Reference" />
        <Button
          variant="ghost"
          className="ml-auto !px-2 hover:!text-red-300"
          onClick={() => confirm(`Delete ${character.name}?`) && op({ op: "deleteCharacter", id: character.id })}
        >
          Delete
        </Button>
      </div>
      <ErrorLine job={character.job} />
      {!compact && <div className="mt-2"><PromptPreview title="Final reference prompt" text={characterPrompt(project, character)} /></div>}
    </div>
  );
}
