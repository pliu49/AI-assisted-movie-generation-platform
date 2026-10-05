// In-process bookkeeping for work that outlives a request. Kept on globalThis so every
// Next.js route bundle (and hot reloads in dev) sees the same maps.

class Limiter {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }
  release() {
    const next = this.waiting.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else this.active--;
  }
}

interface Registry {
  /** job id -> promise that settles when the job finishes */
  jobs: Map<string, Promise<void>>;
  /** long tasks such as "breakdown:<projectId>" */
  tasks: Set<string>;
  limiters: Map<string, Limiter>;
}

const g = globalThis as unknown as { __dramaRegistry?: Registry };
export const registry: Registry = (g.__dramaRegistry ??= { jobs: new Map(), tasks: new Set(), limiters: new Map() });

/** Max parallel generations per provider: local ffmpeg work is CPU bound, APIs have rate limits. */
export function limiter(provider: string) {
  let l = registry.limiters.get(provider);
  if (!l) {
    l = new Limiter(provider === "mock" ? 2 : provider === "ark" ? 3 : 4);
    registry.limiters.set(provider, l);
  }
  return l;
}

/** Run a named background task once at a time; returns false if it is already running. */
export function runTask(name: string, fn: () => Promise<void>) {
  if (registry.tasks.has(name)) return false;
  registry.tasks.add(name);
  void fn()
    .catch((err) => console.error(`[task ${name}]`, err))
    .finally(() => registry.tasks.delete(name));
  return true;
}
