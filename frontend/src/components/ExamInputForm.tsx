import { useState } from "react";
import type { RescueRequest } from "../types";

interface Props {
  onSubmit: (input: RescueRequest) => void;
}

const DEMO: RescueRequest = {
  subject: "Database Management Systems",
  daysRemaining: 3,
  hoursPerDay: 5,
  weakTopics: ["SQL", "Normalization"],
  syllabus: ["ER Model", "Relational Model", "SQL", "Normalization", "Transactions", "Indexing"],
};

export default function ExamInputForm({ onSubmit }: Props) {
  const [subject, setSubject] = useState("");
  const [syllabusText, setSyllabusText] = useState("");
  const [daysRemaining, setDaysRemaining] = useState<number | "">("");
  const [hoursPerDay, setHoursPerDay] = useState<number | "">("");
  const [weakTopics, setWeakTopics] = useState("");
  const [targetMarks, setTargetMarks] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  function loadDemo() {
    setSubject(DEMO.subject);
    setSyllabusText(DEMO.syllabus.join("\n"));
    setDaysRemaining(DEMO.daysRemaining);
    setHoursPerDay(DEMO.hoursPerDay);
    setWeakTopics(DEMO.weakTopics.join(", "));
    setTargetMarks("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const syllabus = syllabusText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!subject.trim()) return setError("Please enter a subject.");
    if (syllabus.length === 0) return setError("Please enter at least one syllabus topic.");
    if (!daysRemaining || daysRemaining <= 0) return setError("Days remaining must be greater than 0.");
    if (!hoursPerDay || hoursPerDay <= 0) return setError("Study hours per day must be greater than 0.");

    setError(null);
    onSubmit({
      subject: subject.trim(),
      syllabus,
      daysRemaining: Number(daysRemaining),
      hoursPerDay: Number(hoursPerDay),
      weakTopics: weakTopics
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
      targetMarks: targetMarks === "" ? undefined : Number(targetMarks),
    });
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="font-display text-3xl font-bold text-white">Tell us about your exam</h2>
        <button
          type="button"
          onClick={loadDemo}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          ⚡ Load Demo
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <Field label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Database Management Systems"
            className="input"
          />
        </Field>

        <Field label="Syllabus / topics" hint="One topic per line, or comma-separated">
          <textarea
            value={syllabusText}
            onChange={(e) => setSyllabusText(e.target.value)}
            placeholder={"ER Model\nRelational Model\nSQL\nNormalization\nTransactions\nIndexing"}
            rows={6}
            className="input resize-none font-mono text-sm"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Days remaining">
            <input
              type="number"
              min={1}
              value={daysRemaining}
              onChange={(e) => setDaysRemaining(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="3"
              className="input"
            />
          </Field>
          <Field label="Study hours / day">
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="5"
              className="input"
            />
          </Field>
        </div>

        <Field label="Weak topics" hint="Comma-separated">
          <input
            value={weakTopics}
            onChange={(e) => setWeakTopics(e.target.value)}
            placeholder="SQL, Normalization"
            className="input"
          />
        </Field>

        <Field label="Target marks (optional)">
          <input
            type="number"
            value={targetMarks}
            onChange={(e) => setTargetMarks(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="e.g. 80"
            className="input"
          />
        </Field>

        {error && <p className="text-sm font-medium text-rescue-400">{error}</p>}

        <button
          type="submit"
          className="w-full rounded-xl bg-rescue-600 py-4 font-display text-lg font-semibold text-white shadow-glow transition hover:bg-rescue-500 active:scale-[0.99]"
        >
          🚨 RESCUE ME
        </button>
      </form>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          padding: 0.75rem 1rem;
          color: white;
          outline: none;
          transition: border-color 0.15s ease;
        }
        .input::placeholder { color: rgba(148,163,184,0.5); }
        .input:focus { border-color: rgba(244,63,94,0.6); }
      `}</style>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
