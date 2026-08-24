// ============================================================================
// studyPlanner.ts
//
// Turns (syllabus + weak topics + real WebCMD-discovered resources) into:
//   - an Exam Rescue Level + stats
//   - a prioritized topic list (HIGH/MEDIUM/LOW) with reasons
//   - a day-by-day plan that never exceeds the student's available hours
//
// This is intentionally rule-based and deterministic rather than another
// opaque LLM call: every number here is explainable from the inputs, and the
// project brief explicitly warns against inventing exam weightage that
// isn't actually known. The "AI decision making" in the pipeline lives here
// (topic scoring, query targeting) and in webcmdResearch.ts (query
// selection) — see README "WebCMD Integration" for the full breakdown.
// ============================================================================

import type {
  DayPlan,
  DaySession,
  PrioritizedTopic,
  Priority,
  RescueLevel,
  RescueRequest,
  RescueStats,
  StudyResource,
} from "../types";

const REVISION_BUFFER_RATIO = 0.12; // fraction of total hours reserved for revision blocks
const MAX_SESSION_HOURS = 2.5; // split large topic allocations into digestible chunks

// ---------------------------------------------------------------------------
// Rescue Level
// ---------------------------------------------------------------------------

export function computeRescueStats(
  input: RescueRequest,
  topics: PrioritizedTopic[]
): RescueStats {
  const totalStudyHours = input.daysRemaining * input.hoursPerDay;
  const topicCount = input.syllabus.length;
  const avgHoursPerTopic = topicCount > 0 ? totalStudyHours / topicCount : totalStudyHours;
  const weakRatio = topicCount > 0 ? input.weakTopics.length / topicCount : 0;

  // Score: lower is worse (more critical). Combine days left, hours/topic, weak ratio.
  let score = 100;
  score -= Math.max(0, 6 - input.daysRemaining) * 8; // fewer days => bigger penalty
  score -= Math.max(0, 3 - avgHoursPerTopic) * 12; // less time per topic => bigger penalty
  score -= weakRatio * 30; // more weak topics => bigger penalty
  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: RescueLevel;
  if (score < 35) level = "CRITICAL";
  else if (score < 55) level = "HIGH";
  else if (score < 75) level = "MODERATE";
  else level = "SAFE";

  return {
    level,
    levelScore: score,
    totalStudyHours,
    topicCount,
    highPriorityCount: topics.filter((t) => t.priority === "HIGH").length,
    mediumPriorityCount: topics.filter((t) => t.priority === "MEDIUM").length,
    lowPriorityCount: topics.filter((t) => t.priority === "LOW").length,
    disclaimer:
      "This Exam Rescue Level is an application-generated planning indicator based on days remaining, " +
      "study hours, syllabus size, and weak topics. It is NOT a scientifically validated prediction of " +
      "exam performance.",
  };
}

// ---------------------------------------------------------------------------
// Topic prioritization
// ---------------------------------------------------------------------------

function complexityScore(topic: string): number {
  const words = topic.trim().split(/\s+/).filter(Boolean).length;
  const complexKeywords = ["design", "optimization", "advanced", "normalization", "transaction", "algorithm", "proof", "derivation"];
  const lower = topic.toLowerCase();
  const keywordHits = complexKeywords.filter((k) => lower.includes(k)).length;
  return Math.min(20, words * 3 + keywordHits * 6);
}

