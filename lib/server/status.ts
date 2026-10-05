import type { LlmEngine, ProviderStatus } from "../types";
import { ffmpegAvailable } from "./ffmpeg";

export async function providerStatus(): Promise<ProviderStatus> {
  const anthropic = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const fal = !!process.env.FAL_KEY;
  const ark = !!process.env.ARK_API_KEY;
  const pref = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  const llm: LlmEngine =
    pref === "claude" || pref === "ark" || pref === "rules"
      ? (pref as LlmEngine)
      : anthropic
        ? "claude"
        : ark
          ? "ark"
          : "rules";
  return { fal, ark, anthropic, llm, ffmpeg: await ffmpegAvailable(), windowsVoices: process.platform === "win32" };
}
