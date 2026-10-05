import type { Character, Project, Shot } from "../../types";
import { getProject, mutateProject } from "../db";
import { newId, nowIso } from "../paths";
import { registry, runTask } from "../registry";
import { providerStatus } from "../status";
import { breakdownWithClaude } from "./claude";
import { breakdownWithDoubao } from "./doubao";
import { breakdownWithRules } from "./rules";
import type { Breakdown } from "./schema";

function userPrompt(p: Project) {
  const frame = { "9:16": "vertical 9:16", "16:9": "horizontal 16:9", "1:1": "square 1:1" }[p.aspectRatio];
  return [
    `Format: ${frame} short drama episode.`,
    p.style.trim() ? `Visual style (use as given): ${p.style.trim()}` : "Visual style: choose one that suits the story.",
    "",
    "Script:",
    "<script>",
    p.script.trim(),
    "</script>",
  ].join("\n");
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Replace the shot list. Characters keep their id and reference image when the name matches. */
export function applyBreakdown(p: Project, b: Breakdown) {
  const existing = new Map(p.characters.map((c) => [c.name.trim().toLowerCase(), c]));
  const characters: Character[] = b.characters.map((bc) => {
    const prev = existing.get(bc.name.trim().toLowerCase());
    if (prev) return { ...prev, gender: bc.gender, description: prev.image ? prev.description : bc.description };
    return { id: newId("chr"), name: bc.name.trim(), gender: bc.gender, description: bc.description };
  });
  const idByName = new Map(characters.map((c) => [c.name.toLowerCase(), c.id]));
  const shots: Shot[] = b.shots.map((s) => ({
    id: newId("shot"),
    duration: clamp(s.duration, 2, 15),
    shotType: s.shot_type,
    camera: s.camera,
    location: s.location,
    characters: [...new Set(s.characters.map((n) => idByName.get(n.trim().toLowerCase())).filter((id): id is string => !!id))],
    action: s.action,
    dialogue: s.dialogue.filter((d) => d.line.trim()),
    imagePrompt: s.image_prompt,
    motionPrompt: s.motion_prompt,
    jobs: {},
  }));
  p.characters = characters;
  p.shots = shots;
  if (b.title && (!p.title.trim() || p.title === "Untitled drama")) p.title = b.title;
  if (b.logline) p.logline = b.logline;
  if (b.style && !p.style.trim()) p.style = b.style;
}

export async function startBreakdown(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found" };
  if (!project.script.trim()) return { ok: false, error: "Write or paste a script first" };
  const { llm } = await providerStatus();
  const name = `breakdown:${projectId}`;
  if (registry.tasks.has(name)) return { ok: false, error: "A breakdown is already running" };
  // Mark it running before responding so the next poll already shows progress.
  await mutateProject(projectId, (p) => {
    p.breakdown = { status: "running", engine: llm, startedAt: nowIso() };
  });
  const started = runTask(name, async () => {
    try {
      const fresh = (await getProject(projectId))!;
      const result =
        llm === "claude"
          ? await breakdownWithClaude(userPrompt(fresh))
          : llm === "ark"
            ? await breakdownWithDoubao(userPrompt(fresh))
            : breakdownWithRules(fresh.script);
      await mutateProject(projectId, (p) => {
        applyBreakdown(p, result);
        p.breakdown = { status: "succeeded", engine: llm, startedAt: p.breakdown?.startedAt ?? nowIso(), finishedAt: nowIso() };
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("[breakdown]", error);
      await mutateProject(projectId, (p) => {
        p.breakdown = { status: "failed", engine: llm, error, startedAt: p.breakdown?.startedAt ?? nowIso(), finishedAt: nowIso() };
      }).catch(() => undefined);
    }
  });
  return started ? { ok: true } : { ok: false, error: "A breakdown is already running" };
}
