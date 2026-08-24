import type { PrioritizedTopic } from "../types";

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-rescue-500/15 text-rescue-300 border-rescue-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  LOW: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

export default function PrioritizedTopics({ topics }: { topics: PrioritizedTopic[] }) {
  const sorted = [...topics].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h2 className="font-display mb-2 text-3xl font-bold text-white">Prioritized Topics</h2>
      <p className="mb-8 text-slate-400">What to study, in what order, and why.</p>

      <div className="space-y-4">
        {sorted.map((t) => (
          <div key={t.topic} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-xl font-semibold text-white">{t.topic}</h3>
              <span className={`rounded-full border px-3 py-0.5 text-xs font-bold ${PRIORITY_STYLES[t.priority]}`}>
                {t.priority}
              </span>
              {t.isWeakTopic && (
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-3 py-0.5 text-xs font-semibold text-indigo-300">
                  Weak topic
                </span>
              )}
              <span className="ml-auto text-sm font-semibold text-slate-300">{t.estimatedHours}h allocated</span>
            </div>

            <p className="mt-3 text-sm text-slate-400">{t.reason}</p>
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-semibold text-slate-400">Practice: </span>
              {t.practiceRecommendation}
            </p>

            {t.recommendedResources.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {t.recommendedResources.map((r) => (
                  <a
                    key={r.url}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition hover:border-rescue-500/40 hover:text-white"
                  >
                    {r.source} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
