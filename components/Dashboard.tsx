"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { AspectRatio } from "@/lib/types";
import { Button, Label, Spinner } from "./ui";

interface Summary {
  id: string;
  title: string;
  logline: string;
  aspectRatio: AspectRatio;
  shots: number;
  done: boolean;
  updatedAt: string;
}

const RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "9:16", label: "9:16 vertical" },
  { value: "16:9", label: "16:9 wide" },
  { value: "1:1", label: "1:1 square" },
];

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function Dashboard({ projects }: { projects: Summary[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [ratio, setRatio] = useState<AspectRatio>("9:16");
  const [busy, setBusy] = useState<"new" | "sample" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(sample: boolean) {
    setBusy(sample ? "sample" : "new");
    setError(null);
    try {
      const p = await api.createProject(sample ? { sample: true } : { title, script, aspectRatio: ratio });
      router.push(`/project/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all of its generated media?`)) return;
    await api.deleteProject(id);
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
      <section className="h-fit rounded-2xl border border-ink-700 bg-ink-850 p-5">
        <h2 className="text-base font-semibold">New project</h2>
        <div className="mt-4 space-y-4">
          <div>
            <Label>Title</Label>
            <input className="field" placeholder="Untitled drama" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Format</Label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-ink-600 bg-ink-900 p-1">
              {RATIOS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRatio(r.value)}
                  className={`rounded-md py-1.5 text-xs ${ratio === r.value ? "bg-ink-700 text-ink-100" : "text-ink-300 hover:text-ink-100"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label hint="script, outline, or an idea">Story</Label>
            <textarea
              className="field font-mono text-[12.5px]"
              rows={10}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={
                "EXT. ROOFTOP - NIGHT\nLENA stares at the city lights.\nKAI: You shouldn't be here.\nLENA: Neither should you."
              }
            />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => create(false)} disabled={!!busy}>
              {busy === "new" && <Spinner />} Create project
            </Button>
            <Button onClick={() => create(true)} disabled={!!busy} title="A 45-second sample episode with a ready shot list">
              {busy === "sample" && <Spinner />} Open sample
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Projects</h2>
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-600 p-10 text-center text-sm text-ink-300">
            No projects yet. Open the sample to see the full flow in under a minute, no API keys needed.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id} className="group relative rounded-2xl border border-ink-700 bg-ink-850 p-4 transition hover:border-ink-500">
                <Link href={`/project/${p.id}`} className="absolute inset-0" aria-label={`Open ${p.title}`} />
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{p.title}</h3>
                  {p.done && (
                    <span className="rounded-full border border-emerald-800/70 px-2 py-0.5 text-[10px] text-emerald-300">exported</span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 min-h-[2.5em] text-xs text-ink-300">{p.logline || "No logline yet"}</p>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-400">
                  <span>{p.aspectRatio}</span>
                  <span>{p.shots} shots</span>
                  <span>{timeAgo(p.updatedAt)}</span>
                  <button
                    onClick={() => remove(p.id, p.title)}
                    className="relative z-10 ml-auto rounded px-1.5 py-0.5 text-ink-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-950/50 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
