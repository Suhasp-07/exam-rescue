import type { EmergencyItem, PrioritizedTopic, RescueRequest, StreamMessage } from "../types";
import { API_BASE } from "./base";

/**
 * Streams the rescue pipeline as newline-delimited JSON. Each line is one
 * ProgressMessage/ErrorMessage/ResultMessage from the backend, reflecting
 * the pipeline's real stages (including live WebCMD research calls).
 */
export async function streamRescue(
  input: RescueRequest,
  onMessage: (msg: StreamMessage) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/rescue/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok || !res.body) {
    onMessage({ type: "error", message: `Request failed (${res.status})` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as StreamMessage;
        onMessage(msg);
      } catch {
        // ignore malformed line
      }
    }
  }

  if (buffer.trim()) {
    try {
      onMessage(JSON.parse(buffer.trim()) as StreamMessage);
    } catch {
      /* ignore */
    }
  }
}

export async function fetchEmergencyPlan(
  topics: PrioritizedTopic[],
  minutesAvailable: number
): Promise<EmergencyItem[]> {
  const res = await fetch(`${API_BASE}/api/rescue/emergency`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topics, minutesAvailable }),
  });
  if (!res.ok) throw new Error("Failed to build emergency plan.");
  const data = await res.json();
  return data.plan as EmergencyItem[];
}
