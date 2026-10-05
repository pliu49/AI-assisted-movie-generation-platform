// Volcengine Ark (火山方舟) / BytePlus ModelArk: ByteDance's own hosting for
// Seedance (video), Seedream (image) and Doubao (LLM). Plain REST, bearer key.
import type { AspectRatio } from "../../types";
import type { ModelDef } from "../../models";
import type { CheckResult } from "./common";

function base() {
  return (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
}

async function ark<T>(path: string, body?: unknown): Promise<T> {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error("ARK_API_KEY is not set. Add it to .env.local and restart the server.");
  const res = await fetch(base() + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } } | undefined)?.error?.message ?? text.slice(0, 300);
    if (res.status === 401) throw new Error(`Ark authentication failed. Check ARK_API_KEY. (${msg})`);
    throw new Error(`Ark error ${res.status}: ${msg}`);
  }
  return json as T;
}

/** Model ids can be overridden per deployment (BytePlus uses different names). */
export function modelId(model: ModelDef) {
  const override: Record<string, string | undefined> = {
    "ark-seedance-2": process.env.ARK_VIDEO_MODEL,
    "ark-seedance-2-fast": process.env.ARK_VIDEO_FAST_MODEL,
    "ark-seedream-5": process.env.ARK_IMAGE_MODEL,
  };
  return override[model.key] || model.endpoint!;
}

export function imageSize(ar: AspectRatio) {
  if (ar === "16:9") return "2560x1440";
  if (ar === "1:1") return "2048x2048";
  return "1440x2560";
}

/** Seedream text-to-image, or multi-reference editing when `refs` are given (data URIs or URLs). */
export async function generateImage(model: string, prompt: string, refs: string[], size: string) {
  const body: Record<string, unknown> = {
    model,
    prompt,
    size,
    response_format: "url",
    watermark: false,
    sequential_image_generation: "disabled",
  };
  if (refs.length) body.image = refs.length === 1 ? refs[0] : refs;
  const res = await ark<{ data?: { url?: string }[] }>("/images/generations", body);
  const url = res.data?.[0]?.url;
  if (!url) throw new Error("Ark returned no image");
  return url;
}

export async function submitVideo(
  model: string,
  prompt: string,
  firstFrame: string,
  opts: { ar: AspectRatio; seconds: number; audio: boolean },
) {
  const res = await ark<{ id: string }>("/contents/generations/tasks", {
    model,
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: firstFrame }, role: "first_frame" },
    ],
    ratio: opts.ar,
    duration: opts.seconds,
    resolution: "720p",
    generate_audio: opts.audio,
    watermark: false,
  });
  return res.id;
}

export async function checkVideo(taskId: string): Promise<CheckResult> {
  const task = await ark<{ status: string; content?: { video_url?: string }; error?: { message?: string } }>(
    `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
  );
  if (task.status === "succeeded") {
    return task.content?.video_url
      ? { state: "done", url: task.content.video_url }
      : { state: "failed", error: "Ark returned no video URL" };
  }
  if (["failed", "expired", "cancelled"].includes(task.status)) {
    return { state: "failed", error: `Ark task ${task.status}${task.error?.message ? `: ${task.error.message}` : ""}` };
  }
  return { state: "pending", detail: task.status };
}

/** Doubao chat completion (OpenAI-compatible shape). */
export async function chat(system: string, user: string) {
  const res = await ark<{ choices?: { message?: { content?: string } }[] }>("/chat/completions", {
    model: process.env.ARK_LLM_MODEL || "doubao-seed-2-0-lite-260215",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices?.[0]?.message?.content ?? "";
}
