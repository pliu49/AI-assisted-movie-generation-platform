// Generation jobs: one per (character | shot) x (image | video | audio).
//
// Lifecycle: startJob() records a "queued" JobState on the item and returns at once.
// runJob() waits for a provider slot, submits the request, stores the provider's
// request id (so polling can resume after a restart), polls until the file is ready,
// downloads it into data/media and attaches it to the item.
import fs from "node:fs/promises";
import path from "node:path";
import { estimateItem, type ItemRef } from "../cost";
import { dialogueChars, estimateCost, modelByKey, pickDuration, projectModelKey, type ModelDef } from "../models";
import { characterPrompt, keyframePrompt, shotRefCharacters, videoPrompt } from "../prompts";
import type { AspectRatio, Character, GenKind, JobState, MediaRef, Project, Shot } from "../types";
import { getProject, mutateProject } from "./db";
import { animateStill, concatAudio, probe } from "./ffmpeg";
import { mediaAbs, mediaRel, newId, nowIso, projectMediaDir } from "./paths";
import * as ark from "./providers/ark";
import { downloadTo, jpegDataUri, pollUntilDone } from "./providers/common";
import * as fal from "./providers/fal";
import * as mock from "./providers/mock";
import { limiter, registry } from "./registry";
import { providerStatus } from "./status";

export type { ItemRef };

export const isActive = (j?: { status: string }) => !!j && (j.status === "queued" || j.status === "running");

export function jobOf(p: Project, t: ItemRef, kind: GenKind): JobState | undefined {
  return t.type === "character" ? p.characters.find((c) => c.id === t.id)?.job : p.shots.find((s) => s.id === t.id)?.jobs[kind];
}

function setJob(p: Project, t: ItemRef, kind: GenKind, job: JobState) {
  if (t.type === "character") {
    const c = p.characters.find((x) => x.id === t.id);
    if (!c) throw new Error("Character not found");
    c.job = job;
  } else {
    const s = p.shots.find((x) => x.id === t.id);
    if (!s) throw new Error("Shot not found");
    s.jobs[kind] = job;
  }
}

function attach(p: Project, t: ItemRef, kind: GenKind, media: MediaRef) {
  if (t.type === "character") {
    const c = p.characters.find((x) => x.id === t.id);
    if (c) c.image = media;
    return;
  }
  const s = p.shots.find((x) => x.id === t.id);
  if (!s) return;
  if (kind === "image") s.keyframe = media;
  else if (kind === "video") s.video = media;
  else s.audio = media;
}

async function updateJob(projectId: string, t: ItemRef, kind: GenKind, jobId: string, patch: Partial<JobState>) {
  await mutateProject(projectId, (p) => {
    const j = jobOf(p, t, kind);
    if (j && j.id === jobId) Object.assign(j, patch);
  });
}

function prerequisite(p: Project, t: ItemRef, kind: GenKind): string | null {
  if (t.type === "character") {
    if (kind !== "image") return "Characters only have reference images";
    return p.characters.some((c) => c.id === t.id) ? null : "Character not found";
  }
  const s = p.shots.find((x) => x.id === t.id);
  if (!s) return "Shot not found";
  if (kind === "video" && !s.keyframe) return "Generate the keyframe first";
  if (kind === "audio" && !s.dialogue.some((d) => d.line.trim())) return "This shot has no dialogue";
  return null;
}

export interface StartResult {
  ok: boolean;
  error?: string;
  jobId?: string;
  /** Settles when the job finishes (never rejects). */
  done: Promise<void>;
}

const refuse = (error: string): StartResult => ({ ok: false, error, done: Promise.resolve() });

