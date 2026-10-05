"use client";

import { createContext, useContext } from "react";
import type { Op } from "@/lib/client/api";
import type { ItemRef } from "@/lib/cost";
import type { GenKind, Project, ProviderStatus } from "@/lib/types";

export type Selection = { type: "character" | "shot" | "script" | "export"; id?: string };
export type Tab = "script" | "canvas" | "storyboard" | "preview";

export interface StudioApi {
  project: Project;
  status: ProviderStatus;
  op: (op: Op) => Promise<void>;
  generate: (kind: GenKind, targets: ItemRef[]) => Promise<void>;
  selected: Selection | null;
  select: (s: Selection | null) => void;
  setTab: (t: Tab) => void;
  notify: (msg: string, tone?: "error" | "info") => void;
  refresh: () => Promise<void>;
  apply: (p: Project) => void;
}

export const StudioContext = createContext<StudioApi | null>(null);

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside <Studio>");
  return ctx;
}
