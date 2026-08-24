// ============================================================================
// Exam Rescue — shared backend types
// ============================================================================

export interface RescueRequest {
  subject: string;
  syllabus: string[];
  daysRemaining: number;
  hoursPerDay: number;
  weakTopics: string[];
  targetMarks?: number;
}

export type ResourceType =
  | "tutorial"
  | "article"
  | "video"
  | "lecture-material"
  | "practice-questions"
  | "previous-year-paper"
  | "reference";

export interface StudyResource {
  title: string;
  url: string;
  source: string; // hostname, e.g. "en.wikipedia.org"
  topic: string; // which syllabus topic this was found for
  type: ResourceType;
  description: string;
}

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface PrioritizedTopic {
  topic: string;
  priority: Priority;
  isWeakTopic: boolean;
  estimatedHours: number;
  reason: string;
  recommendedResources: StudyResource[];
  practiceRecommendation: string;
}

export interface DaySession {
  topic: string;
  hours: number;
  task: string;
}

export interface DayPlan {
  day: number;
  sessions: DaySession[];
  totalHours: number;
}

export type RescueLevel = "CRITICAL" | "HIGH" | "MODERATE" | "SAFE";

export interface RescueStats {
  level: RescueLevel;
  levelScore: number; // 0-100, informational only
  totalStudyHours: number;
  topicCount: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  disclaimer: string;
}

export interface ResearchWarning {
  topic: string;
  query: string;
  reason: string;
}

export interface RescueResult {
  input: RescueRequest;
  stats: RescueStats;
  topics: PrioritizedTopic[];
  plan: DayPlan[];
  resources: StudyResource[];
  researchWarnings: ResearchWarning[];
  webcmdUsed: boolean;
}

// ---- Streaming progress protocol (NDJSON lines sent to the frontend) ------

export type StageId =
  | "syllabus"
  | "topics"
  | "research"
  | "evaluate"
  | "prioritize"
  | "plan";

export type StageStatus = "pending" | "active" | "done" | "error";

export interface ProgressMessage {
  type: "progress";
  stage: StageId;
  status: StageStatus;
  label: string;
  detail?: string;
}

export interface ResultMessage {
  type: "result";
  data: RescueResult;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type StreamMessage = ProgressMessage | ResultMessage | ErrorMessage;
