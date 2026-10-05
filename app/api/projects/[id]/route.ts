import { getProject } from "@/lib/server/db";
import { fail, handle, json, type IdParams } from "@/lib/server/http";
import { recoverInterrupted } from "@/lib/server/jobs";
import { applyOp, deleteProject, OpSchema } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: IdParams) => {
  const { id } = await params;
  let project = await getProject(id);
  if (!project) return fail("Project not found", 404);
  if (await recoverInterrupted(project)) project = await getProject(id);
  return json(project);
});

export const PATCH = handle(async (req: Request, { params }: IdParams) => {
  const { id } = await params;
  const op = OpSchema.parse(await req.json());
  return json(await applyOp(id, op));
});

export const DELETE = handle(async (_req: Request, { params }: IdParams) => {
  const { id } = await params;
  return (await deleteProject(id)) ? json({ ok: true }) : fail("Project not found", 404);
});
