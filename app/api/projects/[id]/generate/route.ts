import { z } from "zod";
import { plannedWork } from "@/lib/cost";
import { getProject } from "@/lib/server/db";
import { fail, handle, json, type IdParams } from "@/lib/server/http";
import { startJob, type ItemRef } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";

const Body = z.union([
  // explicit items
  z.object({
    kind: z.enum(["image", "video", "audio"]),
    targets: z.array(z.object({ type: z.enum(["character", "shot"]), id: z.string() })).min(1).max(200),
  }),
  // a whole stage; `force` regenerates items that already have media
  z.object({
    batch: z.enum(["characters", "keyframes", "videos", "voices"]),
    force: z.boolean().optional(),
  }),
]);

export const POST = handle(async (req: Request, { params }: IdParams) => {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return fail("Project not found", 404);
  const body = Body.parse(await req.json());

  let kind: "image" | "video" | "audio";
  let targets: ItemRef[];
  if ("targets" in body) {
    kind = body.kind;
    targets = body.targets;
  } else {
    const work = plannedWork(project);
    kind = work.kindOf[body.batch];
    if (!body.force) targets = work.plan[body.batch];
    else if (body.batch === "characters") targets = project.characters.map((c) => ({ type: "character", id: c.id }));
    else if (body.batch === "voices")
      targets = project.shots.filter((s) => s.dialogue.some((d) => d.line.trim())).map((s) => ({ type: "shot", id: s.id }));
    else if (body.batch === "videos") targets = project.shots.filter((s) => s.keyframe).map((s) => ({ type: "shot", id: s.id }));
    else targets = project.shots.map((s) => ({ type: "shot", id: s.id }));
  }

  const results = await Promise.all(targets.map((t) => startJob(id, t, kind)));
  const errors = [...new Set(results.filter((r) => !r.ok).map((r) => r.error ?? "Could not start"))];
  const started = results.filter((r) => r.ok).length;
  if (!started && errors.length) return fail(errors.join("; "), 400);
  return json({ started, errors, project: await getProject(id) });
});
