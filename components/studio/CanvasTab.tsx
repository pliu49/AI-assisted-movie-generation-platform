"use client";

import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mediaUrl } from "@/lib/client/api";
import { clipOutdated, voiceOutdated } from "@/lib/cost";
import type { Project } from "@/lib/types";
import { Button, isActive, JobChip, Spinner } from "../ui";
import { BatchBar } from "./BatchBar";
import { useStudio } from "./context";
import { CharacterEditor, GenButton, ShotEditor } from "./editors";
import { ExportPanel } from "./PreviewTab";

type XY = { x: number; y: number };

const PALETTE = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#a78bfa", "#fb7185", "#34d399", "#60a5fa"];
const COLS = 3;
const CHAR_X = 320;
const SHOT_X = 640;

function shotBox(p: Project) {
  return p.aspectRatio === "9:16" ? { w: 320, h: 230 } : { w: 330, h: 300 };
}

function defaultPosition(p: Project, id: string): XY {
  const box = shotBox(p);
  if (id === "script") return { x: 0, y: 0 };
  if (id === "export") return { x: SHOT_X + COLS * box.w + 40, y: 0 };
  const ci = p.characters.findIndex((c) => c.id === id);
  if (ci >= 0) return { x: CHAR_X, y: ci * 200 };
  const si = p.shots.findIndex((s) => s.id === id);
  return { x: SHOT_X + (si % COLS) * box.w, y: Math.floor(si / COLS) * box.h };
}

// ---------------------------------------------------------------- nodes

function Frame({ selected, children, width }: { selected?: boolean; children: React.ReactNode; width: number }) {
  return (
    <div
      style={{ width }}
      className={`rounded-xl border bg-ink-850 text-ink-100 shadow-lg transition ${
        selected ? "border-cyan-400 shadow-cyan-500/20" : "border-ink-600 hover:border-ink-500"
      }`}
    >
      {children}
    </div>
  );
}

const handleCls = "!h-2 !w-2 !border-ink-500 !bg-ink-700";

function ScriptNode({ selected }: NodeProps) {
  const { project, status, setTab } = useStudio();
  const running = isActive(project.breakdown);
  const engine = { claude: "Claude", ark: "Doubao", rules: "rule-based" }[status.llm];
  return (
    <Frame selected={selected} width={260}>
      <div className="border-b border-ink-700 px-3 py-2 text-[11px] font-semibold tracking-wide text-cyan-300 uppercase">Script</div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-4 font-mono text-[11px] leading-snug whitespace-pre-line text-ink-300">
          {project.script || "No script yet"}
        </p>
        <div className="flex items-center justify-between text-[11px] text-ink-400">
          <span>
            {project.shots.length} shots · {project.characters.length} characters
          </span>
          {running && (
            <span className="flex items-center gap-1 text-cyan-300">
              <Spinner className="h-3 w-3" /> {engine}
            </span>
          )}
        </div>
        <Button className="nodrag w-full !py-1 text-xs" onClick={() => setTab("script")}>
          Edit script
        </Button>
      </div>
      <Handle type="source" position={Position.Right} className={handleCls} />
    </Frame>
  );
}

