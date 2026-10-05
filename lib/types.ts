// Shared domain types (safe to import from client and server code).

export type AspectRatio = "9:16" | "16:9" | "1:1";
export type AudioMode = "native" | "dub";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type GenKind = "image" | "video" | "audio";
export type ProviderId = "mock" | "fal" | "ark";
export type LlmEngine = "claude" | "ark" | "rules";

/** A generated file stored under data/media. */
export interface MediaRef {
  /** Path relative to data/media, forward slashes. */
  file: string;
  mime: string;
  /** Model key from lib/models.ts that produced it. */
  model: string;
  /** Public URL at the provider (e.g. fal storage) reused as input for later steps. */
  remoteUrl?: string;
  /** Seconds, for video/audio. */
  duration?: number;
  /** Subtitle cues relative to the start of this audio file. */
  cues?: { start: number; end: number; speaker: string; text: string }[];
  costUsd?: number;
  createdAt: string;
}

export interface JobState {
  id: string;
  kind: GenKind;
  model: string;
  status: JobStatus;
  /** Provider request / task id, used to resume polling after a restart. */
  remoteId?: string;
  /** fal endpoint id or Ark model id the request was sent to. */
  endpoint?: string;
  error?: string;
  estCostUsd?: number;
  startedAt: string;
  finishedAt?: string;
}

export interface Character {
  id: string;
  name: string;
  gender: "male" | "female" | "other";
  /** Visual identity used in every prompt: age, face, hair, build, outfit. */
  description: string;
  /** Optional TTS voice name override. */
  voice?: string;
  image?: MediaRef;
  job?: JobState;
}

export interface DialogueLine {
  /** Character name, or "Narrator". */
  speaker: string;
  line: string;
}

export interface Shot {
  id: string;
  /** Target length in seconds. */
  duration: number;
  shotType: string;
  camera: string;
  location: string;
  /** Character ids that appear in the frame. */
  characters: string[];
  action: string;
  dialogue: DialogueLine[];
  /** Describes the first frame as a still image. */
  imagePrompt: string;
  /** Describes what moves during the clip. */
  motionPrompt: string;
  keyframe?: MediaRef;
  video?: MediaRef;
  audio?: MediaRef;
  /** image = keyframe job, video = clip job, audio = voice job. */
  jobs: Partial<Record<GenKind, JobState>>;
}

export interface ProjectModels {
  image: string;
  video: string;
  tts: string;
}

export interface TaskState {
  status: JobStatus;
  detail?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface Project {
  id: string;
  title: string;
  logline: string;
  /** Global visual style appended to every image/video prompt. */
  style: string;
  aspectRatio: AspectRatio;
  audioMode: AudioMode;
  subtitles: boolean;
  script: string;
  characters: Character[];
  shots: Shot[];
  models: ProjectModels;
  breakdown?: TaskState & { engine?: LlmEngine };
  pipeline?: TaskState & { stage?: string };
  export?: TaskState & { file?: string };
  /** Saved canvas node positions. */
  canvas?: Record<string, { x: number; y: number }>;
  spendUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface DB {
  version: 1;
  projects: Record<string, Project>;
}

/** What the server can currently do; sent to the browser (never contains keys). */
export interface ProviderStatus {
  fal: boolean;
  ark: boolean;
  anthropic: boolean;
  llm: LlmEngine;
  ffmpeg: boolean;
  windowsVoices: boolean;
}
