// Offline stand-ins so the whole pipeline runs with zero API keys:
//   images -> storyboard cards drawn as SVG and rasterized with sharp
//   video  -> Ken Burns animatic of the keyframe (ffmpeg, see ../ffmpeg.ts)
//   voice  -> Windows built-in speech (System.Speech), silence elsewhere
import sharp from "sharp";
import type { AspectRatio } from "../../types";
import { runProcess, silence } from "../ffmpeg";

export interface CardSpec {
  kicker: string;
  title: string;
  body: string;
  quote?: string;
  figures: string[];
  closeUp: boolean;
  hueKey: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

const isCjk = (s: string) => /[぀-ヿ㐀-鿿가-힯]/.test(s);

function hue(key: string) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 360;
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const tokens = isCjk(text) ? [...text] : text.split(/\s+/);
  const sep = isCjk(text) ? "" : " ";
  const lines: string[] = [];
  let cur = "";
  for (const t of tokens) {
    const next = cur ? cur + sep + t : t;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = t;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/.{0,2}$/, "…");
    return kept;
  }
  return lines;
}

function figure(cx: number, groundY: number, height: number, fill: string, label: string, fontSize: number) {
  const head = height * 0.13;
  const shoulderW = height * 0.34;
  const top = groundY - height;
  const body = `M ${cx - shoulderW / 2} ${groundY}
    L ${cx - shoulderW / 2} ${top + head * 2.9}
    Q ${cx - shoulderW / 2} ${top + head * 2.2} ${cx - shoulderW / 3} ${top + head * 2.15}
    L ${cx + shoulderW / 3} ${top + head * 2.15}
    Q ${cx + shoulderW / 2} ${top + head * 2.2} ${cx + shoulderW / 2} ${top + head * 2.9}
    L ${cx + shoulderW / 2} ${groundY} Z`;
  return `
    <circle cx="${cx}" cy="${top + head}" r="${head}" fill="${fill}"/>
    <path d="${body}" fill="${fill}"/>
    <text x="${cx}" y="${groundY + fontSize * 1.5}" text-anchor="middle" font-size="${fontSize}" fill="#e6edf3" font-weight="600">${esc(label)}</text>`;
}

function cardSvg(spec: CardSpec, w: number, h: number) {
  const s = Math.min(w, h) / 720;
  const landscape = w > h;
  const hh = hue(spec.hueKey);
  const font = "Segoe UI, Microsoft YaHei, Arial, sans-serif";
  const titleLines = wrap(spec.title, Math.floor(w / (24 * s)), 2);
  const bodyLines = wrap(spec.body, Math.floor((w - 96 * s) / (11.5 * s)), landscape ? 3 : 5);
  const quoteLines = spec.quote ? wrap(`“${spec.quote}”`, Math.floor((w - 96 * s) / (12 * s)), 2) : [];
  // Text lives at the top; the lower part stays clear so burned-in subtitles never collide.
  const lineH = 30 * s;
  const titleBottom = (104 + (titleLines.length - 1) * 44) * s;
  const panelY = titleBottom + 26 * s;
  const panelH = (bodyLines.length + quoteLines.length) * lineH + 34 * s;
  const groundY = h * (landscape ? 0.88 : 0.8);
  const figs = spec.figures.slice(0, 4);
  let figuresSvg = "";
  if (spec.closeUp && figs.length) {
    const height = h * (landscape ? 0.62 : 0.55);
    // No name label here: it would sit in the subtitle area.
    figuresSvg = figure(w / 2, groundY + height * 0.25, height, "rgba(8,12,18,0.72)", "", 30 * s);
  } else if (figs.length) {
    const height = h * (landscape ? 0.4 : 0.3);
    figs.forEach((name, i) => {
      const cx = (w / (figs.length + 1)) * (i + 1);
      figuresSvg += figure(cx, groundY - 40 * s, height, "rgba(8,12,18,0.7)", name, 22 * s);
    });
  }
  let ty = panelY + 38 * s;
  const bodySvg = bodyLines
    .map((l) => {
      const t = `<text x="${48 * s}" y="${ty}" font-size="${22 * s}" fill="#d0d7de">${esc(l)}</text>`;
      ty += lineH;
      return t;
    })
    .join("");
  const quoteSvg = quoteLines
    .map((l) => {
      const t = `<text x="${48 * s}" y="${ty}" font-size="${22 * s}" fill="#fcd34d" font-style="italic">${esc(l)}</text>`;
      ty += lineH;
      return t;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${font}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="hsl(${hh},45%,26%)"/>
      <stop offset="1" stop-color="hsl(${(hh + 50) % 360},55%,7%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.35" r="0.7">
      <stop offset="0" stop-color="hsl(${(hh + 20) % 360},70%,60%)" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <rect y="${groundY}" width="${w}" height="${h - groundY}" fill="rgba(0,0,0,0.28)"/>
  ${figuresSvg}
  <text x="${36 * s}" y="${58 * s}" font-size="${18 * s}" letter-spacing="${3 * s}" fill="#7dd3fc" font-weight="700">${esc(spec.kicker.toUpperCase())}</text>
  ${titleLines.map((l, i) => `<text x="${36 * s}" y="${(104 + i * 44) * s}" font-size="${38 * s}" fill="#ffffff" font-weight="700">${esc(l)}</text>`).join("")}
  <rect x="${24 * s}" y="${panelY}" width="${w - 48 * s}" height="${panelH}" rx="${18 * s}" fill="rgba(0,0,0,0.55)"/>
  ${bodySvg}${quoteSvg}
  <text x="${w - 30 * s}" y="${h - 12 * s}" text-anchor="end" font-size="${13 * s}" fill="rgba(255,255,255,0.45)">offline storyboard frame</text>
</svg>`;
}

export function cardSize(ar: AspectRatio) {
  if (ar === "16:9") return { w: 1280, h: 720 };
  if (ar === "1:1") return { w: 1024, h: 1024 };
  return { w: 720, h: 1280 };
}

export async function renderCard(spec: CardSpec, ar: AspectRatio, out: string) {
  const { w, h } = cardSize(ar);
  await sharp(Buffer.from(cardSvg(spec, w, h))).png().toFile(out);
}

/** Speak `text` into a WAV file with a built-in Windows voice. */
export async function speak(text: string, gender: string, outWav: string) {
  if (process.platform !== "win32") {
    const words = text.split(/\s+/).length + [...text].filter((c) => isCjk(c)).length / 2;
    await silence(outWav, Math.max(1.2, words / 2.6 + 0.4));
    return;
  }
  // Text travels through environment variables, so nothing needs shell quoting.
  const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Culture.Name -like ($env:TTS_LANG + '*') }
  $pick = $voices | Where-Object { $_.Gender.ToString() -eq $env:TTS_GENDER } | Select-Object -First 1
  if (-not $pick) { $pick = $voices | Select-Object -First 1 }
  if ($pick) { $s.SelectVoice($pick.Name) }
} catch {}
$s.Rate = 0
$s.SetOutputToWaveFile($env:TTS_OUT)
$s.Speak($env:TTS_TEXT)
$s.Dispose()
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  await runProcess(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    {
      env: {
        ...process.env,
        TTS_TEXT: text,
        TTS_OUT: outWav,
        TTS_LANG: isCjk(text) ? "zh" : "en",
        TTS_GENDER: gender === "female" ? "Female" : gender === "male" ? "Male" : "",
      },
      timeoutMs: 60_000,
    },
  );
}
