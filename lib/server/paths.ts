import path from "node:path";
import { randomUUID } from "node:crypto";

export const DATA_DIR = path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const DB_FILE = path.join(DATA_DIR, "db.json");

export function projectMediaDir(projectId: string) {
  return path.join(MEDIA_DIR, projectId);
}

/** Resolve a media-relative path to an absolute one, refusing anything outside data/media. */
export function mediaAbs(rel: string) {
  const abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR + path.sep)) throw new Error("Invalid media path");
  return abs;
}

/** Absolute path -> forward-slash path relative to data/media (what MediaRef.file stores). */
export function mediaRel(abs: string) {
  return path.relative(MEDIA_DIR, abs).split(path.sep).join("/");
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export const nowIso = () => new Date().toISOString();
