// Model catalog shared by the browser (pickers, cost estimates) and the server (routing).
// Prices are list prices in USD as published by the providers in Sept 2026; they change
// often, so treat them as estimates and check the provider pricing pages before launch.

import type { GenKind, Project, ProviderId, ProviderStatus, Shot } from "./types";

export type VideoInputStyle = "seedance" | "kling" | "veo" | "wan" | "ark-seedance" | "mock";

export interface ModelDef {
  key: string;
  kind: GenKind;
  provider: ProviderId;
  label: string;
  note?: string;
  /** fal endpoint id or Ark model id. For images this is the text-to-image endpoint. */
  endpoint?: string;
  /** Image models: endpoint used when reference images are supplied. */
  editEndpoint?: string;
  /** Video models: how the request body is shaped. */
  inputStyle?: VideoInputStyle;
  /** Video models: allowed clip lengths in seconds. */
  durations?: number[];
  /** Video models: can generate dialogue/sfx audio in the same pass. */
  nativeAudio?: boolean;
  price: {
    perImage?: number;
    perExtraRef?: number;
    perSecond?: number;
    perSecondWithAudio?: number;
    per1kChars?: number;
  };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const MODELS: ModelDef[] = [
  // ---------------- images (character references + shot keyframes)
  {
    key: "mock-image",
    kind: "image",
    provider: "mock",
    label: "Storyboard cards (offline, free)",
    note: "Draws placeholder frames locally so you can test the whole flow without API keys.",
    price: {},
  },
  {
    key: "fal-seedream-5-pro",
    kind: "image",
    provider: "fal",
    label: "Seedream 5.0 Pro · fal",
    note: "Up to 10 reference images for character consistency.",
    endpoint: "bytedance/seedream/v5/pro/text-to-image",
    editEndpoint: "bytedance/seedream/v5/pro/edit",
    price: { perImage: 0.0675, perExtraRef: 0.0045 },
  },
  {
    key: "ark-seedream-5",
    kind: "image",
    provider: "ark",
    label: "Seedream 5.0 Lite · Volcengine Ark",
    note: "China region. Up to 14 reference images.",
    endpoint: "doubao-seedream-5-0-260128",
    price: { perImage: 0.035 },
  },

  // ---------------- video (image-to-video from each shot's keyframe)
  {
    key: "mock-video",
    kind: "video",
    provider: "mock",
    label: "Animatic, Ken Burns (offline, free)",
    note: "Pans and zooms the keyframe with ffmpeg; good for timing and pitching.",
    inputStyle: "mock",
    durations: range(2, 15),
    price: {},
  },
  {
    key: "fal-seedance-2",
    kind: "video",
    provider: "fal",
    label: "Seedance 2.0 · fal",
    note: "Top-ranked image-to-video; native dialogue audio with lip sync.",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    inputStyle: "seedance",
    durations: range(4, 15),
    nativeAudio: true,
    price: { perSecond: 0.3024, perSecondWithAudio: 0.3024 },
  },
  {
    key: "fal-seedance-2-fast",
    kind: "video",
    provider: "fal",
    label: "Seedance 2.0 Fast · fal",
    endpoint: "bytedance/seedance-2.0/fast/image-to-video",
    inputStyle: "seedance",
    durations: range(4, 15),
    nativeAudio: true,
    price: { perSecond: 0.2419, perSecondWithAudio: 0.2419 },
  },
  {
    key: "fal-kling-3-pro",
    kind: "video",
    provider: "fal",
    label: "Kling 3.0 Pro · fal",
    note: "Strong character consistency; audio costs extra.",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    inputStyle: "kling",
    durations: range(3, 15),
    nativeAudio: true,
    price: { perSecond: 0.112, perSecondWithAudio: 0.168 },
  },
  {
    key: "fal-veo-3.1-fast",
    kind: "video",
    provider: "fal",
    label: "Veo 3.1 Fast · fal",
    note: "4, 6 or 8 second clips; 16:9 or 9:16.",
    endpoint: "fal-ai/veo3.1/fast/image-to-video",
    inputStyle: "veo",
    durations: [4, 6, 8],
    nativeAudio: true,
    price: { perSecond: 0.1, perSecondWithAudio: 0.15 },
  },
  {
    key: "fal-wan-3",
    kind: "video",
    provider: "fal",
    label: "Wan 3.0 · fal (720p)",
    note: "Cheapest real model here.",
    endpoint: "alibaba/wan-3.0/image-to-video",
    inputStyle: "wan",
    durations: [5, 10, 15],
    nativeAudio: true,
    price: { perSecond: 0.1, perSecondWithAudio: 0.1 },
  },
  {
    key: "ark-seedance-2",
    kind: "video",
    provider: "ark",
    label: "Seedance 2.0 · Volcengine Ark",
    note: "China region, billed per token (price is an estimate for 720p).",
    endpoint: "doubao-seedance-2-0-260128",
    inputStyle: "ark-seedance",
    durations: range(4, 15),
    nativeAudio: true,
    price: { perSecond: 0.06, perSecondWithAudio: 0.06 },
  },
  {
    key: "ark-seedance-2-fast",
    kind: "video",
    provider: "ark",
    label: "Seedance 2.0 Fast · Volcengine Ark",
    endpoint: "doubao-seedance-2-0-fast-260128",
    inputStyle: "ark-seedance",
    durations: range(4, 15),
    nativeAudio: true,
    price: { perSecond: 0.05, perSecondWithAudio: 0.05 },
  },

  // ---------------- voice (dub mode)
  {
    key: "mock-tts",
    kind: "audio",
    provider: "mock",
    label: "System voices (offline, free)",
    note: "Windows built-in voices; silent placeholder audio on other systems.",
    price: {},
  },
  {
    key: "fal-elevenlabs-v3",
    kind: "audio",
    provider: "fal",
    label: "ElevenLabs v3 · fal",
    note: "Expressive voices; supports [whispers], [angry] style tags.",
    endpoint: "fal-ai/elevenlabs/tts/eleven-v3",
    price: { per1kChars: 0.1 },
  },
];

export const DEFAULT_MODELS = { image: "mock-image", video: "mock-video", tts: "mock-tts" };

export function modelByKey(key: string): ModelDef | undefined {
  return MODELS.find((m) => m.key === key);
}

export function modelsFor(kind: GenKind) {
  return MODELS.filter((m) => m.kind === kind);
}

export function providerReady(provider: ProviderId, status: ProviderStatus) {
  return provider === "mock" || status[provider];
}

/** Snap a requested length to the closest length the model accepts. */
export function pickDuration(model: ModelDef, seconds: number) {
  const options = model.durations ?? [Math.round(seconds)];
  return options.reduce((best, d) => (Math.abs(d - seconds) < Math.abs(best - seconds) ? d : best), options[0]);
}

export function projectModelKey(project: Project, kind: GenKind) {
  return kind === "image" ? project.models.image : kind === "video" ? project.models.video : project.models.tts;
}

export function dialogueChars(shot: Shot) {
  return shot.dialogue.reduce((n, d) => n + d.line.length, 0);
}

/** Estimated USD cost of one generation. */
export function estimateCost(model: ModelDef, opts: { seconds?: number; audio?: boolean; refs?: number; chars?: number }) {
  const p = model.price;
  if (model.kind === "image") return (p.perImage ?? 0) + (p.perExtraRef ?? 0) * Math.max(0, (opts.refs ?? 0) - 1);
  if (model.kind === "video") {
    const rate = opts.audio ? (p.perSecondWithAudio ?? p.perSecond ?? 0) : (p.perSecond ?? 0);
    return rate * pickDuration(model, opts.seconds ?? 5);
  }
  return ((p.per1kChars ?? 0) * (opts.chars ?? 0)) / 1000;
}

export function priceLabel(model: ModelDef) {
  const p = model.price;
  if (model.provider === "mock") return "free";
  if (p.perImage) return `$${p.perImage.toFixed(3)}/image`;
  if (p.perSecond) return `$${(p.perSecondWithAudio ?? p.perSecond).toFixed(2)}/s`;
  if (p.per1kChars) return `$${p.per1kChars.toFixed(2)}/1k chars`;
  return "";
}

export function formatUsd(n: number) {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
