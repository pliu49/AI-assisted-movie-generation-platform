import { notFound } from "next/navigation";
import { Studio } from "@/components/studio/Studio";
import { getProject } from "@/lib/server/db";
import { recoverInterrupted } from "@/lib/server/jobs";
import { providerStatus } from "@/lib/server/status";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let project = await getProject(id);
  if (!project) notFound();
  if (await recoverInterrupted(project)) project = (await getProject(id)) ?? project;
  return <Studio initial={project} status={await providerStatus()} />;
}
