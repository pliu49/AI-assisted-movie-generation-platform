import { startBreakdown } from "@/lib/server/breakdown";
import { getProject } from "@/lib/server/db";
import { fail, handle, json, type IdParams } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (_req: Request, { params }: IdParams) => {
  const { id } = await params;
  const res = await startBreakdown(id);
  if (!res.ok) return fail(res.error ?? "Could not start the breakdown", 409);
  return json(await getProject(id));
});
