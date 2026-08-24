import { useRef, useState } from "react";
import Landing from "./components/Landing";
import ExamInputForm from "./components/ExamInputForm";
import AgentProgress from "./components/AgentProgress";
import RescueDashboard from "./components/RescueDashboard";
import PrioritizedTopics from "./components/PrioritizedTopics";
import DayByDayPlan from "./components/DayByDayPlan";
import ResourceCards from "./components/ResourceCards";
import EmergencyMode from "./components/EmergencyMode";
import { streamRescue } from "./api/rescue";
import type { RescueRequest, RescueResult, StageId, StageStatus } from "./types";

type View = "landing" | "input" | "progress" | "dashboard";

const INITIAL_PROGRESS: Record<StageId, { status: StageStatus; detail?: string }> = {
  syllabus: { status: "pending" },
  topics: { status: "pending" },
  research: { status: "pending" },
  evaluate: { status: "pending" },
  prioritize: { status: "pending" },
  plan: { status: "pending" },
};

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<RescueResult | null>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  async function handleRescue(input: RescueRequest) {
    setView("progress");
    setProgress(INITIAL_PROGRESS);
    setLiveLog([]);
    setErrorMessage(null);
    setResult(null);

    await streamRescue(input, (msg) => {
      if (msg.type === "progress") {
        setProgress((prev) => ({ ...prev, [msg.stage]: { status: msg.status, detail: msg.detail } }));
        if (msg.detail) setLiveLog((prev) => [...prev, `[${msg.stage}] ${msg.detail}`]);
      } else if (msg.type === "error") {
        setErrorMessage(msg.message);
      } else if (msg.type === "result") {
        setResult(msg.data);
        setTimeout(() => setView("dashboard"), 400);
      }
    });
  }

  return (
    <main>
      {view === "landing" && <Landing onStart={() => setView("input")} />}

      {view === "input" && <ExamInputForm onSubmit={handleRescue} />}

      {view === "progress" && (
        <AgentProgress progress={progress} liveLog={liveLog} errorMessage={errorMessage} />
      )}

      {view === "dashboard" && result && (
        <div ref={dashboardRef} className="pb-24">
          <RescueDashboard stats={result.stats} />
          <Divider />
          <PrioritizedTopics topics={result.topics} />
          <Divider />
          <DayByDayPlan plan={result.plan} />
          <Divider />
          <ResourceCards resources={result.resources} warnings={result.researchWarnings} />
          <Divider />
          <EmergencyMode topics={result.topics} />

          <div className="mx-auto max-w-2xl px-6 pt-8 text-center">
            <button
              onClick={() => setView("input")}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-slate-300 transition hover:text-white"
            >
              ↻ Start a new rescue
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Divider() {
  return <div className="mx-auto max-w-4xl border-t border-white/5" />;
}