function CharacterNode({ id, selected }: NodeProps) {
  const { project } = useStudio();
  const c = project.characters.find((x) => x.id === id);
  if (!c) return null;
  const color = PALETTE[project.characters.indexOf(c) % PALETTE.length];
  const img = mediaUrl(c.image);
  const shots = project.shots.filter((s) => s.characters.includes(c.id)).length;
  return (
    <Frame selected={selected} width={250}>
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="flex gap-2.5 p-2.5">
        <div className="relative aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-md border border-ink-700 bg-ink-950">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={c.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-lg text-ink-600">?</div>
          )}
          {isActive(c.job) && (
            <div className="absolute inset-0 grid place-items-center bg-black/50 text-cyan-200">
              <Spinner />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate text-sm font-semibold">{c.name}</span>
          </div>
          <p className="mt-0.5 line-clamp-3 text-[10.5px] leading-snug text-ink-400">{c.description || "No look described"}</p>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-ink-500">{shots} shots</span>
            <GenButton
              kind="image"
              target={{ type: "character", id: c.id }}
              job={c.job}
              has={!!c.image}
              label="Ref"
              className="nodrag !px-2 !py-0.5 !text-[11px]"
            />
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={handleCls} />
    </Frame>
  );
}

function ShotNode({ id, selected }: NodeProps) {
  const { project } = useStudio();
  const index = project.shots.findIndex((s) => s.id === id);
  const shot = project.shots[index];
  if (!shot) return null;
  const vertical = project.aspectRatio === "9:16";
  const thumb = mediaUrl(shot.keyframe);
  const video = mediaUrl(shot.video);
  const working = isActive(shot.jobs.image) || isActive(shot.jobs.video);
  const target = { type: "shot" as const, id: shot.id };
  const hasDialogue = shot.dialogue.some((d) => d.line.trim());
  const media = (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border border-ink-700 bg-ink-950 ${
        vertical ? "aspect-[9/16] w-[92px]" : project.aspectRatio === "16:9" ? "aspect-video w-full" : "aspect-square w-full"
      }`}
    >
      {video ? (
        <video
          src={video}
          poster={thumb}
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
          onMouseLeave={(e) => e.currentTarget.pause()}
        />
      ) : thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-[10px] text-ink-600">no frame</div>
      )}
      {working && (
        <div className="absolute inset-0 grid place-items-center bg-black/50 text-cyan-200">
          <Spinner />
        </div>
      )}
      {video && <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[9px] text-white">▶ clip</span>}
    </div>
  );
  return (
    <Frame selected={selected} width={vertical ? 290 : 300}>
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="flex items-center gap-1.5 border-b border-ink-700 px-2.5 py-1.5">
        <span className="rounded bg-ink-700 px-1.5 text-[11px] font-semibold">#{index + 1}</span>
        <span className="truncate text-[11px] text-ink-300">
          {shot.shotType} · {shot.duration}s
        </span>
      </div>
      <div className={`gap-2.5 p-2.5 ${vertical ? "flex" : "space-y-2"}`}>
        {media}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="line-clamp-3 text-[11px] leading-snug text-ink-200">{shot.action || shot.imagePrompt || "Empty shot"}</p>
          {shot.dialogue[0] && (
            <p className="line-clamp-2 text-[10.5px] leading-snug text-amber-200/90 italic">
              {shot.dialogue[0].speaker}: “{shot.dialogue[0].line}”
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <JobChip label="frame" job={shot.jobs.image} done={!!shot.keyframe} />
            <JobChip label="clip" job={shot.jobs.video} done={!!shot.video} stale={clipOutdated(shot)} />
            {project.audioMode === "dub" && hasDialogue && (
              <JobChip label="voice" job={shot.jobs.audio} done={!!shot.audio} stale={voiceOutdated(shot)} />
            )}
          </div>
          <div className="nodrag flex gap-1">
            <GenButton kind="image" target={target} job={shot.jobs.image} has={!!shot.keyframe} label="Frame" className="!px-1.5 !py-0.5 !text-[10.5px]" />
            <GenButton
              kind="video"
              target={target}
              job={shot.jobs.video}
              has={!!shot.video}
              label="Clip"
              blocked={shot.keyframe ? undefined : "Generate the keyframe first"}
              className="!px-1.5 !py-0.5 !text-[10.5px]"
            />
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={handleCls} />
    </Frame>
  );
}

function ExportNode({ selected }: NodeProps) {
  const { project } = useStudio();
  const ex = project.export;
  const src = ex?.status === "succeeded" ? mediaUrl({ file: ex.file! }) : undefined;
  const aspect = project.aspectRatio === "9:16" ? "aspect-[9/16] w-32" : project.aspectRatio === "16:9" ? "aspect-video w-full" : "aspect-square w-full";
  return (
    <Frame selected={selected} width={260}>
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="border-b border-ink-700 px-3 py-2 text-[11px] font-semibold tracking-wide text-cyan-300 uppercase">Episode</div>
      <div className="space-y-2 p-3">
        {src ? (
          <video src={src} controls playsInline preload="metadata" className={`nodrag mx-auto rounded-md border border-ink-700 bg-black ${aspect}`} />
        ) : (
          <p className="text-[11px] text-ink-400">
            {isActive(ex) ? (ex?.detail ?? "Rendering…") : ex?.status === "failed" ? `Failed: ${ex.error}` : "Not rendered yet. Select to export."}
          </p>
        )}
        {isActive(ex) && (
          <div className="flex items-center gap-1.5 text-[11px] text-cyan-300">
            <Spinner className="h-3 w-3" /> {ex?.detail}
          </div>
        )}
      </div>
    </Frame>
  );
}

const nodeTypes = { script: ScriptNode, character: CharacterNode, shot: ShotNode, export: ExportNode };

// ---------------------------------------------------------------- canvas

export function CanvasTab() {
  const { project, selected, select, op } = useStudio();
  const moved = useRef<Record<string, XY>>({});
  const [nodes, setNodes] = useState<Node[]>([]);

  const positionOf = useCallback(
    (id: string) => moved.current[id] ?? project.canvas?.[id] ?? defaultPosition(project, id),
    [project],
  );

  useEffect(() => {
    const wanted: Node[] = [
      { id: "script", type: "script", position: positionOf("script"), data: {} },
      ...project.characters.map((c) => ({ id: c.id, type: "character", position: positionOf(c.id), data: {} })),
      ...project.shots.map((s) => ({ id: s.id, type: "shot", position: positionOf(s.id), data: {} })),
      { id: "export", type: "export", position: positionOf("export"), data: {} },
    ];
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return wanted.map((n) => {
        const o = old.get(n.id);
        return o ? { ...o, position: o.dragging ? o.position : n.position } : n;
      });
    });
  }, [project, positionOf]);

  const selectedId = selected?.type === "script" ? "script" : selected?.type === "export" ? "export" : selected?.id;

  const edges: Edge[] = useMemo(() => {
    const colorOf = (cid: string) => PALETTE[Math.max(0, project.characters.findIndex((c) => c.id === cid)) % PALETTE.length];
    const list: Edge[] = project.characters.map((c) => ({
      id: `script-${c.id}`,
      source: "script",
      target: c.id,
      animated: isActive(project.breakdown),
      style: { stroke: "#3a4757", strokeDasharray: "4 4" },
    }));
    for (const s of project.shots) {
      for (const cid of s.characters) {
        const hot = selectedId === cid || selectedId === s.id;
        list.push({
          id: `${cid}-${s.id}`,
          source: cid,
          target: s.id,
          style: { stroke: colorOf(cid), strokeOpacity: hot ? 0.95 : 0.22, strokeWidth: hot ? 2 : 1.25 },
          zIndex: hot ? 1 : 0,
        });
      }
    }
    const last = project.shots[project.shots.length - 1];
    if (last) list.push({ id: `${last.id}-export`, source: last.id, target: "export", animated: isActive(project.export), style: { stroke: "#22d3ee", strokeOpacity: 0.6 } });
    return list;
  }, [project, selectedId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);

  const character = selected?.type === "character" ? project.characters.find((c) => c.id === selected.id) : undefined;
  const shotIndex = selected?.type === "shot" ? project.shots.findIndex((s) => s.id === selected.id) : -1;

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={nodes.map((n) => (n.id === selectedId ? { ...n, selected: true } : n.selected ? { ...n, selected: false } : n))}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, n) =>
            select(
              n.type === "script" ? { type: "script" } : n.type === "export" ? { type: "export" } : { type: n.type as "character" | "shot", id: n.id },
            )
          }
          onPaneClick={() => select(null)}
          onNodeDragStop={(_, n) => {
            moved.current[n.id] = n.position;
            void op({ op: "setCanvas", positions: { [n.id]: { x: Math.round(n.position.x), y: Math.round(n.position.y) } } });
          }}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={1.75}
          nodesConnectable={false}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#263241" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(n) => (n.type === "shot" ? "#3a4757" : n.type === "character" ? "#0e7490" : "#1d4ed8")} maskColor="rgba(7,9,13,0.7)" />
        </ReactFlow>
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
          <div className="pointer-events-auto rounded-xl border border-ink-700 bg-ink-850/90 px-2.5 py-1.5 backdrop-blur">
            <BatchBar />
          </div>
          <div className="pointer-events-auto flex gap-1.5 rounded-xl border border-ink-700 bg-ink-850/90 px-2 py-1.5 backdrop-blur">
            <Button variant="ghost" className="!py-0.5 text-xs" onClick={() => op({ op: "addCharacter" })}>
              + Character
            </Button>
            <Button variant="ghost" className="!py-0.5 text-xs" onClick={() => op({ op: "addShot" })}>
              + Shot
            </Button>
          </div>
        </div>
      </div>

      {selected && (
        <aside className="w-[400px] shrink-0 overflow-y-auto border-l border-ink-700 bg-ink-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {selected.type === "character" ? "Character" : selected.type === "shot" ? `Shot ${shotIndex + 1}` : selected.type === "export" ? "Export" : "Script"}
            </h3>
            <Button variant="ghost" className="!px-2 !py-0.5" onClick={() => select(null)}>
              ✕
            </Button>
          </div>
          {character && <CharacterEditor character={character} />}
          {shotIndex >= 0 && <ShotEditor shot={project.shots[shotIndex]} index={shotIndex} layout="panel" />}
          {selected.type === "export" && <ExportPanel />}
          {selected.type === "script" && <ScriptSummary />}
        </aside>
      )}
    </div>
  );
}

function ScriptSummary() {
  const { project, setTab } = useStudio();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-300">{project.logline || "No logline yet."}</p>
      <pre className="max-h-96 overflow-y-auto rounded-lg border border-ink-700 bg-ink-850 p-3 font-mono text-[11.5px] whitespace-pre-wrap text-ink-200">
        {project.script || "No script yet."}
      </pre>
      <Button onClick={() => setTab("script")}>Open the script editor</Button>
    </div>
  );
}
