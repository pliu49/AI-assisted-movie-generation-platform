// fal.ai: one API key, many models, all behind the same async queue:
//   submit(endpoint, input) -> request_id -> poll status -> fetch result (file URLs).
import { ApiError, createFalClient, ValidationError, type FalClient } from "@fal-ai/client";
import type { AspectRatio } from "../../types";
import type { ModelDef } from "../../models";
import { jpegForUpload, pollUntilDone, type CheckResult } from "./common";

let client: FalClient | null = null;

function fal() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set. Add it to .env.local and restart the server.");
  client ??= createFalClient({ credentials: key });
  return client;
}

export function falErrorMessage(err: unknown): string {
  if (err instanceof ValidationError) {
    const fields = err.fieldErrors.map((f) => `${f.loc.slice(1).join(".") || "input"}: ${f.msg}`).join("; ");
    return `fal rejected the request (${err.status})${fields ? `: ${fields}` : ""}`;
  }
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | undefined;
    const detail = typeof body?.detail === "string" ? body.detail : body?.detail ? JSON.stringify(body.detail) : err.message;
    if (err.status === 401 || err.status === 403) return `fal authentication failed (${err.status}). Check FAL_KEY.`;
    return `fal error ${err.status}: ${detail}`.slice(0, 500);
  }
  return err instanceof Error ? err.message : String(err);
}

/** Upload a local image to fal storage and return its public URL. */
export async function uploadImage(abs: string) {
  const buf = await jpegForUpload(abs);
  return fal().storage.upload(new Blob([new Uint8Array(buf)], { type: "image/jpeg" }));
}

export async function submit(endpoint: string, input: Record<string, unknown>) {
  try {
    const res = await fal().queue.submit(endpoint, { input });
    return res.request_id;
  } catch (err) {
    throw new Error(falErrorMessage(err));
  }
}

function outputUrl(data: unknown): string | undefined {
  const d = data as {
    video?: { url?: string };
    images?: { url?: string }[];
    image?: { url?: string };
    audio?: { url?: string };
    audio_url?: string | { url?: string };
  };
  return (
    d?.video?.url ??
    d?.images?.[0]?.url ??
    d?.image?.url ??
    d?.audio?.url ??
    (typeof d?.audio_url === "string" ? d.audio_url : d?.audio_url?.url)
  );
}

export async function check(endpoint: string, requestId: string): Promise<CheckResult> {
  const status = await fal().queue.status(endpoint, { requestId, logs: false });
  if (status.status === "IN_QUEUE") return { state: "pending", detail: `queue position ${status.queue_position}` };
  if (status.status === "IN_PROGRESS") return { state: "pending", detail: "generating" };
  try {
    const result = await fal().queue.result(endpoint, { requestId });
    const url = outputUrl(result.data);
    return url ? { state: "done", url } : { state: "failed", error: "fal returned no file URL" };
  } catch (err) {
    return { state: "failed", error: falErrorMessage(err) };
  }
}

/** Submit and wait (used for short jobs such as TTS lines). */
export async function run(endpoint: string, input: Record<string, unknown>) {
  const requestId = await submit(endpoint, input);
  return pollUntilDone(() => check(endpoint, requestId), 10 * 60_000);
}

export function imageSize(ar: AspectRatio) {
  // <= 1536x1536 total pixels keeps Seedream 5 Pro in its cheaper price tier.
  if (ar === "16:9") return { width: 2048, height: 1152 };
  if (ar === "1:1") return { width: 1536, height: 1536 };
  return { width: 1152, height: 2048 };
}

/** Each video model names its inputs differently; map our generic request onto it. */
export function videoInput(
  model: ModelDef,
  req: { prompt: string; imageUrl: string; seconds: number; ar: AspectRatio; audio: boolean },
): Record<string, unknown> {
  switch (model.inputStyle) {
    case "seedance":
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: String(req.seconds),
        aspect_ratio: req.ar,
        resolution: "720p",
        generate_audio: req.audio,
      };
    case "kling":
      return {
        prompt: req.prompt,
        start_image_url: req.imageUrl,
        duration: String(req.seconds),
        generate_audio: req.audio,
        negative_prompt: "blur, distortion, low quality, subtitles, captions, on-screen text",
      };
    case "veo":
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: `${req.seconds}s`,
        aspect_ratio: req.ar === "1:1" ? "auto" : req.ar,
        resolution: "720p",
        generate_audio: req.audio,
      };
    case "wan":
      return {
        prompt: req.prompt,
        start_image_url: req.imageUrl,
        duration: req.seconds,
        aspect_ratio: req.ar,
        resolution: "720p",
        audio: req.audio,
      };
    default:
      throw new Error(`${model.label} is not a fal video model`);
  }
}

/** ElevenLabs premade voices, picked per character when no voice is set. */
export const ELEVEN_VOICES = {
  female: ["Rachel", "Sarah", "Laura", "Charlotte", "Alice", "Matilda", "Jessica", "Lily"],
  male: ["Roger", "George", "Callum", "Liam", "Will", "Eric", "Chris", "Brian", "Daniel", "Bill"],
  other: ["River", "Aria"],
};
