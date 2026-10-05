import { AppHeader } from "@/components/AppHeader";
import { MODELS, priceLabel, type ModelDef } from "@/lib/models";
import { providerStatus } from "@/lib/server/status";

export const dynamic = "force-dynamic";

const KIND_TITLE = { image: "Image models (character refs + keyframes)", video: "Video models (image-to-video)", audio: "Voice models (dub mode)" };

function Row({ m, ready }: { m: ModelDef; ready: boolean }) {
  return (
    <tr className="border-t border-ink-700 align-top">
      <td className="py-2 pr-4">
        <div className="font-medium">{m.label}</div>
        {m.note && <div className="text-xs text-ink-400">{m.note}</div>}
      </td>
      <td className="py-2 pr-4 font-mono text-[11px] text-ink-300">{m.endpoint ?? "local"}</td>
      <td className="py-2 pr-4 text-xs whitespace-nowrap">{priceLabel(m)}</td>
      <td className="py-2 text-xs whitespace-nowrap">
        {ready ? <span className="text-emerald-300">ready</span> : <span className="text-ink-400">needs {m.provider === "fal" ? "FAL_KEY" : "ARK_API_KEY"}</span>}
      </td>
    </tr>
  );
}

export default async function SettingsPage() {
  const status = await providerStatus();
  const ready = (m: ModelDef) => m.provider === "mock" || status[m.provider];
  return (
    <div className="min-h-full">
      <AppHeader status={status} />
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <section>
          <h1 className="text-2xl font-semibold">Models &amp; keys</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-300">
            Keys are read from <code className="rounded bg-ink-800 px-1">.env.local</code> in the project folder and never sent to the browser.
            Copy <code className="rounded bg-ink-800 px-1">.env.example</code> to <code className="rounded bg-ink-800 px-1">.env.local</code>, fill in the
            keys you have, and restart <code className="rounded bg-ink-800 px-1">npm run dev</code>. Everything also works offline with the free placeholder
            models.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { name: "fal.ai", ok: status.fal, env: "FAL_KEY", body: "One key for Seedance 2.0, Kling 3, Veo 3.1, Wan 3.0, Seedream 5 and ElevenLabs. Pay per use, international cards." },
              { name: "Volcengine Ark", ok: status.ark, env: "ARK_API_KEY", body: "ByteDance's own platform (火山方舟): Seedance 2.0, Seedream and Doubao. Mainland China billing; BytePlus for overseas." },
              { name: "Claude", ok: status.anthropic, env: "ANTHROPIC_API_KEY", body: "Breaks scripts into shots, writes character looks and model-ready prompts." },
            ].map((p) => (
              <div key={p.name} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.name}</span>
                  <span className={`text-xs ${p.ok ? "text-emerald-300" : "text-ink-400"}`}>{p.ok ? "connected" : "not set"}</span>
                </div>
                <code className="mt-1 block text-[11px] text-cyan-300">{p.env}</code>
                <p className="mt-2 text-xs leading-relaxed text-ink-300">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-400">
            Script breakdown engine: <span className="text-ink-200">{{ claude: "Claude", ark: "Doubao on Ark", rules: "offline rule-based splitter" }[status.llm]}</span>{" "}
            (override with <code>LLM_PROVIDER</code>). ffmpeg: {status.ffmpeg ? "found" : "missing"}.
          </p>
        </section>

        {(["image", "video", "audio"] as const).map((kind) => (
          <section key={kind}>
            <h2 className="mb-2 text-sm font-semibold">{KIND_TITLE[kind]}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] tracking-wide text-ink-400 uppercase">
                  <th className="pb-1 font-medium">Model</th>
                  <th className="pb-1 font-medium">Endpoint / model id</th>
                  <th className="pb-1 font-medium">List price</th>
                  <th className="pb-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.filter((m) => m.kind === kind).map((m) => (
                  <Row key={m.key} m={m} ready={ready(m)} />
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <p className="text-xs text-ink-400">
          Prices are provider list prices as of September 2026 and change often; the provider bills the real amount. Add or swap models in{" "}
          <code>lib/models.ts</code>.
        </p>
      </main>
    </div>
  );
}
