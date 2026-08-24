import type { RescueStats } from "../types";

const LEVEL_STYLES: Record<string, { bg: string; ring: string; text: string }> = {
  CRITICAL: { bg: "bg-rescue-600", ring: "ring-rescue-500/40", text: "text-white" },
  HIGH: { bg: "bg-orange-600", ring: "ring-orange-500/40", text: "text-white" },
  MODERATE: { bg: "bg-amber-500", ring: "ring-amber-400/40", text: "text-ink-950" },
  SAFE: { bg: "bg-emerald-600", ring: "ring-emerald-500/40", text: "text-white" },
};

export default function RescueDashboard({ stats }: { stats: RescueStats }) {
  const style = LEVEL_STYLES[stats.level] ?? LEVEL_STYLES.MODERATE;

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h2 className="font-display mb-8 text-3xl font-bold text-white">Rescue Dashboard</h2>

      <div className={`rounded-2xl p-8 ring-1 ${style.bg} ${style.ring} ${style.text}`}>
        <div className="text-xs font-semibold uppercase tracking-widest opacity-80">
          Exam Rescue Level
        </div>
        <div className="font-display mt-2 text-5xl font-bold">{stats.level}</div>
        <div className="mt-3 max-w-xl text-sm opacity-90">{stats.disclaimer}</div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Total study hours" value={stats.totalStudyHours} />
        <Stat label="Syllabus topics" value={stats.topicCount} />
        <Stat label="High priority" value={stats.highPriorityCount} accent="text-rescue-400" />
        <Stat label="Medium priority" value={stats.mediumPriorityCount} accent="text-amber-400" />
        <Stat label="Low priority" value={stats.lowPriorityCount} accent="text-emerald-400" />
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className={`font-display text-2xl font-bold ${accent ?? "text-white"}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
