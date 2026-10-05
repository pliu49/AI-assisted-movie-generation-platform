"use client";

import { Button } from "../ui";
import { BatchBar } from "./BatchBar";
import { useStudio } from "./context";
import { CharacterEditor, ShotEditor } from "./editors";

export function StoryboardTab() {
  const { project, op, setTab } = useStudio();
  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-800 bg-ink-900/90 px-5 py-2 backdrop-blur">
        <BatchBar />
        <Button className="!py-1 text-xs" onClick={() => op({ op: "addShot" })}>
          + Shot
        </Button>
      </div>
      <div className="mx-auto max-w-6xl space-y-6 p-5">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Cast</h2>
            <Button variant="ghost" className="!py-0.5 text-xs" onClick={() => op({ op: "addCharacter" })}>
              + Character
            </Button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {project.characters.map((c) => (
              <CharacterEditor key={c.id} character={c} compact />
            ))}
            {!project.characters.length && <p className="text-sm text-ink-400">No characters yet.</p>}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            Shots <span className="font-normal text-ink-400">· {project.shots.reduce((s, x) => s + x.duration, 0)}s total</span>
          </h2>
          {project.shots.map((s, i) => (
            <ShotEditor key={s.id} shot={s} index={i} layout="row" />
          ))}
          {!project.shots.length && (
            <div className="rounded-2xl border border-dashed border-ink-600 p-8 text-center text-sm text-ink-300">
              No shots yet.{" "}
              <button className="text-cyan-300 hover:underline" onClick={() => setTab("script")}>
                Break the script into shots
              </button>{" "}
              or add one by hand.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
