import fs from "node:fs/promises";
import { z } from "zod";
import { DEFAULT_MODELS, modelByKey } from "../models";
import type { AspectRatio, Project, Shot } from "../types";
import { applyBreakdown } from "./breakdown";
import { BreakdownSchema } from "./breakdown/schema";
import { insertProject, mutateProject, removeProject } from "./db";
import { newId, nowIso, projectMediaDir } from "./paths";
import { SAMPLE, SAMPLE_SCRIPT } from "./sample";

export async function createProject(opts: { title?: string; script?: string; aspectRatio?: AspectRatio; sample?: boolean }) {
  const now = nowIso();
  const project: Project = {
    id: newId("prj"),
    title: opts.title?.trim() || (opts.sample ? SAMPLE.title : "Untitled drama"),
    logline: "",
    style: "",
    aspectRatio: opts.aspectRatio ?? "9:16",
    audioMode: "dub",
    subtitles: true,
    script: opts.sample ? SAMPLE_SCRIPT : (opts.script ?? ""),
    characters: [],
    shots: [],
    models: { ...DEFAULT_MODELS },
    spendUsd: 0,
    createdAt: now,
    updatedAt: now,
  };
  if (opts.sample) {
    applyBreakdown(project, BreakdownSchema.parse(SAMPLE));
    project.style = SAMPLE.style;
  }
  return insertProject(project);
}

export async function deleteProject(id: string) {
  const removed = await removeProject(id);
  if (removed) await fs.rm(projectMediaDir(id), { recursive: true, force: true });
  return removed;
}

const aspect = z.enum(["9:16", "16:9", "1:1"]);
const dialogue = z.array(z.object({ speaker: z.string().max(60), line: z.string().max(2000) })).max(20);

export const OpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("update"),
    patch: z
      .object({
        title: z.string().max(200),
        logline: z.string().max(2000),
        style: z.string().max(2000),
        aspectRatio: aspect,
        audioMode: z.enum(["native", "dub"]),
        subtitles: z.boolean(),
        script: z.string().max(100_000),
        models: z.object({ image: z.string(), video: z.string(), tts: z.string() }).partial(),
      })
      .partial(),
  }),
  z.object({
    op: z.literal("updateCharacter"),
    id: z.string(),
    patch: z
      .object({
        name: z.string().min(1).max(60),
        gender: z.enum(["male", "female", "other"]),
        description: z.string().max(2000),
        voice: z.string().max(60),
      })
      .partial(),
  }),
  z.object({ op: z.literal("addCharacter") }),
  z.object({ op: z.literal("deleteCharacter"), id: z.string() }),
  z.object({
    op: z.literal("updateShot"),
    id: z.string(),
    patch: z
      .object({
        duration: z.number().min(1).max(30),
        shotType: z.string().max(100),
        camera: z.string().max(200),
        location: z.string().max(300),
        characters: z.array(z.string()).max(12),
        action: z.string().max(2000),
        dialogue,
        imagePrompt: z.string().max(4000),
        motionPrompt: z.string().max(4000),
      })
      .partial(),
  }),
  z.object({ op: z.literal("addShot"), afterId: z.string().optional() }),
  z.object({ op: z.literal("deleteShot"), id: z.string() }),
  z.object({ op: z.literal("moveShot"), id: z.string(), dir: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ op: z.literal("setCanvas"), positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })) }),
]);

export type Op = z.infer<typeof OpSchema>;

const blankShot = (): Shot => ({
  id: newId("shot"),
  duration: 5,
  shotType: "Medium shot",
  camera: "static",
  location: "",
  characters: [],
  action: "",
  dialogue: [],
  imagePrompt: "",
  motionPrompt: "",
  jobs: {},
});

/** Apply an edit. Only user-editable fields can change; media and job state stay server-owned. */
export async function applyOp(projectId: string, op: Op) {
  if (op.op === "update" && op.patch.models) {
    const kinds = { image: "image", video: "video", tts: "audio" } as const;
    for (const [slot, key] of Object.entries(op.patch.models)) {
      if (key && modelByKey(key)?.kind !== kinds[slot as keyof typeof kinds]) throw new Error(`Invalid model ${key}`);
    }
  }
  return mutateProject(projectId, (p) => {
    switch (op.op) {
      case "update": {
        const { models, ...rest } = op.patch;
        Object.assign(p, rest);
        if (models) p.models = { ...p.models, ...models };
        break;
      }
      case "updateCharacter": {
        const c = p.characters.find((x) => x.id === op.id);
        if (!c) throw new Error("Character not found");
        if (op.patch.name && op.patch.name !== c.name) {
          // Keep dialogue attribution in sync with a rename.
          for (const s of p.shots) for (const d of s.dialogue) if (d.speaker === c.name) d.speaker = op.patch.name;
        }
        Object.assign(c, op.patch);
        break;
      }
      case "addCharacter":
        p.characters.push({ id: newId("chr"), name: `Character ${p.characters.length + 1}`, gender: "other", description: "" });
        break;
      case "deleteCharacter":
        p.characters = p.characters.filter((c) => c.id !== op.id);
        for (const s of p.shots) s.characters = s.characters.filter((id) => id !== op.id);
        break;
      case "updateShot": {
        const s = p.shots.find((x) => x.id === op.id);
        if (!s) throw new Error("Shot not found");
        Object.assign(s, op.patch);
        break;
      }
      case "addShot": {
        const i = op.afterId ? p.shots.findIndex((s) => s.id === op.afterId) : p.shots.length - 1;
        p.shots.splice(i + 1, 0, blankShot());
        break;
      }
      case "deleteShot":
        p.shots = p.shots.filter((s) => s.id !== op.id);
        break;
      case "moveShot": {
        const i = p.shots.findIndex((s) => s.id === op.id);
        const j = i + op.dir;
        if (i >= 0 && j >= 0 && j < p.shots.length) [p.shots[i], p.shots[j]] = [p.shots[j], p.shots[i]];
        break;
      }
      case "setCanvas":
        p.canvas = { ...p.canvas, ...op.positions };
        break;
    }
    return p;
  });
}
