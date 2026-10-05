// Validates the request bodies this app sends to fal.ai against fal's published
// OpenAPI schemas, without spending anything. Run: npx tsx scripts/check-fal-schemas.ts
import { MODELS, pickDuration } from "../lib/models";
import { imageSize, videoInput } from "../lib/server/providers/fal";
import type { AspectRatio } from "../lib/types";

type Schema = {
  type?: string;
  enum?: unknown[];
  anyOf?: Schema[];
  $ref?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
};

async function inputSchema(endpoint: string) {
  const res = await fetch(`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${endpoint}`);
  if (!res.ok) throw new Error(`schema ${endpoint}: HTTP ${res.status}`);
  const doc = (await res.json()) as { components: { schemas: Record<string, Schema> } };
  const all = doc.components.schemas;
  const name = Object.keys(all).find((k) => k.endsWith("Input"));
  if (!name) throw new Error(`no Input schema for ${endpoint}`);
  return { root: all[name], all };
}

function check(value: unknown, s: Schema, all: Record<string, Schema>, path: string, errors: string[]) {
  if (s.$ref) s = all[s.$ref.split("/").pop()!];
  if (s.anyOf) {
    const ok = s.anyOf.some((alt) => {
      const e: string[] = [];
      check(value, alt, all, path, e);
      return e.length === 0;
    });
    if (!ok) errors.push(`${path}: ${JSON.stringify(value)} matches none of the allowed shapes`);
    return;
  }
  if (s.enum && !s.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(s.enum)}`);
  const t = s.type;
  if (t === "string" && typeof value !== "string") errors.push(`${path}: expected string`);
  if (t === "integer" && !Number.isInteger(value)) errors.push(`${path}: expected integer`);
  if (t === "number" && typeof value !== "number") errors.push(`${path}: expected number`);
  if (t === "boolean" && typeof value !== "boolean") errors.push(`${path}: expected boolean`);
  if (t === "array") {
    if (!Array.isArray(value)) errors.push(`${path}: expected array`);
    else if (s.items) value.forEach((v, i) => check(v, s.items!, all, `${path}[${i}]`, errors));
  }
  if (t === "object" || s.properties) {
    if (typeof value !== "object" || value === null) return errors.push(`${path}: expected object`);
    const obj = value as Record<string, unknown>;
    for (const r of s.required ?? []) if (!(r in obj)) errors.push(`${path}.${r}: required but missing`);
    for (const [k, v] of Object.entries(obj)) {
      const prop = s.properties?.[k];
      if (!prop) errors.push(`${path}.${k}: unknown field`);
      else check(v, prop, all, `${path}.${k}`, errors);
    }
  }
}

async function main() {
  let failures = 0;
  const ratios: AspectRatio[] = ["9:16", "16:9", "1:1"];
  for (const m of MODELS.filter((x) => x.provider === "fal")) {
    const cases: { endpoint: string; input: Record<string, unknown> }[] = [];
    if (m.kind === "video") {
      for (const ar of ratios) {
        for (const want of [3, 6, 11, 20]) {
          const seconds = pickDuration(m, want);
          for (const audio of [true, false]) {
            cases.push({ endpoint: m.endpoint!, input: videoInput(m, { prompt: "test", imageUrl: "https://example.com/a.jpg", seconds, ar, audio }) });
          }
        }
      }
    } else if (m.kind === "image") {
      for (const ar of ratios) {
        const base = { prompt: "test", image_size: imageSize(ar), output_format: "jpeg", num_images: 1 };
        cases.push({ endpoint: m.endpoint!, input: base });
        cases.push({ endpoint: m.editEndpoint!, input: { ...base, image_urls: ["https://example.com/a.jpg"] } });
      }
    } else {
      cases.push({ endpoint: m.endpoint!, input: { text: "Hello there.", voice: "Rachel" } });
    }
    const schemas = new Map<string, Awaited<ReturnType<typeof inputSchema>>>();
    const problems = new Set<string>();
    for (const c of cases) {
      if (!schemas.has(c.endpoint)) schemas.set(c.endpoint, await inputSchema(c.endpoint));
      const { root, all } = schemas.get(c.endpoint)!;
      const errors: string[] = [];
      check(c.input, root, all, "input", errors);
      errors.forEach((e) => problems.add(`${c.endpoint}: ${e}`));
    }
    failures += problems.size;
    console.log(`${problems.size ? "FAIL" : "ok  "} ${m.key.padEnd(22)} ${cases.length} request shapes`);
    problems.forEach((p) => console.log(`       ${p}`));
  }
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
