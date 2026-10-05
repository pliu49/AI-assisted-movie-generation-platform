// Offline fallback when no LLM key is configured. Understands a simple screenplay format:
//   INT./EXT. or "场景" lines set the location,
//   "NAME: line" / "NAME（情绪）：台词" lines become dialogue close-ups,
//   everything else becomes an action shot.
// Descriptions stay as placeholders; an LLM does a much better job, this just gets you moving.
import type { Breakdown } from "./schema";

const CJK = /[㐀-鿿]/g;

function speechSeconds(text: string) {
  const cjk = (text.match(CJK) ?? []).length;
  const words = text.replace(CJK, " ").split(/\s+/).filter(Boolean).length;
  return cjk / 4 + words / 2.6;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tidyName(raw: string) {
  const name = raw.trim().replace(/\s+/g, " ");
  // "MARCUS" / "MR. HALE" -> "Marcus" / "Mr. Hale"
  if (/^[A-Z0-9 .'-]+$/.test(name)) return name.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return name;
}

/** Guess from narrative lines only: pronouns inside a character's own dialogue usually mean someone else. */
function guessGender(narrative: string, name: string): "male" | "female" | "other" {
  const near = narrative
    .split(/[\n。.!?！？]/)
    .filter((s) => s.toLowerCase().includes(name.toLowerCase()))
    .join(" ")
    .toLowerCase();
  if (/^(mr|sir|king|prince|lord)\b/i.test(name)) return "male";
  if (/^(mrs|ms|miss|queen|princess|lady)\b/i.test(name)) return "female";
  const male = (near.match(/\b(he|him|his|man|boy|father|husband|brother|son|groom)\b|他|先生|男|丈夫|父亲|爸/g) ?? []).length;
  const female = (near.match(/\b(she|her|hers|woman|girl|mother|wife|sister|daughter|bride|gown|dress)\b|她|女士|小姐|女|妻|母亲|妈|新娘|婚纱|裙/g) ?? []).length;
  if (male > female) return "male";
  if (female > male) return "female";
  return "other";
}

const NOT_SPEAKERS = /^(note|notes|title|scene|int|ext|fade in|fade out|cut to|标题|场景|备注)$/i;
const FUNCTION_WORDS = /\b(the|a|an|that|this|at|in|on|of|to|when|then|later|after|before|meanwhile)\b/i;

function looksLikeSpeaker(raw: string) {
  const name = raw.trim();
  if (NOT_SPEAKERS.test(name)) return false;
  if (/[一-鿿]/.test(name)) return name.length <= 8;
  return name.split(/\s+/).length <= 3 && !FUNCTION_WORDS.test(name);
}

export function breakdownWithRules(script: string): Breakdown {
  const lines = script.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let title = "";
  let location = "";
  const speakers = new Map<string, string>();
  const shots: Breakdown["shots"] = [];
  const narrative: string[] = [];

  for (const raw of lines) {
    if (/^#\s+/.test(raw)) {
      title ||= raw.replace(/^#+\s*/, "");
      continue;
    }
    const titleMatch = raw.match(/^(?:title|标题)\s*[:：]\s*(.+)$/i);
    if (titleMatch) {
      title ||= titleMatch[1].trim();
      continue;
    }
    const scene = raw.match(/^(?:(?:INT|EXT|INT\.?\s*\/\s*EXT|I\/E)\b\.?|SCENE\b\s*\d*\s*[:.-]?|场景\s*\d*\s*[:：]?)\s*(.*)$/i);
    if (scene) {
      location = scene[1].replace(/^[\s.\-–—:]+/, "").trim() || location;
      continue;
    }
    const dia = raw.match(
      /^([A-Za-z一-鿿][A-Za-z0-9 .'\-一-鿿]{0,30}?)\s*(?:\(([^)]*)\)|（([^）]*)）)?\s*[:：]\s*(.+)$/,
    );
    if (dia && looksLikeSpeaker(dia[1])) {
      const name = tidyName(dia[1]);
      const mood = (dia[2] || dia[3] || "").trim();
      const line = dia[4].trim().replace(/^["“'「『]+|["”'」』]+$/g, "");
      speakers.set(name.toLowerCase(), name);
      shots.push({
        duration: clamp(Math.ceil(speechSeconds(line) + 1.5), 3, 10),
        shot_type: "Close-up",
        camera: "slow push in",
        location,
        characters: [name],
        action: `${name} speaks${mood ? ` (${mood})` : ""}.`,
        dialogue: [{ speaker: name, line }],
        image_prompt: `Close-up of ${name}${mood ? `, ${mood}` : ""}, expressive face, shallow depth of field${location ? `, ${location}` : ""}`,
        motion_prompt: `${name} speaks${mood ? ` ${mood}` : ""} with subtle facial expressions and small head movements`,
      });
      continue;
    }
    narrative.push(raw);
    shots.push({
      duration: clamp(Math.round(speechSeconds(raw) / 1.6 + 3), 3, 8),
      shot_type: "Medium wide shot",
      camera: "slow push in",
      location,
      characters: [],
      action: raw,
      dialogue: [],
      image_prompt: raw,
      motion_prompt: raw,
    });
  }

  const names = [...speakers.values()];
  for (const s of shots) {
    if (s.dialogue.length) continue;
    s.characters = names.filter((n) => new RegExp(`(^|[^\\w])${escapeRe(n)}([^\\w]|$)`, "i").test(s.action));
  }
  return {
    title,
    logline: "",
    style: "",
    characters: names.map((name) => {
      const gender = guessGender(narrative.join("\n"), name);
      const who = gender === "male" ? "a man" : gender === "female" ? "a woman" : "a person";
      return { name, gender, description: `${who}; add age, face, hair and outfit details here` };
    }),
    shots,
  };
}