export function prioritizeTopics(
  input: RescueRequest,
  resources: StudyResource[]
): PrioritizedTopic[] {
  const weakLower = input.weakTopics.map((w) => w.trim().toLowerCase()).filter(Boolean);

  const scored = input.syllabus.map((topic) => {
    const topicResources = resources.filter((r) => r.topic === topic);
    const isWeak = weakLower.some(
      (w) => topic.toLowerCase().includes(w) || w.includes(topic.toLowerCase())
    );
    const weakBonus = isWeak ? 50 : 0;
    const complexity = complexityScore(topic);
    const resourceScore = Math.min(15, topicResources.length * 4);
    const score = weakBonus + complexity + resourceScore;
    return { topic, isWeak, score, complexity, topicResources };
  });

  // Rank-based bucketing so the plan always has a sensible spread, on top of
  // a hard floor: weak topics are never below MEDIUM.
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const n = sorted.length;
  const highCutoff = Math.max(1, Math.ceil(n * 0.4));
  const mediumCutoff = Math.max(highCutoff, Math.ceil(n * 0.75));

  const priorityByTopic = new Map<string, Priority>();
  sorted.forEach((s, i) => {
    let priority: Priority = i < highCutoff ? "HIGH" : i < mediumCutoff ? "MEDIUM" : "LOW";
    if (s.isWeak && priority === "LOW") priority = "MEDIUM";
    priorityByTopic.set(s.topic, priority);
  });

  // Preserve original syllabus order in the output for readability.
  return scored.map(({ topic, isWeak, topicResources }) => {
    const priority = priorityByTopic.get(topic)!;
    const reasonParts: string[] = [];
    if (isWeak) reasonParts.push("marked as a weak topic");
    reasonParts.push(
      priority === "HIGH"
        ? "high relative complexity/weight given limited time"
        : priority === "MEDIUM"
        ? "moderate priority given remaining time"
        : "lower relative priority given remaining time"
    );
    if (topicResources.length > 0) {
      reasonParts.push(`${topicResources.length} study resource${topicResources.length > 1 ? "s" : ""} found via WebCMD`);
    } else {
      reasonParts.push("no resources found for this topic — allocate extra buffer time");
    }

    return {
      topic,
      priority,
      isWeakTopic: isWeak,
      estimatedHours: 0, // filled in by allocateHours()
      reason: capitalize(reasonParts.join("; ")),
      recommendedResources: topicResources.slice(0, 3),
      practiceRecommendation:
        topicResources.some((r) => r.type === "practice-questions" || r.type === "previous-year-paper")
          ? `Solve practice questions / previous-year problems on "${topic}" from the resources below, then redo the ones you get wrong.`
          : `Attempt self-made or textbook practice problems on "${topic}" — no dedicated practice-question resource was found via WebCMD for this topic.`,
    };
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Hour allocation (must never exceed totalStudyHours)
// ---------------------------------------------------------------------------

const PRIORITY_WEIGHT: Record<Priority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export function allocateHours(topics: PrioritizedTopic[], totalStudyHours: number): PrioritizedTopic[] {
  const revisionBuffer = round(totalStudyHours * REVISION_BUFFER_RATIO, 0.5);
  const studyBudget = totalStudyHours - revisionBuffer;

  const totalWeight = topics.reduce((sum, t) => sum + PRIORITY_WEIGHT[t.priority], 0) || 1;

  let allocated = 0;
  const withHours = topics.map((t, i) => {
    let hours =
      i === topics.length - 1
        ? studyBudget - allocated // last topic absorbs rounding drift
        : round((PRIORITY_WEIGHT[t.priority] / totalWeight) * studyBudget, 0.5);
    hours = Math.max(0.5, Math.min(hours, studyBudget));
    allocated += hours;
    return { ...t, estimatedHours: hours };
  });

  // Safety clamp: if rounding pushed total over budget, trim the largest allocation.
  const sum = withHours.reduce((s, t) => s + t.estimatedHours, 0);
  const overflow = round(sum - studyBudget, 0.01);
  if (overflow > 0) {
    const biggest = [...withHours].sort((a, b) => b.estimatedHours - a.estimatedHours)[0];
    biggest.estimatedHours = Math.max(0.5, round(biggest.estimatedHours - overflow, 0.5));
  }

  return withHours;
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// ---------------------------------------------------------------------------
// Day-by-day scheduling
// ---------------------------------------------------------------------------

export function buildDayPlan(
  input: RescueRequest,
  topics: PrioritizedTopic[],
  totalStudyHours: number
): DayPlan[] {
  const revisionBuffer = round(totalStudyHours * REVISION_BUFFER_RATIO, 0.5);
  const days: DayPlan[] = Array.from({ length: input.daysRemaining }, (_, i) => ({
    day: i + 1,
    sessions: [],
    totalHours: 0,
  }));

  // Order: HIGH priority topics first so they land on earlier days.
  const ordered = [...topics].sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);

  // Split each topic's hours into <= MAX_SESSION_HOURS chunks.
  type Chunk = { topic: string; hours: number; chunkIndex: number; totalChunks: number; isWeak: boolean };
  const chunks: Chunk[] = [];
  for (const t of ordered) {
    let remaining = t.estimatedHours;
    const totalChunks = Math.max(1, Math.ceil(t.estimatedHours / MAX_SESSION_HOURS));
    let idx = 0;
    while (remaining > 0.01) {
      const hours = round(Math.min(MAX_SESSION_HOURS, remaining), 0.5) || 0.5;
      chunks.push({ topic: t.topic, hours, chunkIndex: idx, totalChunks, isWeak: t.isWeakTopic });
      remaining = round(remaining - hours, 0.01);
      idx++;
    }
  }

  // Greedy-fill days by capacity (hoursPerDay), keeping topic chunks in order.
  let dayIdx = 0;
  for (const chunk of chunks) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < days.length) {
      const day = days[dayIdx % days.length];
      if (day.totalHours + chunk.hours <= input.hoursPerDay + 0.001) {
        day.sessions.push({
          topic: chunk.topic,
          hours: chunk.hours,
          task: taskLabel(chunk.chunkIndex, chunk.totalChunks, chunk.isWeak),
        });
        day.totalHours = round(day.totalHours + chunk.hours, 0.01);
        placed = true;
      } else {
        dayIdx++;
        attempts++;
      }
    }
    if (!placed) {
      // No day has room — squeeze into the day with the most free capacity
      // rather than exceeding the student's total budget.
      const roomiest = [...days].sort(
        (a, b) => input.hoursPerDay - a.totalHours - (input.hoursPerDay - b.totalHours)
      )[0];
      const freeSpace = round(input.hoursPerDay - roomiest.totalHours, 0.5);
      if (freeSpace >= 0.5) {
        roomiest.sessions.push({
          topic: chunk.topic,
          hours: freeSpace,
          task: taskLabel(chunk.chunkIndex, chunk.totalChunks, chunk.isWeak),
        });
        roomiest.totalHours = round(roomiest.totalHours + freeSpace, 0.01);
      }
      // If truly no space anywhere, the chunk is dropped rather than
      // exceeding the student's stated available hours.
    }
    dayIdx++;
  }

  // Distribute the revision buffer across the last day(s), never exceeding hoursPerDay.
  let remainingRevision = revisionBuffer;
  for (let i = days.length - 1; i >= 0 && remainingRevision > 0.01; i--) {
    const day = days[i];
    const room = round(input.hoursPerDay - day.totalHours, 0.5);
    if (room >= 0.5) {
      const add = Math.min(room, remainingRevision);
      day.sessions.push({ topic: "Revision", hours: add, task: "Quick recap of the day's topics + spaced review of earlier weak topics" });
      day.totalHours = round(day.totalHours + add, 0.01);
      remainingRevision = round(remainingRevision - add, 0.01);
    }
  }

  return days;
}

function taskLabel(chunkIndex: number, totalChunks: number, isWeak: boolean): string {
  if (chunkIndex === 0) {
    return isWeak
      ? "Learn core concepts from scratch + worked examples (weak topic — go slow)"
      : "Learn concepts + examples";
  }
  if (chunkIndex === totalChunks - 1) {
    return "Practice questions + quick recap";
  }
  return "Continue concepts + solve practice problems";
}

// ---------------------------------------------------------------------------
// Emergency mode (also exported for the API route)
// ---------------------------------------------------------------------------

export interface EmergencyItem {
  topic: string;
  minutes: number;
  note: string;
}

export function buildEmergencyPlan(topics: PrioritizedTopic[], minutesAvailable: number): EmergencyItem[] {
  const revisionMinutes = Math.min(20, Math.round(minutesAvailable * 0.15));
  const studyMinutes = minutesAvailable - revisionMinutes;

  const ranked = [...topics].sort((a, b) => {
    const weight: Record<Priority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    if (a.isWeakTopic !== b.isWeakTopic) return a.isWeakTopic ? -1 : 1;
    return weight[b.priority] - weight[a.priority];
  });

  const totalWeight = ranked.reduce((sum, t, i) => sum + (ranked.length - i), 0) || 1;
  let allocated = 0;
  const items: EmergencyItem[] = ranked.map((t, i) => {
    const share = (ranked.length - i) / totalWeight;
    let minutes = Math.round((share * studyMinutes) / 5) * 5;
    minutes = Math.max(10, minutes);
    allocated += minutes;
    return {
      topic: t.topic,
      minutes,
      note: t.isWeakTopic ? "Weak topic — focus on core concepts only, skip edge cases" : "Focus on high-yield concepts only",
    };
  });

  // Trim to fit exactly within studyMinutes, largest item absorbs drift.
  const overflow = allocated - studyMinutes;
  if (Math.abs(overflow) > 0 && items.length > 0) {
    const biggest = [...items].sort((a, b) => b.minutes - a.minutes)[0];
    biggest.minutes = Math.max(10, biggest.minutes - overflow);
  }

  if (revisionMinutes > 0) {
    items.push({ topic: "Quick revision", minutes: revisionMinutes, note: "Skim key formulas/definitions across all topics" });
  }

  return items;
}
