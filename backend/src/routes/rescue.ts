import { Router, type Request, type Response } from "express";
import { checkWebcmdAvailable } from "../utils/webcmdClient";
import { researchSyllabus } from "../services/webcmdResearch";
import {
  allocateHours,
  buildDayPlan,
  buildEmergencyPlan,
  computeRescueStats,
  prioritizeTopics,
} from "../services/studyPlanner";
import type { RescueRequest, RescueResult, StreamMessage } from "../types";

export const rescueRouter = Router();

function validate(body: any): { ok: true; value: RescueRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body." };
  const { subject, syllabus, daysRemaining, hoursPerDay, weakTopics, targetMarks } = body;

  if (typeof subject !== "string" || subject.trim().length === 0)
    return { ok: false, error: "Subject is required." };
  if (!Array.isArray(syllabus) || syllabus.filter((s) => typeof s === "string" && s.trim()).length === 0)
    return { ok: false, error: "Syllabus must contain at least one topic." };
  if (typeof daysRemaining !== "number" || daysRemaining <= 0)
    return { ok: false, error: "Days remaining must be a positive number." };
  if (typeof hoursPerDay !== "number" || hoursPerDay <= 0)
    return { ok: false, error: "Study hours per day must be a positive number." };

  const cleanSyllabus = syllabus.map((s: string) => s.trim()).filter(Boolean).slice(0, 40); // guard against huge syllabi
  const cleanWeak = Array.isArray(weakTopics) ? weakTopics.map((w: string) => String(w).trim()).filter(Boolean) : [];

  return {
    ok: true,
    value: {
      subject: subject.trim(),
      syllabus: cleanSyllabus,
      daysRemaining: Math.min(60, Math.round(daysRemaining)),
      hoursPerDay: Math.min(16, hoursPerDay),
      weakTopics: cleanWeak,
      targetMarks: typeof targetMarks === "number" ? targetMarks : undefined,
    },
  };
}

/**
 * POST /api/rescue/stream
 * Streams newline-delimited JSON progress messages, then a final "result"
 * message. This reflects the pipeline's *actual* stages (including real
 * WebCMD calls) rather than a fake loading animation.
 */
rescueRouter.post("/stream", async (req: Request, res: Response) => {
  const validated = validate(req.body);

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  const send = (msg: StreamMessage) => {
    res.write(JSON.stringify(msg) + "\n");
  };

  if (!validated.ok) {
    send({ type: "error", message: validated.error });
    res.end();
    return;
  }
  const input = validated.value;

  try {
    send({ type: "progress", stage: "syllabus", status: "active", label: "Reading syllabus" });
    // (Parsing/normalizing already happened in validate(); this stage is
    // shown explicitly because it is a real, distinct step in the pipeline.)
    await tick();
    send({ type: "progress", stage: "syllabus", status: "done", label: "Reading syllabus" });

    send({ type: "progress", stage: "topics", status: "active", label: "Identifying topics" });
    await tick();
    send({
      type: "progress",
      stage: "topics",
      status: "done",
      label: "Identifying topics",
      detail: `${input.syllabus.length} topic(s), ${input.weakTopics.length} marked weak`,
    });

    send({ type: "progress", stage: "research", status: "active", label: "Researching web resources with WebCMD" });
    const availability = await checkWebcmdAvailable();
    if (!availability.available) {
      send({
        type: "progress",
        stage: "research",
        status: "error",
        label: "Researching web resources with WebCMD",
        detail: availability.message,
      });
      send({ type: "error", message: availability.message });
      res.end();
      return;
    }

    const { resources, warnings } = await researchSyllabus(
      input.subject,
      input.syllabus,
      input.weakTopics,
      ({ topic, query, status }) => {
        send({
          type: "progress",
          stage: "research",
          status: "active",
          label: "Researching web resources with WebCMD",
          detail: `${status === "start" ? "Querying" : status === "ok" ? "Found results for" : "No results for"}: "${query}" (${topic})`,
        });
      }
    );
    send({
      type: "progress",
      stage: "research",
      status: "done",
      label: "Researching web resources with WebCMD",
      detail: `${resources.length} resource(s) found via WebCMD, ${warnings.length} warning(s)`,
    });

    send({ type: "progress", stage: "evaluate", status: "active", label: "Evaluating resources" });
    await tick();
    // "Evaluation" = classification + dedupe already performed inside
    // researchSyllabus(); surfaced here as its own visible stage.
    send({
      type: "progress",
      stage: "evaluate",
      status: "done",
      label: "Evaluating resources",
      detail: `${resources.length} unique resource(s) retained after deduplication`,
    });

    send({ type: "progress", stage: "prioritize", status: "active", label: "Prioritizing topics" });
    let topics = prioritizeTopics(input, resources);
    const stats = computeRescueStats(input, topics);
    topics = allocateHours(topics, stats.totalStudyHours);
    await tick();
    send({ type: "progress", stage: "prioritize", status: "done", label: "Prioritizing topics" });

    send({ type: "progress", stage: "plan", status: "active", label: "Building rescue plan" });
    const plan = buildDayPlan(input, topics, stats.totalStudyHours);
    await tick();
    send({ type: "progress", stage: "plan", status: "done", label: "Building rescue plan" });

    const result: RescueResult = {
      input,
      stats,
      topics,
      plan,
      resources,
      researchWarnings: warnings,
      webcmdUsed: true,
    };

    send({ type: "result", data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error building the rescue plan.";
    send({ type: "error", message });
  } finally {
    res.end();
  }
});

/** POST /api/rescue/emergency — recompute a time-boxed plan from an existing prioritized topic list. */
rescueRouter.post("/emergency", (req: Request, res: Response) => {
  const { topics, minutesAvailable } = req.body || {};
  if (!Array.isArray(topics) || typeof minutesAvailable !== "number" || minutesAvailable <= 0) {
    res.status(400).json({ error: "topics[] and minutesAvailable are required." });
    return;
  }
  const plan = buildEmergencyPlan(topics, Math.min(480, minutesAvailable));
  res.json({ plan });
});

function tick(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
