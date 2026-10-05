// One click from shot list to finished episode:
// character refs -> keyframes -> video clips -> voices (dub mode) -> export.
// Each stage only generates what is missing, so re-running continues where it stopped.
import { plannedWork, type Stage } from "../cost";
import type { GenKind, Project } from "../types";
import { getProject, mutateProject } from "./db";
import { startJob, type ItemRef } from "./jobs";
import { nowIso } from "./paths";
import { registry, runTask } from "./registry";
import { exportNow } from "./render";

const STAGES: { stage: Stage; label: string; kind: GenKind }[] = [
  { stage: "characters", label: "Character references", kind: "image" },
  { stage: "keyframes", label: "Keyframes", kind: "image" },
  { stage: "videos", label: "Video clips", kind: "video" },
  { stage: "voices", label: "Voices", kind: "audio" },
];

/** Start jobs for a list of items and wait for all of them. Returns how many failed. */
export async function runBatch(projectId: string, items: ItemRef[], kind: GenKind) {
  const started = await Promise.all(items.map((t) => startJob(projectId, t, kind)));
  await Promise.all(started.map((s) => s.done));
  const p = await getProject(projectId);
  if (!p) return { failed: items.length, errors: ["Project was deleted"] };
  const errors: string[] = started.filter((s) => !s.ok).map((s) => s.error ?? "failed to start");
  for (const t of items) {
    const job = t.type === "character" ? p.characters.find((c) => c.id === t.id)?.job : p.shots.find((s) => s.id === t.id)?.jobs[kind];
    if (job?.status === "failed" && job.error) errors.push(job.error);
  }
  return { failed: errors.length, errors };
}

async function setPipeline(projectId: string, patch: Partial<NonNullable<Project["pipeline"]>>) {
  await mutateProject(projectId, (p) => {
    p.pipeline = { status: "running", startedAt: nowIso(), ...p.pipeline, ...patch };
  });
}

export async function startPipeline(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const name = `pipeline:${projectId}`;
  if (registry.tasks.has(name)) return { ok: false, error: "The pipeline is already running" };
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found" };
  if (!project.shots.length) return { ok: false, error: "Break the script into shots first" };
  await mutateProject(projectId, (p) => {
    p.pipeline = { status: "running", stage: "Starting", startedAt: nowIso() };
  });
  runTask(name, async () => {
    try {
      for (const { stage, label, kind } of STAGES) {
        const p = await getProject(projectId);
        if (!p) return;
        const items = plannedWork(p).plan[stage];
        if (!items.length) continue;
        await setPipeline(projectId, { stage: `${label} (${items.length})` });
        const { failed, errors } = await runBatch(projectId, items, kind);
        if (failed) throw new Error(`${label}: ${failed} failed. First error: ${errors[0]}`);
      }
      await setPipeline(projectId, { stage: "Rendering episode" });
      // Register the export under its own name too, so restart recovery sees it as live.
      const exportTask = `export:${projectId}`;
      registry.tasks.add(exportTask);
      let exported: boolean;
      try {
        exported = await exportNow(projectId);
      } finally {
        registry.tasks.delete(exportTask);
      }
      if (!exported) throw new Error("Export failed; see the Preview tab for details");
      await setPipeline(projectId, { status: "succeeded", stage: "Done", finishedAt: nowIso() });
    } catch (err) {
      await setPipeline(projectId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: nowIso(),
      }).catch(() => undefined);
    }
  });
  return { ok: true };
}
