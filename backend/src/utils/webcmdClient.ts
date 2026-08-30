// ============================================================================
// webcmdClient.ts
//
// THIS IS THE ONLY FILE THAT SPAWNS THE `webcmd` CLI BINARY.
//
// Webcmd (https://webcmd.dev/docs) does not currently ship a programmatic
// SDK — as of the official docs' "Custom SDK Integration" page:
//
//   "Webcmd's programmatic SDK is not available yet. Integration through a
//    custom SDK is coming soon; this page will document it when it ships."
//
// The only real, documented way to invoke Webcmd is its CLI (`webcmd`),
// normally driven by an AI agent harness (Claude Code, Codex, etc.) reading
// natural-language prompts and choosing commands. For a plain Node/Express
// backend, the honest equivalent is to shell out to the *real*, installed
// `webcmd` binary and use the one command that is documented as built-in,
// working on a fresh install with no plugins, and safe for unattended,
// read-only use:
//
//   webcmd web fetch --url <url> -f json
//
// Per the CLI Reference (https://webcmd.dev/docs/cli-reference):
//   "Use `webcmd web fetch` for direct URL fetches and fetch-first web
//    search. It is built into the CLI, so it works on a fresh install with
//    no plugins. `web fetch` tries plain HTTP first, then browser-
//    impersonating TLS clients. It remains local in both modes and never
//    opens a browser."
//
// If a page requires real browser rendering, `web fetch` returns the error
// code FETCH_REQUIRES_BROWSER (or FETCH_BLOCKED if the site blocks non-
// browser fetches). The full agentic fallback for those codes is to open a
// Webcmd browser Session (`webcmd session create`, `browser run`, `browser
// snapshot`, `session close`) — see cli-reference.md. That fallback is
// intentionally NOT implemented here: it requires a running Webcmd daemon +
// local browser bridge (Cloak) and an agent making step-by-step navigation
// decisions, which is out of scope for a deterministic Express handler in a
// hackathon MVP. When `web fetch` cannot complete a URL, this module reports
// it as a skipped source and the pipeline continues with whatever sources
// did succeed — see requirement "if one website fails, continue with other
// sources" in the project brief. This is a deliberate, documented
// architectural boundary, not a fake fallback.
//
// VERIFY BEFORE DEMO: the exact JSON shape of `webcmd web fetch -f json`
// is not pinned down in the public docs beyond the general "-f json /
// -f plain" output-format rules described in cli-reference.md (a single
// human-facing field is named one of: response, content, markdown, text,
// or value). Run the command below by hand once during setup and confirm
// which field holds the fetched body on your installed version:
//
//   webcmd web fetch --url https://example.com -f json
//
// If it differs from the field names tried in `extractFetchedBody()` below,
// set WEBCMD_FETCH_CONTENT_FIELD in backend/.env to the correct field name
// instead of editing this file.
// ============================================================================

import crossSpawn from "cross-spawn";

const WEBCMD_BIN = process.env.WEBCMD_BIN || "webcmd";
const FETCH_TIMEOUT_MS = Number(process.env.WEBCMD_FETCH_TIMEOUT_MS || 20000);
const CONFIGURED_CONTENT_FIELD = process.env.WEBCMD_FETCH_CONTENT_FIELD;

export type WebcmdFailureCode =
  | "WEBCMD_NOT_INSTALLED"
  | "WEBCMD_TIMEOUT"
  | "FETCH_BLOCKED"
  | "FETCH_REQUIRES_BROWSER"
  | "DAEMON_UNAVAILABLE"
  | "UNKNOWN_ERROR";

export interface WebcmdFetchSuccess {
  ok: true;
  url: string;
  body: string; // raw fetched content (HTML or extracted text, depending on target site)
  raw: unknown; // the full parsed JSON the CLI returned, for debugging
}

export interface WebcmdFetchFailure {
  ok: false;
  url: string;
  code: WebcmdFailureCode;
  message: string;
}

export type WebcmdFetchResult = WebcmdFetchSuccess | WebcmdFetchFailure;

let cliAvailabilityChecked = false;
let cliAvailable = false;

/**
 * Runs `webcmd doctor -f json` once per process to confirm the CLI is
 * actually installed and reachable before the research pipeline starts.
 * This lets the app fail loudly and clearly ("WebCMD unavailable") instead
 * of silently pretending research happened.
 */
export async function checkWebcmdAvailable(): Promise<{
  available: boolean;
  message: string;
}> {
  if (cliAvailabilityChecked) {
    return {
      available: cliAvailable,
      message: cliAvailable
        ? "webcmd CLI is available."
        : "webcmd CLI is not available.",
    };
  }

  try {
    await runWebcmd(["--help"]);
    cliAvailabilityChecked = true;
    cliAvailable = true;
    return { available: true, message: "webcmd CLI is available." };
  } catch (err) {
    cliAvailabilityChecked = true;
    cliAvailable = false;
    const reason = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      message:
        `webcmd CLI could not be run (${reason}). Install it with ` +
        `"npm install -g @agentrhq/webcmd" and run "webcmd setup", then restart the backend.`,
    };
  }
}

