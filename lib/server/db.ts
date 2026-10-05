import fs from "node:fs/promises";
import type { DB, Project } from "../types";
import { DATA_DIR, DB_FILE, nowIso } from "./paths";

// A single JSON file is plenty for a local studio. Every read and write goes through
// one promise chain so concurrent job completions never overwrite each other.
// State lives on globalThis because Next.js may load this module once per route bundle.
type Store = { db: DB | null; chain: Promise<unknown> };
const g = globalThis as unknown as { __dramaStore?: Store };
const store: Store = (g.__dramaStore ??= { db: null, chain: Promise.resolve() });

export class NotFoundError extends Error {}

async function load(): Promise<DB> {
  if (store.db) return store.db;
  try {
    store.db = JSON.parse(await fs.readFile(DB_FILE, "utf8")) as DB;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    store.db = { version: 1, projects: {} };
  }
  return store.db;
}

async function persist(db: DB) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  // Windows can briefly lock the target (antivirus, indexer); retry the swap a few times.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, DB_FILE);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw err;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = store.chain.then(fn, fn);
  store.chain = run.catch(() => undefined);
  return run;
}

export function getProject(id: string): Promise<Project | null> {
  return serialize(async () => {
    const p = (await load()).projects[id];
    return p ? structuredClone(p) : null;
  });
}

export function listProjects(): Promise<Project[]> {
  return serialize(async () =>
    Object.values((await load()).projects)
      .map((p) => structuredClone(p))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}

export function insertProject(project: Project): Promise<Project> {
  return serialize(async () => {
    const db = await load();
    db.projects[project.id] = project;
    await persist(db);
    return structuredClone(project);
  });
}

/** Apply a change to one project atomically. Throws NotFoundError if it doesn't exist. */
export function mutateProject<T>(id: string, fn: (p: Project) => T): Promise<T> {
  return serialize(async () => {
    const db = await load();
    const current = db.projects[id];
    if (!current) throw new NotFoundError(`Project ${id} not found`);
    // Work on a copy so a throwing mutation leaves the stored project untouched.
    const draft = structuredClone(current);
    const result = fn(draft);
    draft.updatedAt = nowIso();
    db.projects[id] = draft;
    await persist(db);
    return result === undefined ? result : structuredClone(result);
  });
}

export function removeProject(id: string): Promise<boolean> {
  return serialize(async () => {
    const db = await load();
    if (!db.projects[id]) return false;
    delete db.projects[id];
    await persist(db);
    return true;
  });
}
