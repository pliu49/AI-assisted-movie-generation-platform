import { z } from "zod";
import { listProjects } from "@/lib/server/db";
import { handle, json } from "@/lib/server/http";
import { createProject } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const projects = await listProjects();
  return json(
    projects.map((p) => ({
      id: p.id,
      title: p.title,
      logline: p.logline,
      aspectRatio: p.aspectRatio,
      shots: p.shots.length,
      updatedAt: p.updatedAt,
    })),
  );
});

const CreateSchema = z.object({
  title: z.string().max(200).optional(),
  script: z.string().max(100_000).optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
  sample: z.boolean().optional(),
});

export const POST = handle(async (req: Request) => {
  const body = CreateSchema.parse(await req.json());
  return json(await createProject(body), 201);
});
