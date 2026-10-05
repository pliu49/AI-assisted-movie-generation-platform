import { z } from "zod";

// The shot list an LLM (or the rule-based splitter) produces from a script.

export const BreakdownSchema = z.object({
  title: z.string().default(""),
  logline: z.string().default(""),
  style: z.string().default(""),
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        gender: z.enum(["male", "female", "other"]).catch("other"),
        description: z.string().default(""),
      }),
    )
    .default([]),
  shots: z
    .array(
      z.object({
        duration: z.coerce.number().catch(5),
        shot_type: z.string().default("Medium shot"),
        camera: z.string().default("static"),
        location: z.string().default(""),
        characters: z.array(z.string()).default([]),
        action: z.string().default(""),
        dialogue: z.array(z.object({ speaker: z.string(), line: z.string() })).default([]),
        image_prompt: z.string().default(""),
        motion_prompt: z.string().default(""),
      }),
    )
    .min(1, "The breakdown contained no shots"),
});

export type Breakdown = z.infer<typeof BreakdownSchema>;

// JSON Schema for Claude structured outputs (every object closed, every field required).
const str = { type: "string" } as const;
export const BREAKDOWN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "logline", "style", "characters", "shots"],
  properties: {
    title: str,
    logline: str,
    style: str,
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "gender", "description"],
        properties: {
          name: str,
          gender: { type: "string", enum: ["male", "female", "other"] },
          description: str,
        },
      },
    },
    shots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "duration",
          "shot_type",
          "camera",
          "location",
          "characters",
          "action",
          "dialogue",
          "image_prompt",
          "motion_prompt",
        ],
        properties: {
          duration: { type: "integer" },
          shot_type: str,
          camera: str,
          location: str,
          characters: { type: "array", items: str },
          action: str,
          dialogue: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["speaker", "line"],
              properties: { speaker: str, line: str },
            },
          },
          image_prompt: str,
          motion_prompt: str,
        },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You are the showrunner and storyboard artist of a studio that makes AI-generated short dramas: vertical 1-3 minute episodes for apps like ReelShort and TikTok.

Turn the user's script, outline or one-line idea into a production-ready shot list. Every shot will be produced in two steps: an image model draws its first frame, then an image-to-video model animates that frame for 4-15 seconds. Write for those models.

Characters
- List every person who appears on screen more than once.
- "description" is the character's fixed visual identity, reused verbatim in every prompt so they look the same in every shot: apparent age, ethnicity only if the script states it, face, hair, build, and one signature outfit with colors. Visual facts only, no personality.

Shots
- 3-15 seconds each (most 4-8). One clear action per shot.
- Short-drama pacing: hook in the first shot, frequent close-ups for reactions and dialogue, end on a cliffhanger or emotional beat.
- "dialogue": spoken lines in this shot, in the script's language. Keep a line short enough to say within the shot (about 2.5 words or 4 Chinese characters per second). Use the character's exact name as speaker, or "Narrator" for voice-over.
- "characters": exact names of the characters visible in the frame.
- "image_prompt": the first frame as a still photograph: who is where, pose, expression, composition, setting, lighting, lens. Refer to characters by name. No camera motion, no dialogue, no text on screen.
- "motion_prompt": what moves during the clip: the action, expression change, and at most one simple camera move. Physically plausible.
- "camera": short camera direction such as "slow push in", "static", "pan right", "handheld follow".
- "shot_type": e.g. "Extreme close-up", "Close-up", "Medium shot", "Wide shot".
- Write image_prompt and motion_prompt in English, whatever the script language; video models follow English best.

"style": one line describing the visual style (medium, look, lighting, color grade). If the user gives a style, use it; otherwise choose one that suits the story.
"title" and "logline": short, in the script's language.`;
