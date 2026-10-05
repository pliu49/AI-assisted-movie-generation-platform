import { getProject } from "@/lib/server/db";
import { fail, handle, json, type IdParams } from "@/lib/server/http";
import { startExport } from "@/lib/server/render";
import { providerStatus } from "@/lib/server/status";

export const dynamic = "force-dynamic";

export const POST = handle(async (_req: Request, { params }: IdParams) => {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return fail("Project not found", 404);
  if (!project.shots.length) return fail("Nothing to export yet: break the script into shots first");
  if (!(await providerStatus()).ffmpeg) return fail("ffmpeg was not found. Install it or set FFMPEG_PATH.");
  const res = await startExport(id);
  if (!res.ok) return fail(res.error ?? "Could not start the export", 409);
  return json(await getProject(id));
});
