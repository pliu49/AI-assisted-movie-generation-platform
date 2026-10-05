import Anthropic from "@anthropic-ai/sdk";
import { BREAKDOWN_JSON_SCHEMA, BreakdownSchema, SYSTEM_PROMPT, type Breakdown } from "./schema";

let client: Anthropic | null = null;

export async function breakdownWithClaude(userPrompt: string): Promise<Breakdown> {
  client ??= new Anthropic();
  try {
    // Streaming keeps long shot lists clear of HTTP timeouts. Structured outputs
    // guarantee the JSON matches the schema. `fallbacks: "default"` lets the API
    // retry on another model server-side if a safety classifier declines the request.
    const stream = client.beta.messages.stream({
      model: process.env.CLAUDE_MODEL || "claude-opus-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: BREAKDOWN_JSON_SCHEMA } },
      messages: [{ role: "user", content: userPrompt }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new Error("Claude declined to break down this script. Try rephrasing the sensitive parts.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new Error("The script is too long for one pass. Split it into episodes and break each down separately.");
    }
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return BreakdownSchema.parse(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("Claude rejected the API key. Check ANTHROPIC_API_KEY.");
    if (err instanceof Anthropic.RateLimitError) throw new Error("Claude rate limit reached. Wait a minute and try again.");
    if (err instanceof Anthropic.APIError) throw new Error(`Claude API error ${err.status ?? ""}: ${err.message}`);
    throw err;
  }
}
