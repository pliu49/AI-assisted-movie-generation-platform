import Link from "next/link";
import type { ProviderStatus } from "@/lib/types";

function Pill({ ok, label, title }: { ok: boolean; label: string; title: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
        ok ? "border-emerald-800/70 text-emerald-300" : "border-ink-600 text-ink-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-ink-500"}`} />
      {label}
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-[13px] text-white shadow-lg shadow-cyan-500/20">
        ▶
      </span>
      <span>Drama Studio</span>
    </Link>
  );
}

export function AppHeader({ status }: { status: ProviderStatus }) {
  const llmLabel = { claude: "Claude", ark: "Doubao", rules: "rule-based" }[status.llm];
  return (
    <header className="sticky top-0 z-20 border-b border-ink-700 bg-ink-900/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Logo />
        <nav className="flex gap-4 text-sm text-ink-300">
          <Link href="/" className="hover:text-ink-100">
            Projects
          </Link>
          <Link href="/settings" className="hover:text-ink-100">
            Models &amp; keys
          </Link>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Pill ok={status.fal} label="fal.ai" title={status.fal ? "FAL_KEY found" : "Set FAL_KEY in .env.local"} />
          <Pill ok={status.ark} label="Volcengine Ark" title={status.ark ? "ARK_API_KEY found" : "Set ARK_API_KEY in .env.local"} />
          <Pill ok={status.llm !== "rules"} label={`Script AI: ${llmLabel}`} title="Engine that breaks scripts into shots" />
          <Pill ok={status.ffmpeg} label="ffmpeg" title={status.ffmpeg ? "ffmpeg found" : "Install ffmpeg for video and export"} />
        </div>
      </div>
    </header>
  );
}