export async function startJob(projectId: string, target: ItemRef, kind: GenKind): Promise<StartResult> {
  const project = await getProject(projectId);
  if (!project) return refuse("Project not found");
  const model = modelByKey(projectModelKey(project, kind));
  if (!model) return refuse("Unknown model selected");
  const status = await providerStatus();
  if (model.provider === "fal" && !status.fal) return refuse(`${model.label} needs FAL_KEY in .env.local`);
  if (model.provider === "ark" && !status.ark) return refuse(`${model.label} needs ARK_API_KEY in .env.local`);
  if (kind !== "image" && !status.ffmpeg) return refuse("ffmpeg was not found. Install it or set FFMPEG_PATH.");
  const missing = prerequisite(project, target, kind);
  if (missing) return refuse(missing);

  const job: JobState = {
    id: newId("job"),
    kind,
    model: model.key,
    status: "queued",
    estCostUsd: estimateItem(project, target, kind),
    startedAt: nowIso(),
  };
  const existing = await mutateProject(projectId, (p) => {
    const cur = jobOf(p, target, kind);
    if (cur && isActive(cur)) return cur.id;
    setJob(p, target, kind, job);
    return null;
  });
  if (existing) return { ok: true, jobId: existing, done: registry.jobs.get(existing) ?? Promise.resolve() };
  return { ok: true, jobId: job.id, done: runJob(projectId, target, job, false) };
}

interface Ctx {
  projectId: string;
  target: ItemRef;
  job: JobState;
  model: ModelDef;
  resume: boolean;
  /** Output path without extension. */
  base: string;
}

