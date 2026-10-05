import { AppHeader } from "@/components/AppHeader";
import { Dashboard } from "@/components/Dashboard";
import { listProjects } from "@/lib/server/db";
import { providerStatus } from "@/lib/server/status";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Script", body: "Paste a script or a one-line idea." },
  { title: "Shot list", body: "An LLM splits it into 4–15 s shots with prompts and dialogue." },
  { title: "Cast", body: "One reference image per character keeps faces consistent." },
  { title: "Keyframes", body: "An image model draws each shot's first frame from the references." },
  { title: "Video", body: "Image-to-video models (Seedance, Kling, Veo, Wan) animate each frame." },
  { title: "Voice", body: "Native lip-synced audio, or dubbed with TTS." },
  { title: "Episode", body: "ffmpeg joins clips, audio and subtitles into an MP4." },
];

export default async function Home() {
  const [projects, status] = await Promise.all([listProjects(), providerStatus()]);
  return (
    <div className="min-h-full">
      <AppHeader status={status} />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">
            Script in, <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">episode out.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-ink-300">
            An AI short-drama studio: break a script into shots, lock in your cast, generate keyframes and video clips with
            the model of your choice, then render a finished vertical episode.
          </p>
          <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-xl border border-ink-700 bg-ink-850 p-3">
                <div className="text-[11px] font-semibold text-cyan-300">STEP {i + 1}</div>
                <div className="mt-0.5 text-sm font-semibold">{s.title}</div>
                <div className="mt-1 text-xs leading-snug text-ink-300">{s.body}</div>
              </li>
            ))}
          </ol>
        </section>
        <Dashboard
          projects={projects.map((p) => ({
            id: p.id,
            title: p.title,
            logline: p.logline,
            aspectRatio: p.aspectRatio,
            shots: p.shots.length,
            done: p.export?.status === "succeeded",
            updatedAt: p.updatedAt,
          }))}
        />
      </main>
    </div>
  );
}
