// Cost estimates shown before anything is generated (shared by browser and server).
import { dialogueChars, estimateCost, modelByKey, projectModelKey } from "./models";
import { shotRefCharacters } from "./prompts";
import type { GenKind, Project, Shot } from "./types";

export type ItemRef = { type: "character" | "shot"; id: string };

/** The clip was animated from an older keyframe than the current one. */
export const clipOutdated = (s: Shot) => !!(s.video && s.keyframe && s.video.createdAt < s.keyframe.createdAt);

/** The dialogue was edited after the voice track was generated. */
export function voiceOutdated(s: Shot) {
  if (!s.audio?.cues) return false;
  const spoken = s.audio.cues.map((c) => c.text).join("\n");
  const current = s.dialogue.filter((d) => d.line.trim()).map((d) => d.line).join("\n");
  return spoken !== current;
}

export function estimateItem(project: Project, target: ItemRef, kind: GenKind) {
  const model = modelByKey(projectModelKey(project, kind));
  if (!model) return 0;
  if (target.type === "character") return estimateCost(model, { refs: 0 });
  const shot = project.shots.find((s) => s.id === target.id);
  if (!shot) return 0;
  if (kind === "image") return estimateCost(model, { refs: shotRefCharacters(project, shot).length });
  if (kind === "video") {
    return estimateCost(model, { seconds: shot.duration, audio: project.audioMode === "native" && !!model.nativeAudio });
  }
  return estimateCost(model, { chars: dialogueChars(shot) });
}

export type Stage = "characters" | "keyframes" | "videos" | "voices";

/** What a pipeline run would generate: items with no media yet, or with outdated media. */
export function plannedWork(project: Project) {
  const needsVoice = project.audioMode === "dub";
  const plan: Record<Stage, ItemRef[]> = {
    characters: project.characters.filter((c) => !c.image).map((c) => ({ type: "character", id: c.id })),
    keyframes: project.shots.filter((s) => !s.keyframe).map((s) => ({ type: "shot", id: s.id })),
    videos: project.shots.filter((s) => !s.video || clipOutdated(s)).map((s) => ({ type: "shot", id: s.id })),
    voices: needsVoice
      ? project.shots
          .filter((s) => s.dialogue.some((d) => d.line.trim()) && (!s.audio || voiceOutdated(s)))
          .map((s) => ({ type: "shot", id: s.id }))
      : [],
  };
  const kindOf: Record<Stage, GenKind> = { characters: "image", keyframes: "image", videos: "video", voices: "audio" };
  const cost = (stage: Stage) => plan[stage].reduce((sum, t) => sum + estimateItem(project, t, kindOf[stage]), 0);
  return { plan, kindOf, cost, total: (Object.keys(plan) as Stage[]).reduce((s, k) => s + cost(k), 0) };
}
