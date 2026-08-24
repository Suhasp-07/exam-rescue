import type { ProgressMessage, StageId, StageStatus } from "../types";

const STAGES: { id: StageId; label: string }[] = [
  { id: "syllabus", label: "Reading syllabus" },
  { id: "topics", label: "Identifying topics" },
  { id: "research", label: "Researching web resources with WebCMD" },
  { id: "evaluate", label: "Evaluating resources" },
  { id: "prioritize", label: "Prioritizing topics" },
  { id: "plan", label: "Building rescue plan" },
];

interface Props {
  progress: Record<StageId, { status: StageStatus; detail?: string }>;
  liveLog: string[];
  errorMessage?: string | null;
}

export default function AgentProgress({ progress, liveLog, errorMessage }: Props) {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h2 className="font-display mb-2 text-3xl font-bold text-white">Agent at work</h2>
      <p className="mb-8 text-slate-400">
        This reflects the real pipeline — including live calls to the WebCMD CLI. Nothing here is a
        fake timer.
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <ul className="space-y-4">
          {STAGES.map((s) => {
            const state = progress[s.id]?.status ?? "pending";
            return (
              <li key={s.id} className="flex items-start gap-3">
                <StageIcon status={state} />
                <div className="min-w-0 flex-1">
                  <div
                    className={
                      "font-medium " +
                      (state === "done"
                        ? "text-slate-300"
                        : state === "active"
                        ? "text-white"
                        : state === "error"
                        ? "text-rescue-400"
                        : "text-slate-500")
                    }
                  >
                    {s.label}
                  </div>
                  {progress[s.id]?.detail && (
                    <div className="mt-0.5 truncate text-xs text-slate-500">{progress[s.id]?.detail}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {liveLog.length > 0 && (
          <div className="mt-6 max-h-40 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-slate-500">
            {liveLog.slice(-10).map((line, i) => (
              <div key={i} className="animate-fade-up">
                {line}
              </div>
            ))}
          </div>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-lg border border-rescue-500/30 bg-rescue-500/10 p-4 text-sm text-rescue-300">
            {errorMessage}
          </div>
        )}
      </div>
    </section>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "done")
    return (
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        ✓
      </span>
    );
  if (status === "active")
    return (
      <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rescue-500/20 text-rescue-400">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rescue-500/30" />
        <span className="relative">⟳</span>
      </span>
    );
  if (status === "error")
    return (
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rescue-600/30 text-rescue-300">
        ✕
      </span>
    );
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-600">
      ○
    </span>
  );
}
