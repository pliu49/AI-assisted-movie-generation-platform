"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import type { AspectRatio } from "@/lib/types";
import { Button, isActive, Label, Modal, Spinner, TextField } from "../ui";
import { useStudio } from "./context";

const ENGINE = {
  claude: { name: "Claude", note: "Writes full prompts, looks and dialogue timing." },
  ark: { name: "Doubao (Volcengine Ark)", note: "Writes full prompts, looks and dialogue timing." },
  rules: {
    name: "offline rule-based splitter",
    note: "Understands INT./EXT. scene lines and NAME: dialogue lines. Add ANTHROPIC_API_KEY or ARK_API_KEY for real AI breakdowns.",
  },
};

export function ScriptTab() {
  const { project, status, op, apply, notify, setTab } = useStudio();
  const [script, setScript] = useState(project.script);
  const [confirm, setConfirm] = useState(false);
  const running = isActive(project.breakdown);
  const engine = ENGINE[status.llm];
  const hasMedia = project.shots.some((s) => s.keyframe || s.video || s.audio);

  async function breakdown() {
    setConfirm(false);
    try {
      if (script !== project.script) await op({ op: "update", patch: { script } });
      apply(await api.breakdown(project.id));
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  return (
    <div className="grid h-full grid-cols-[1fr_360px] overflow-hidden">
      <div className="flex min-h-0 flex-col p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Script</h2>
          <span className="text-xs text-ink-400">{script.length.toLocaleString()} characters</span>
        </div>
        <textarea
          className="field min-h-0 flex-1 !resize-none font-mono !text-[13px] !leading-relaxed"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          onBlur={() => script !== project.script && op({ op: "update", patch: { script } })}
          placeholder={"EXT. ROOFTOP - NIGHT\nLENA stares at the city lights.\nKAI: You shouldn't be here.\nLENA: Neither should you.\n\n…or just describe the story in a few sentences."}
        />
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={running || !script.trim()}
            onClick={() => (project.shots.length ? setConfirm(true) : breakdown())}
          >
            {running ? <Spinner /> : "✦"} {project.shots.length ? "Re-run breakdown" : "Break into shots"}
          </Button>
          <span className="text-xs text-ink-400">
            Engine: <span className="text-ink-200">{engine.name}</span>. {engine.note}
          </span>
        </div>
        {project.breakdown?.status === "failed" && <p className="mt-2 text-sm text-red-300">Breakdown failed: {project.breakdown.error}</p>}
        {project.breakdown?.status === "succeeded" && project.shots.length > 0 && !running && (
          <p className="mt-2 text-sm text-ink-300">
            {project.shots.length} shots and {project.characters.length} characters ready.{" "}
            <button className="text-cyan-300 hover:underline" onClick={() => setTab("canvas")}>
              Open the canvas →
            </button>
          </p>
        )}
      </div>

      <aside className="min-h-0 space-y-4 overflow-y-auto border-l border-ink-700 bg-ink-850/40 p-5">
        <h2 className="text-sm font-semibold">Episode settings</h2>
        <div>
          <Label>Logline</Label>
          <TextField multiline rows={3} value={project.logline} onCommit={(v) => op({ op: "update", patch: { logline: v } })} placeholder="One sentence hook" />
        </div>
        <div>
          <Label hint="added to every prompt">Visual style</Label>
          <TextField
            multiline
            rows={4}
            value={project.style}
            onCommit={(v) => op({ op: "update", patch: { style: v } })}
            placeholder="e.g. Cinematic photoreal, rainy neon night, teal-and-amber grade, 35mm film look — or: 2D anime, cel shading, soft pastel palette"
          />
        </div>
        <div>
          <Label>Format</Label>
          <select
            className="field"
            value={project.aspectRatio}
            onChange={(e) => op({ op: "update", patch: { aspectRatio: e.target.value as AspectRatio } })}
          >
            <option value="9:16">9:16 vertical (TikTok, Reels, short-drama apps)</option>
            <option value="16:9">16:9 widescreen (YouTube)</option>
            <option value="1:1">1:1 square</option>
          </select>
          {hasMedia && <p className="mt-1 text-[11px] text-ink-400">Changing format affects new generations only.</p>}
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3 text-xs leading-relaxed text-ink-300">
          <div className="mb-1 font-semibold text-ink-200">Tips for better episodes</div>
          <ul className="list-disc space-y-1 pl-4">
            <li>Give every character a concrete look: age, hair, outfit colors. It is reused in every prompt.</li>
            <li>Keep shots to one action each; video models handle 4–10 s best.</li>
            <li>Generate character references before keyframes so faces stay consistent.</li>
            <li>Test on the offline or Fast models, then switch to the best model for the final pass.</li>
          </ul>
        </div>
      </aside>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Replace the shot list?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={breakdown}>
              Re-run breakdown
            </Button>
          </>
        }
      >
        This replaces all {project.shots.length} shots{hasMedia ? ", including their generated frames and clips" : ""}. Characters with the
        same name keep their reference images.
      </Modal>
    </div>
  );
}
