import * as ark from "../providers/ark";
import { BREAKDOWN_JSON_SCHEMA, BreakdownSchema, SYSTEM_PROMPT, type Breakdown } from "./schema";

/** Doubao on Volcengine Ark, for deployments in mainland China. */
export async function breakdownWithDoubao(userPrompt: string): Promise<Breakdown> {
  const system = `${SYSTEM_PROMPT}

Reply with a single JSON object and nothing else. It must match this JSON Schema:
${JSON.stringify(BREAKDOWN_JSON_SCHEMA)}`;
  const text = await ark.chat(system, userPrompt);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Doubao did not return JSON. Try again.");
  return BreakdownSchema.parse(JSON.parse(text.slice(start, end + 1)));
}
