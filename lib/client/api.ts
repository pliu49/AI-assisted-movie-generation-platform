"use client";

import type { AspectRatio, GenKind, MediaRef, Project } from "../types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export type Op =
  | { op: "update"; patch: Partial<Pick<Project, "title" | "logline" | "style" | "aspectRatio" | "audioMode" | "subtitles" | "script">> & { models?: Partial<Project["models"]> } }
  | { op: "updateCharacter"; id: string; patch: Partial<{ name: string; gender: string; description: string; voice: string }> }
  | { op: "addCharacter" }
  | { op: "deleteCharacter"; id: string }
  | { op: "updateShot"; id: string; patch: Record<string, unknown> }
  | { op: "addShot"; afterId?: string }
  | { op: "deleteShot"; id: string }
  | { op: "moveShot"; id: string; dir: -1 | 1 }
  | { op: "setCanvas"; positions: Record<string, { x: number; y: number }> };

export type Batch = "characters" | "keyframes" | "videos" | "voices";

export const api = {
  createProject: (body: { title?: string; script?: string; aspectRatio?: AspectRatio; sample?: boolean }) =>
    call<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  getProject: (id: string) => call<Project>(`/api/projects/${id}`),
  deleteProject: (id: string) => call<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  op: (id: string, op: Op) => call<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(op) }),
  breakdown: (id: string) => call<Project>(`/api/projects/${id}/breakdown`, { method: "POST" }),
  generate: (id: string, kind: GenKind, targets: { type: "character" | "shot"; id: string }[]) =>
    call<{ started: number; errors: string[]; project: Project }>(`/api/projects/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({ kind, targets }),
    }),
  generateBatch: (id: string, batch: Batch, force = false) =>
    call<{ started: number; errors: string[]; project: Project }>(`/api/projects/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({ batch, force }),
    }),
  pipeline: (id: string) => call<Project>(`/api/projects/${id}/pipeline`, { method: "POST" }),
  exportVideo: (id: string) => call<Project>(`/api/projects/${id}/export`, { method: "POST" }),
};

export function mediaUrl(ref?: { file: string } | MediaRef | null, download = false) {
  if (!ref) return undefined;
  const path = ref.file.split("/").map(encodeURIComponent).join("/");
  return `/api/media/${path}${download ? "?download=1" : ""}`;
}
