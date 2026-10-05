"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { JobState } from "@/lib/types";

type Variant = "default" | "primary" | "ghost" | "danger";

export function Button({
  variant = "default",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    default: "border border-ink-600 bg-ink-800 text-ink-100 hover:bg-ink-700 hover:border-ink-500",
    primary:
      "border border-transparent bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-[0_0_20px_-6px] shadow-cyan-400/60 hover:brightness-110",
    ghost: "border border-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-100",
    danger: "border border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-900/40",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const isActive = (j?: { status: string }) => !!j && (j.status === "queued" || j.status === "running");

export function JobChip({ job, label, done, stale }: { job?: JobState; label: string; done: boolean; stale?: boolean }) {
  let cls = "border-ink-600 text-ink-400";
  let icon: ReactNode = <span className="h-1.5 w-1.5 rounded-full bg-ink-500" />;
  let title: string | undefined;
  if (isActive(job)) {
    cls = "border-cyan-700/60 text-cyan-300 bg-cyan-950/30";
    icon = <Spinner className="h-3 w-3" />;
  } else if (job?.status === "failed") {
    cls = "border-red-800/60 text-red-300 bg-red-950/30";
    icon = <span className="h-1.5 w-1.5 rounded-full bg-red-400" />;
  } else if (done && stale) {
    cls = "border-amber-800/60 text-amber-300 bg-amber-950/20";
    icon = <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />;
    title = "Outdated: its input changed after it was generated";
  } else if (done) {
    cls = "border-emerald-800/60 text-emerald-300 bg-emerald-950/20";
    icon = <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />;
  }
  return (
    <span
      title={job?.status === "failed" ? job.error : job?.status === "queued" ? "Waiting for a free slot" : title}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}

/** Text input that edits a local draft and commits on blur (or Enter for single-line). */
export function TextField({
  value,
  onCommit,
  multiline,
  rows = 3,
  placeholder,
  className = "",
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const common = {
    value: draft,
    placeholder,
    className: `field ${className}`,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (draft !== value) onCommit(draft);
    },
  };
  return multiline ? (
    <textarea {...common} rows={rows} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-semibold tracking-wide text-ink-300 uppercase">{children}</span>
      {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-ink-600 bg-ink-850 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label={title}
      >
        <div className="border-b border-ink-700 px-5 py-3.5 text-[15px] font-semibold">{title}</div>
        <div className="px-5 py-4 text-sm text-ink-200">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
