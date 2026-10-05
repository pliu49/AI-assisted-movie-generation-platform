"use client";

import { useState } from "react";
import { api, type Batch } from "@/lib/client/api";
import { plannedWork } from "@/lib/cost";
import { formatUsd } from "@/lib/models";
import { Button, Spinner } from "../ui";
import { useStudio } from "./context";

const LABELS: Record<Batch, string> = {
  characters: "Cast refs",
  keyframes: "Keyframes",
  videos: "Videos",
  voices: "Voices",
};

/** "Generate all missing X" buttons with live counts and cost estimates. */
export function BatchBar() {
  const { project, apply, notify } = useStudio();
  const [busy, setBusy] = useState<Batch | null>(null);
  const work = plannedWork(project);
  const batches: Batch[] = project.audioMode === "dub" ? ["characters", "keyframes", "videos", "voices"] : ["characters", "keyframes", "videos"];

  async function run(b: Batch) {
    setBusy(b);
    try {
      const res = await api.generateBatch(project.id, b);
      apply(res.project);
      if (res.errors.length) notify(res.errors.join("; "), "error");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-ink-400">Generate missing:</span>
      {batches.map((b) => {
        const n = work.plan[b].length;
        const blocked = b === "videos" && n > 0 && project.shots.every((s) => !s.keyframe) ? "Generate keyframes first" : undefined;
        return (
          <Button
            key={b}
            disabled={!n || !!busy || !!blocked}
            onClick={() => run(b)}
            title={blocked ?? (n ? `≈${formatUsd(work.cost(b))}` : "Nothing missing")}
            className="!py-1 text-xs"
          >
            {busy === b && <Spinner />}
            {LABELS[b]} <span className="text-ink-400">{n}</span>
          </Button>
        );
      })}
    </div>
  );
}