function runJob(projectId: string, target: ItemRef, job: JobState, resume: boolean): Promise<void> {
  const task = (async () => {
    const model = modelByKey(job.model);
    const slot = limiter(model?.provider ?? "mock");
    await slot.acquire();
    try {
      if (!model) throw new Error(`Unknown model ${job.model}`);
      if (!resume) await updateJob(projectId, target, job.kind, job.id, { status: "running" });
      const dir = projectMediaDir(projectId);
      await fs.mkdir(dir, { recursive: true });
      const suffix = target.type === "character" ? "ref" : job.kind === "image" ? "keyframe" : job.kind === "video" ? "video" : "voice";
      const base = path.join(dir, `${target.id}-${suffix}-${Date.now()}`);
      const media = await execute({ projectId, target, job, model, resume, base });
      await mutateProject(projectId, (p) => {
        const cur = jobOf(p, target, job.kind);
        if (!cur || cur.id !== job.id) return; // item deleted or regenerated meanwhile
        attach(p, target, job.kind, media);
        Object.assign(cur, { status: "succeeded", finishedAt: nowIso(), error: undefined });
        p.spendUsd = Math.round((p.spendUsd + (media.costUsd ?? 0)) * 10_000) / 10_000;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[job ${job.id}] ${job.kind} failed:`, error);
      await updateJob(projectId, target, job.kind, job.id, { status: "failed", error, finishedAt: nowIso() }).catch(
        () => undefined,
      );
    } finally {
      slot.release();
      registry.jobs.delete(job.id);
    }
  })();
  registry.jobs.set(job.id, task);
  return task;
}

function mediaRef(abs: string, mime: string, model: ModelDef, costUsd: number, extra: Partial<MediaRef> = {}): MediaRef {
  return { file: mediaRel(abs), mime, model: model.key, costUsd, createdAt: nowIso(), ...extra };
}

async function execute(ctx: Ctx): Promise<MediaRef> {
  const project = await getProject(ctx.projectId);
  if (!project) throw new Error("Project was deleted");
  if (ctx.target.type === "character") {
    const c = project.characters.find((x) => x.id === ctx.target.id);
    if (!c) throw new Error("Character was deleted");
    return makeImage(ctx, characterPrompt(project, c), [], "9:16", {
      kicker: "Character reference",
      title: c.name,
      body: c.description,
      figures: [c.name],
      closeUp: false,
      hueKey: c.name,
    });
  }
  const index = project.shots.findIndex((s) => s.id === ctx.target.id);
  const shot = project.shots[index];
  if (!shot) throw new Error("Shot was deleted");
  if (ctx.job.kind === "image") {
    const names = shot.characters
      .map((id) => project.characters.find((c) => c.id === id)?.name)
      .filter((n): n is string => !!n);
    return makeImage(
      ctx,
      keyframePrompt(project, shot),
      shotRefCharacters(project, shot).map((c) => c.image!),
      project.aspectRatio,
      {
        kicker: `Shot ${index + 1} · ${shot.shotType || "shot"} · ${shot.duration}s`,
        title: shot.location || "Scene",
        body: shot.action || shot.imagePrompt,
        quote: shot.dialogue[0] ? `${shot.dialogue[0].speaker}: ${shot.dialogue[0].line}` : undefined,
        figures: names,
        closeUp: /close/i.test(shot.shotType),
        hueKey: shot.location || String(index),
      },
    );
  }
  if (ctx.job.kind === "video") return makeVideo(ctx, project, shot);
  return makeVoice(ctx, project, shot);
}

/** Submit to fal (unless resuming), remember the request id, then wait for the result URL. */
async function falQueued(ctx: Ctx, build: () => Promise<{ endpoint: string; input: Record<string, unknown> }>) {
  let { endpoint, remoteId } = ctx.job;
  if (!ctx.resume || !endpoint || !remoteId) {
    const req = await build();
    endpoint = req.endpoint;
    remoteId = await fal.submit(req.endpoint, req.input);
    await updateJob(ctx.projectId, ctx.target, ctx.job.kind, ctx.job.id, { endpoint, remoteId });
  }
  const ep = endpoint;
  const rid = remoteId;
  return pollUntilDone(() => fal.check(ep, rid));
}

async function makeImage(ctx: Ctx, prompt: string, refs: MediaRef[], ar: AspectRatio, card: mock.CardSpec) {
  const { model } = ctx;
  if (model.provider === "mock") {
    const out = `${ctx.base}.png`;
    await mock.renderCard(card, ar, out);
    return mediaRef(out, "image/png", model, 0);
  }
  const cost = estimateCost(model, { refs: refs.length });
  let url: string;
  if (model.provider === "fal") {
    url = await falQueued(ctx, async () => {
      const refUrls = await Promise.all(refs.map((r) => fal.uploadImage(mediaAbs(r.file))));
      const useEdit = refUrls.length > 0 && !!model.editEndpoint;
      const input: Record<string, unknown> = {
        prompt,
        image_size: fal.imageSize(ar),
        output_format: "jpeg",
        num_images: 1,
      };
      if (useEdit) input.image_urls = refUrls;
      return { endpoint: useEdit ? model.editEndpoint! : model.endpoint!, input };
    });
  } else {
    const refUris = await Promise.all(refs.map((r) => jpegDataUri(mediaAbs(r.file))));
    url = await ark.generateImage(ark.modelId(model), prompt, refUris, ark.imageSize(ar));
  }
  const saved = await downloadTo(url, ctx.base, "jpg");
  return mediaRef(saved.abs, saved.mime, model, cost);
}

async function makeVideo(ctx: Ctx, project: Project, shot: Shot) {
  const { model } = ctx;
  const keyAbs = mediaAbs(shot.keyframe!.file);
  const seconds = pickDuration(model, shot.duration);
  const withAudio = project.audioMode === "native" && !!model.nativeAudio;
  const prompt = videoPrompt(project, shot, withAudio);
  if (model.provider === "mock") {
    const out = `${ctx.base}.mp4`;
    await animateStill(keyAbs, out, seconds, shot.camera, project.aspectRatio);
    return mediaRef(out, "video/mp4", model, 0, { duration: seconds });
  }
  const cost = estimateCost(model, { seconds, audio: withAudio });
  let url: string;
  if (model.provider === "fal") {
    url = await falQueued(ctx, async () => ({
      endpoint: model.endpoint!,
      input: fal.videoInput(model, {
        prompt,
        imageUrl: await fal.uploadImage(keyAbs),
        seconds,
        ar: project.aspectRatio,
        audio: withAudio,
      }),
    }));
  } else {
    let taskId = ctx.job.remoteId;
    if (!ctx.resume || !taskId) {
      const endpoint = ark.modelId(model);
      taskId = await ark.submitVideo(endpoint, prompt, await jpegDataUri(keyAbs), {
        ar: project.aspectRatio,
        seconds,
        audio: withAudio,
      });
      await updateJob(ctx.projectId, ctx.target, ctx.job.kind, ctx.job.id, { endpoint, remoteId: taskId });
    }
    const tid = taskId;
    url = await pollUntilDone(() => ark.checkVideo(tid));
  }
  const saved = await downloadTo(url, ctx.base, "mp4");
  const info = await probe(saved.abs);
  return mediaRef(saved.abs, saved.mime, model, cost, { duration: info.duration || seconds });
}

const LINE_GAP = 0.3;

function voiceFor(project: Project, c?: Character) {
  if (c?.voice) return c.voice;
  const gender = c?.gender ?? "other";
  const pool = fal.ELEVEN_VOICES[gender];
  const idx = c ? Math.max(0, project.characters.filter((x) => x.gender === gender).findIndex((x) => x.id === c.id)) : 0;
  return pool[idx % pool.length];
}

async function makeVoice(ctx: Ctx, project: Project, shot: Shot) {
  const { model } = ctx;
  const lines = shot.dialogue.filter((d) => d.line.trim());
  const parts: string[] = [];
  const cues: NonNullable<MediaRef["cues"]> = [];
  let t = 0;
  try {
    for (const [i, d] of lines.entries()) {
      const speaker = project.characters.find((c) => c.name.trim().toLowerCase() === d.speaker.trim().toLowerCase());
      const lineBase = `${ctx.base}-line${i}`;
      let file: string;
      if (model.provider === "mock") {
        file = `${lineBase}.wav`;
        await mock.speak(d.line, speaker?.gender ?? "other", file);
      } else if (model.provider === "fal") {
        const url = await fal.run(model.endpoint!, { text: d.line, voice: voiceFor(project, speaker) });
        file = (await downloadTo(url, lineBase, "mp3")).abs;
      } else {
        throw new Error(`${model.label} cannot synthesize speech`);
      }
      parts.push(file);
      const dur = (await probe(file)).duration;
      cues.push({ start: t, end: t + dur, speaker: d.speaker, text: d.line });
      t += dur + LINE_GAP;
    }
    const out = `${ctx.base}.m4a`;
    await concatAudio(parts, out, LINE_GAP);
    const info = await probe(out);
    const cost = estimateCost(model, { chars: dialogueChars(shot) });
    return mediaRef(out, "audio/mp4", model, cost, { duration: info.duration, cues });
  } finally {
    await Promise.all(parts.map((f) => fs.rm(f, { force: true })));
  }
}

/**
 * After a server restart, jobs can be left "running" with nobody polling them.
 * fal and Ark jobs that already have a provider request id are picked up again;
 * everything else is marked failed so the user can retry.
 */
export async function recoverInterrupted(project: Project) {
  const orphan = (j?: JobState) => !!j && isActive(j) && !registry.jobs.has(j.id);
  const taskNames = { breakdown: `breakdown:${project.id}`, pipeline: `pipeline:${project.id}`, export: `export:${project.id}` };
  const needsWork =
    project.characters.some((c) => orphan(c.job)) ||
    project.shots.some((s) => Object.values(s.jobs).some(orphan)) ||
    (Object.keys(taskNames) as (keyof typeof taskNames)[]).some(
      (k) => isActive(project[k]) && !registry.tasks.has(taskNames[k]),
    );
  if (!needsWork) return false;

  const resumable = (j: JobState) => {
    const m = modelByKey(j.model);
    return !!j.remoteId && !!m && ((m.provider === "fal" && j.kind !== "audio") || (m.provider === "ark" && j.kind === "video"));
  };
  const interrupted = { status: "failed" as const, error: "Interrupted by a server restart. Generate again.", finishedAt: nowIso() };

  const toResume = await mutateProject(project.id, (p) => {
    const list: { target: ItemRef; job: JobState }[] = [];
    const visit = (target: ItemRef, j?: JobState) => {
      if (!j || !orphan(j)) return;
      if (resumable(j)) list.push({ target, job: structuredClone(j) });
      else Object.assign(j, interrupted);
    };
    for (const c of p.characters) visit({ type: "character", id: c.id }, c.job);
    for (const s of p.shots) for (const j of Object.values(s.jobs)) visit({ type: "shot", id: s.id }, j);
    for (const k of Object.keys(taskNames) as (keyof typeof taskNames)[]) {
      const task = p[k];
      if (task && isActive(task) && !registry.tasks.has(taskNames[k])) Object.assign(task, interrupted);
    }
    return list;
  });
  for (const { target, job } of toResume) {
    if (!registry.jobs.has(job.id)) void runJob(project.id, target, job, true);
  }
  return true;
}