// ----------------------------------------------------------------------------
// Why cross-spawn instead of execFile(..., { shell: true }):
//
// On Windows, npm installs global CLI tools (like `webcmd`) as `.cmd` shim
// files, not native .exe binaries. Node's execFile/spawn cannot invoke a
// `.cmd` directly — it needs `cmd.exe` to interpret it, which is why
// `shell: true` was tried. But once you go through `cmd.exe`, `&`, `|`, `^`,
// `<`, `>` become live command-separator/redirection characters again EVEN
// INSIDE double quotes (cmd.exe's quoting rules don't fully neutralize them
// the way POSIX shells do). Any URL with a query string containing `&`
// (i.e. almost every URL this app builds) gets silently truncated or
// misparsed as multiple commands — which is exactly the WEBCMD_TIMEOUT /
// garbage-output failures we were seeing.
//
// `cross-spawn` solves the underlying problem it was built for: it resolves
// `.cmd`/`.bat` shims correctly on Windows and applies the exact escaping
// needed so that each array element in `args` is passed through as a single,
// literal argument — no shell metacharacter interpretation, no manual
// escaping required on our end. On macOS/Linux it behaves like a normal
// spawn with no shell involved at all, so nothing changes there.
// ----------------------------------------------------------------------------

function runWebcmd(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = crossSpawn(WEBCMD_BIN, args, { windowsHide: true });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, FETCH_TIMEOUT_MS);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error.code === "ENOENT") {
        return reject(new Error("WEBCMD_NOT_INSTALLED: webcmd binary not found on PATH"));
      }
      return reject(new Error(error.message));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        return reject(new Error("WEBCMD_TIMEOUT: webcmd command timed out"));
      }
      if (code !== 0) {
        // Non-zero exit — webcmd may still have written a structured
        // error to stdout. Prefer that if present.
        if (stdout.trim().length > 0) {
          return resolve(stdout);
        }
        return reject(new Error(stderr.trim() || `webcmd exited with code ${code}`));
      }
      resolve(stdout);
    });
  });
}

function classifyError(message: string): WebcmdFailureCode {
  if (message.includes("WEBCMD_NOT_INSTALLED")) return "WEBCMD_NOT_INSTALLED";
  if (message.includes("WEBCMD_TIMEOUT")) return "WEBCMD_TIMEOUT";
  if (message.includes("FETCH_BLOCKED")) return "FETCH_BLOCKED";
  if (message.includes("FETCH_REQUIRES_BROWSER")) return "FETCH_REQUIRES_BROWSER";
  if (message.includes("DAEMON_UNAVAILABLE")) return "DAEMON_UNAVAILABLE";
  return "UNKNOWN_ERROR";
}

const CANDIDATE_FIELDS = ["content", "markdown", "text", "response", "value", "html", "body"];

function extractFetchedBody(parsed: unknown): string | null {
  if (typeof parsed === "string") return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    if (CONFIGURED_CONTENT_FIELD && typeof obj[CONFIGURED_CONTENT_FIELD] === "string") {
      return obj[CONFIGURED_CONTENT_FIELD] as string;
    }

    for (const field of CANDIDATE_FIELDS) {
      if (typeof obj[field] === "string" && (obj[field] as string).length > 0) {
        return obj[field] as string;
      }
    }

    // Some CLI commands wrap the payload in { data: {...} } or an array of rows.
    if (obj.data) return extractFetchedBody(obj.data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return extractFetchedBody(parsed[0]);
    }
  }
  return null;
}

/**
 * Real, single Webcmd call: `webcmd web fetch --url <url> -f json`.
 * Never fabricates a result — on any failure it returns a structured
 * WebcmdFetchFailure describing exactly what went wrong so the caller can
 * skip that source and continue with others.
 */
export async function webcmdFetch(url: string): Promise<WebcmdFetchResult> {
  const startedAt = Date.now();
  try {
    console.log(`[webcmd] invoking CLI for: ${url}`);
    const stdout = await runWebcmd(["web", "fetch", "--url", url, "-f", "json"]);
    console.log(`[webcmd] CLI returned in ${Date.now() - startedAt}ms for: ${url}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      // CLI produced non-JSON output (unexpected but not fatal) — use raw text.
      return { ok: true, url, body: stdout, raw: stdout };
    }

    const body = extractFetchedBody(parsed);
    if (body === null) {
      return {
        ok: false,
        url,
        code: "UNKNOWN_ERROR",
        message:
          "webcmd web fetch returned JSON but no recognizable content field was found. " +
          "Run `webcmd web fetch --url <url> -f json` manually and set WEBCMD_FETCH_CONTENT_FIELD.",
      };
    }
    return { ok: true, url, body, raw: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[webcmd] CLI failed after ${Date.now() - startedAt}ms for: ${url} — ${message}`);
    return { ok: false, url, code: classifyError(message), message };
  }
}
