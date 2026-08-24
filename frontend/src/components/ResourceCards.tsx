import { useState } from "react";
import type { ResearchWarning, StudyResource } from "../types";

const TYPE_LABELS: Record<string, string> = {
  tutorial: "Tutorial",
  article: "Article",
  video: "Video",
  "lecture-material": "Lecture Material",
  "practice-questions": "Practice Questions",
  "previous-year-paper": "Previous-Year Paper",
  reference: "Reference",
};

export default function ResourceCards({
  resources,
  warnings,
}: {
  resources: StudyResource[];
  warnings: ResearchWarning[];
}) {
  const topics = Array.from(new Set(resources.map((r) => r.topic)));
  const [filter, setFilter] = useState<string | null>(null);
  const shown = filter ? resources.filter((r) => r.topic === filter) : resources;

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h2 className="font-display mb-2 text-3xl font-bold text-white">
        Resources <span className="text-slate-500">— discovered via WebCMD</span>
      </h2>
      <p className="mb-6 text-slate-400">
        Every card below links to a real page WebCMD fetched during research. Nothing is fabricated.
      </p>

      {resources.length === 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-300">
          No resources could be retrieved from the web for this syllabus. Check the warnings below and
          try again — WebCMD may be unavailable or the sources it tried may have blocked automated
          fetches.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            <FilterChip active={filter === null} label="All" onClick={() => setFilter(null)} />
            {topics.map((t) => (
              <FilterChip key={t} active={filter === t} label={t} onClick={() => setFilter(t)} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((r) => (
              <div
                key={r.url}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-rescue-500/30"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-slate-400">
                    {TYPE_LABELS[r.type] ?? r.type}
                  </span>
                  <span className="truncate text-[11px] text-slate-500">{r.source}</span>
                </div>
                <h3 className="line-clamp-2 font-display text-base font-semibold text-white">{r.title}</h3>
                <span className="mt-1 text-xs font-medium text-rescue-400">{r.topic}</span>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-slate-400">{r.description}</p>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-white/10 py-2 text-sm font-semibold text-white transition hover:bg-rescue-600"
                >
                  Open Resource ↗
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      {warnings.length > 0 && (
        <details className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-400">
            {warnings.length} research warning(s) — sources that failed or returned nothing
          </summary>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-500">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-semibold text-slate-400">{w.topic}:</span> {w.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-3.5 py-1.5 text-xs font-semibold transition " +
        (active ? "bg-rescue-600 text-white" : "border border-white/10 bg-white/[0.03] text-slate-400 hover:text-white")
      }
    >
      {label}
    </button>
  );
}
