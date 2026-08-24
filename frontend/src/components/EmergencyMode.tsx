import { useState } from "react";
import type { EmergencyItem, PrioritizedTopic } from "../types";
import { fetchEmergencyPlan } from "../api/rescue";

export default function EmergencyMode({ topics }: { topics: PrioritizedTopic[] }) {
  const [minutes, setMinutes] = useState(120);
  const [plan, setPlan] = useState<EmergencyItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEmergencyPlan(topics, minutes);
      setPlan(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build emergency plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-rescue-500/30 bg-gradient-to-br from-rescue-950/40 to-ink-900 p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold text-white">⏱ I ONLY HAVE {minutes >= 60 ? `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h` : `${minutes}m`}</h2>
        <p className="mt-2 text-sm text-slate-400">
          Generated live from your actual prioritized plan — not hardcoded.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <input
            type="range"
            min={15}
            max={480}
            step={15}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="flex-1 accent-rescue-500"
          />
          <span className="w-16 shrink-0 text-right font-display font-bold text-white">{minutes}m</span>
        </div>

        <button
          onClick={run}
          disabled={loading}
          className="mt-5 w-full rounded-xl bg-rescue-600 py-3 font-display font-semibold text-white transition hover:bg-rescue-500 disabled:opacity-60"
        >
          {loading ? "Calculating…" : "What should I study first?"}
        </button>

        {error && <p className="mt-3 text-sm text-rescue-400">{error}</p>}

        {plan && (
          <ol className="mt-6 space-y-3">
            {plan.map((item, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <span className="font-display text-lg font-bold text-rescue-400">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-white">{item.topic}</span>
                    <span className="text-sm font-bold text-slate-300">{item.minutes} min</span>
                  </div>
                  <div className="text-xs text-slate-500">{item.note}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
