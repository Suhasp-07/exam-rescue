import { useState } from "react";
import type { DayPlan } from "../types";

export default function DayByDayPlan({ plan }: { plan: DayPlan[] }) {
  const [active, setActive] = useState(0);
  const day = plan[active];

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h2 className="font-display mb-2 text-3xl font-bold text-white">Day-by-Day Plan</h2>
      <p className="mb-8 text-slate-400">
        Planned study time never exceeds your available hours per day.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {plan.map((d, i) => (
          <button
            key={d.day}
            onClick={() => setActive(i)}
            className={
              "rounded-full px-4 py-2 text-sm font-semibold transition " +
              (i === active
                ? "bg-rescue-600 text-white shadow-glow"
                : "border border-white/10 bg-white/[0.03] text-slate-400 hover:text-white")
            }
          >
            Day {d.day}
          </button>
        ))}
      </div>

      {day && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="mb-6 flex items-baseline justify-between">
            <h3 className="font-display text-xl font-bold text-white">Day {day.day}</h3>
            <span className="text-sm text-slate-400">{day.totalHours}h planned</span>
          </div>
          <ol className="space-y-4">
            {day.sessions.map((s, i) => (
              <li key={i} className="flex gap-4 border-l-2 border-rescue-500/40 pl-4">
                <div className="w-16 shrink-0 font-display text-sm font-bold text-rescue-400">{s.hours}h</div>
                <div>
                  <div className="font-semibold text-white">{s.topic}</div>
                  <div className="text-sm text-slate-400">{s.task}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
