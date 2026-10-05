"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Op } from "@/lib/client/api";
import type { ItemRef } from "@/lib/cost";
import type { GenKind, Project, ProviderStatus } from "@/lib/types";
import { isActive } from "../ui";
import { CanvasTab } from "./CanvasTab";
import { StudioContext, type Selection, type StudioApi, type Tab } from "./context";
import { PreviewTab } from "./PreviewTab";
import { ScriptTab } from "./ScriptTab";
import { StoryboardTab } from "./StoryboardTab";
import { TopBar } from "./TopBar";

function somethingRunning(p: Project) {
  return (
    isActive(p.breakdown) ||
    isActive(p.pipeline) ||
    isActive(p.export) ||
    p.characters.some((c) => isActive(c.job)) ||
    p.shots.some((s) => Object.values(s.jobs).some((j) => isActive(j)))
  );
}

export function Studio({ initial, status }: { initial: Project; status: ProviderStatus }) {
  const [project, setProject] = useState(initial);
  const [tab, setTab] = useState<Tab>(initial.shots.length ? "canvas" : "script");
  const [selected, select] = useState<Selection | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "error" | "info" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Every server mutation bumps updatedAt, so an older response can never overwrite a newer one.
  const apply = useCallback((next: Project) => {
    setProject((prev) => (next.updatedAt >= prev.updatedAt ? next : prev));
  }, []);

  const notify = useCallback((msg: string, tone: "error" | "info" = "info") => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 7000 : 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.getProject(initial.id));
    } catch {
      /* offline for a moment; the next poll will retry */
    }
  }, [apply, initial.id]);

  const busy = somethingRunning(project);
  useEffect(() => {
    const t = setInterval(refresh, busy ? 1500 : 10_000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  const op = useCallback(
    async (o: Op) => {
      try {
        apply(await api.op(initial.id, o));
      } catch (e) {
        notify((e as Error).message, "error");
      }
    },
    [apply, initial.id, notify],
  );

  const generate = useCallback(
    async (kind: GenKind, targets: ItemRef[]) => {
      try {
        const res = await api.generate(initial.id, kind, targets);
        apply(res.project);
        if (res.errors.length) notify(res.errors.join("; "), "error");
      } catch (e) {
        notify((e as Error).message, "error");
      }
    },
    [apply, initial.id, notify],
  );

  const ctx: StudioApi = useMemo(
    () => ({ project, status, op, generate, selected, select, setTab, notify, refresh, apply }),
    [project, status, op, generate, selected, notify, refresh, apply],
  );

  return (
    <StudioContext.Provider value={ctx}>
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar tab={tab} />
        <div className="relative min-h-0 flex-1">
          {tab === "script" && <ScriptTab />}
          {tab === "canvas" && <CanvasTab />}
          {tab === "storyboard" && <StoryboardTab />}
          {tab === "preview" && <PreviewTab />}
        </div>
        {toast && (
          <div
            className={`fixed bottom-5 left-1/2 z-50 max-w-xl -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-2xl ${
              toast.tone === "error" ? "border-red-800 bg-red-950/95 text-red-200" : "border-ink-600 bg-ink-800/95 text-ink-100"
            }`}
            role="status"
          >
            {toast.msg}
          </div>
        )}
      </div>
    </StudioContext.Provider>
  );
}
