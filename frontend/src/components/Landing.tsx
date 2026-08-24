interface Props {
  onStart: () => void;
}

export default function Landing({ onStart }: Props) {
  return (
    <section className="relative flex min-h-[90vh] flex-col items-center justify-center px-6 text-center">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rescue-600/20 blur-[120px]" />
      </div>

      <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-rescue-500/30 bg-rescue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-rescue-300">
        <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-rescue-400" />
        Browser-agent hackathon build
      </span>

      <h1 className="font-display max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl">
        Exam Rescue <span className="text-rescue-500">🚨</span>
      </h1>

      <p className="mt-6 max-w-2xl text-balance text-lg text-slate-400 sm:text-xl">
        Tell the agent what you're facing. It reads your syllabus, sends a real{" "}
        <span className="font-semibold text-slate-200">WebCMD</span> browser-research agent onto the
        open web, and comes back with a prioritized, hour-by-hour plan to rescue your grade.
      </p>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={onStart}
          className="group relative rounded-2xl bg-rescue-600 px-8 py-4 font-display text-lg font-semibold text-white shadow-glow transition hover:bg-rescue-500 active:scale-[0.98]"
        >
          🚨 Start My Rescue
        </button>
      </div>

      <div className="mt-16 grid w-full max-w-3xl grid-cols-2 gap-3 text-left sm:grid-cols-4">
        {[
          ["1", "Tell us your exam"],
          ["2", "WebCMD researches"],
          ["3", "Topics prioritized"],
          ["4", "Rescue plan built"],
        ].map(([n, label]) => (
          <div key={n} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <div className="font-display text-rescue-400">{n}</div>
            <div className="mt-1 text-sm text-slate-400">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
