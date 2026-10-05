"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { plannedWork, type Stage } from "@/lib/cost";
import { formatUsd, modelByKey, modelsFor, priceLabel, providerReady } from "@/lib/models";
import type { GenKind } from "@/lib/types";
import { Button, isActive, Modal, Spinner, TextField } from "../ui";
import { useStudio, type Tab } from "./context";

const TABS: { id: Tab; label: string }[] = [
  { id: "script", label: "Script" },
  { id: "canvas", label: "Canvas" },
  { id: "storyboard", label: "Storyboard" },
  { id: "preview", label: "Preview & export" },
];

function ModelSelect({ kind, slot, label }: { kind: GenKind; slot: "image" | "video" | "tts"; label: string }) {
  const { project, status, op } = useStudio();
  const current = project.models[slot];
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-400">
      {label}
      <select
        className="field !w-auto max-w-[220px] !py-1 !text-xs"
        value={current}
        title={modelByKey(current)?.note}
        onChange={(e) => op({ op: "update", patch: { models: { [slot]: e.target.value } } })}
      >
        {modelsFor(kind).map((m) => {
          const ready = providerReady(m.provider, status);
          const needs = m.provider === "fal" ? "FAL_KEY" : "ARK_API_KEY";
          const suffix = m.provider === "mock" ? "" : ready ? ` · ${priceLabel(m)}` : ` (needs ${needs})`;
          return (
            <option key={m.key} value={m.key} disabled={!ready}>
              {m.label}
              {suffix}
            </option>
          );
        })}
      </select>
    </label>
  );
}

const STAGE_LABELS: Record<Stage, string> = {
  characters: "Character references",
  keyframes: "Keyframes",
  videos: "Video clips",
  voices: "Voice lines",
};

export function TopBar({ tab }: { tab: Tab }) {
  const { project, op, setTab, apply, notify } = useStudio();
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const work = plannedWork(project);
  const pipelineRunning = isActive(project.pipeline);
  const videoModel = modelByKey(project.models.video);

  async function runPipeline() {
    setStarting(true);
    try {
      apply(await api.pipeline(project.id));
      setConfirming(false);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setStarting(false);
    }
  }

  return (
    <header className="border-b border-ink-700 bg-ink-900">
      <div className="flex h-12 items-center gap-3 px-4">
        <Link href="/" className="text-sm text-ink-300 hover:text-ink-100" title="All projects">
          ◂
        </Link>
        <TextField
          value={project.title}
          onCommit={(title) => op({ op: "update", patch: { title } })}
          className="!w-64 !border-transparent !bg-transparent !px-1 text-[15px] font-semibold hover:!border-ink-600"
        />
        <nav className="ml-2 flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1 text-[13px] ${tab === t.id ? "bg-ink-700 text-ink-100" : "text-ink-300 hover:text-ink-100"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {project.pipeline && (
            <span
              className={`max-w-80 truncate text-xs ${project.pipeline.status === "failed" ? "text-red-300" : "text-ink-300"}`}
              title={project.pipeline.error ?? project.pipeline.stage}
            >
              {pipelineRunning && <Spinner className="mr-1.5 inline h-3 w-3" />}
              {project.pipeline.status === "failed"
                ? `Pipeline stopped: ${project.pipeline.error}`
                : project.pipeline.status === "succeeded"
                  ? "Pipeline finished"
                  : project.pipeline.stage}
            </span>
          )}
          <span className="text-xs text-ink-400" title="Spent on API generations in this project (estimated)">
            Spent <span className="text-ink-200">{formatUsd(project.spendUsd)}</span>
          </span>
          <Button
            variant="primary"
            disabled={!project.shots.length || pipelineRunning}
            onClick={() => setConfirming(true)}
            title="Generate everything that's missing, then render the episode"
          >
            {pipelineRunning ? <Spinner /> : "▶"} Make episode
          </Button>
        </div>
      </div>
      <div className="flex h-10 items-center gap-4 overflow-x-auto border-t border-ink-800 px-4">
        <ModelSelect kind="image" slot="image" label="Image" />
        <ModelSelect kind="video" slot="video" label="Video" />
        <ModelSelect kind="audio" slot="tts" label="Voice" />
        <label
          className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-400"
          title="Native: the video model speaks the lines with lip sync. Dub: TTS voices are laid over the clips."
        >
          Audio
          <select
            className="field !w-auto !py-1 !text-xs"
            value={project.audioMode}
            onChange={(e) => op({ op: "update", patch: { audioMode: e.target.value as "native" | "dub" } })}
          >
            <option value="dub">Dub with TTS voices</option>
            <option value="native" disabled={!videoModel?.nativeAudio}>
              Native, lip-synced{videoModel?.nativeAudio ? "" : " (not with this model)"}
            </option>
          </select>
        </label>
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-400">
          <input
            type="checkbox"
            className="accent-cyan-500"
            checked={project.subtitles}
            onChange={(e) => op({ op: "update", patch: { subtitles: e.target.checked } })}
          />
          Burn subtitles
        </label>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Make the episode"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={runPipeline} disabled={starting}>
              {starting && <Spinner />} Start · ≈{formatUsd(work.total)}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-ink-300">
          Generates only what is missing, stage by stage, then renders the MP4. Stages wait for the previous one, so
          keyframes use the finished character references.
        </p>
        <table className="w-full text-[13px]">
          <tbody>
            {(Object.keys(STAGE_LABELS) as Stage[]).map((s) => (
              <tr key={s} className="border-t border-ink-700">
                <td className="py-1.5">{STAGE_LABELS[s]}</td>
                <td className="py-1.5 text-right text-ink-300">
                  {work.plan[s].length ? `${work.plan[s].length} to generate` : s === "voices" && project.audioMode === "native" ? "from video model" : "done"}
                </td>
                <td className="w-20 py-1.5 text-right">{work.plan[s].length ? formatUsd(work.cost(s)) : "–"}</td>
              </tr>
            ))}
            <tr className="border-t border-ink-600 font-semibold">
              <td className="py-1.5">Estimated total</td>
              <td />
              <td className="py-1.5 text-right">{formatUsd(work.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-400">
          Estimates use list prices; the provider bills the real amount. Offline models are free.
        </p>
      </Modal>
    </header>
  );
}
