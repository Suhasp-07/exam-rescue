// ============================================================================
// webcmdResearch.ts
//
// The browser-research workflow for Exam Rescue. This module:
//   1. Receives the student's subject + syllabus topics.
//   2. Decides which search/fetch queries to run per topic.
//   3. Invokes the real Webcmd CLI (via utils/webcmdClient.ts) to fetch
//      search-result pages and reference pages.
//   4. Parses the *actual* fetched HTML/JSON into structured resources.
//   5. Deduplicates by URL.
//   6. Returns { resources, warnings } to the study planner.
//
// No resource in the output was invented — every title/url/description is
// derived from content that `webcmd web fetch` actually returned. If a
// fetch fails, that source is skipped and recorded in `warnings`; the
// pipeline continues with whatever succeeded (see webcmdClient.ts for why
// browser-session fallback is intentionally out of scope for this MVP).
// ============================================================================

import { webcmdFetch } from "../utils/webcmdClient";
import type { ResearchWarning, ResourceType, StudyResource } from "../types";

const MAX_TOPICS_RESEARCHED = 8; // keep the demo fast & reliable
const RESULTS_PER_TOPIC = 4;

interface RawLink {
  title: string;
  url: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Step 2: decide queries per topic ("AI decision making" stage)
// ---------------------------------------------------------------------------

function buildQueries(subject: string, topic: string, isWeak: boolean): string[] {
  const base = `${subject} ${topic}`.trim();
  const queries = [`${base} tutorial`, `${base} practice questions`];
  if (isWeak) {
    // Weak topics get an extra, more targeted query.
    queries.push(`${base} explained step by step`);
  }
  return queries;
}

// ---------------------------------------------------------------------------
// Step 4: parse real fetched content into candidate links
// ---------------------------------------------------------------------------

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, ""));
}

/** Decodes DuckDuckGo's `//duckduckgo.com/l/?uddg=<encoded-url>` redirect wrapper. */
function unwrapDuckDuckGoRedirect(href: string): string {
  try {
    const normalized = href.startsWith("//") ? `https:${href}` : href;
    const u = new URL(normalized);
    const target = u.searchParams.get("uddg");
    if (target) return decodeURIComponent(target);
    return normalized;
  } catch {
    return href;
  }
}

/**
 * `webcmd web fetch` doesn't always return raw HTML — depending on the CLI
 * version/site, it may already run readability/markdown extraction and hand
 * back Markdown instead (e.g. `[Some Title](https://example.com "tooltip")`
 * links, or bare `https://...` lines). A quick, cheap heuristic: if the body
 * has no HTML tags at all, or has very few relative to its length, treat it
 * as Markdown/plain text instead of running the HTML regexes against it.
 */
function looksLikeMarkdown(body: string): boolean {
  const tagMatches = body.match(/<[a-z][^>]*>/gi);
  const tagCount = tagMatches ? tagMatches.length : 0;
  // Real HTML search-results pages have hundreds of tags. Markdown/plain-text
  // extractions have few or none. Use a low threshold relative to length.
  return tagCount < 5 || body.length / Math.max(tagCount, 1) > 2000;
}

/** Parses the DuckDuckGo HTML results page (html.duckduckgo.com/html/?q=...). */
function parseDuckDuckGoHtml(html: string): RawLink[] {
  const results: RawLink[] = [];
  const resultBlockRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const titles: { href: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = resultBlockRegex.exec(html)) !== null) {
    titles.push({ href: unwrapDuckDuckGoRedirect(m[1]), title: stripTags(m[2]) });
  }

  const snippets: string[] = [];
  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push(stripTags(m[1]));
  }

  titles.forEach((t, i) => {
    if (!t.href || !t.title) return;
    results.push({ title: t.title, url: t.href, snippet: snippets[i] || "" });
  });

  return results;
}

function stripMarkdownEmphasis(input: string): string {
  return input.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
}

/**
 * Parses a Markdown-rendered version of the DuckDuckGo HTML results page.
 * Confirmed against real `webcmd web fetch -f json` output: DDG's markdown
 * extraction repeats each result's URL three times per block —
 *   ## [Title](url)                       <- heading link (the title)
 *   [![](favicon-url)](url)               <- favicon wrapped in an image-link
 *   [snippet text...](url)                <- snippet, also wrapped as a link
 * Handles two shapes:
 *   1. The standard block above.
 *   2. Bare-URL lines with a preceding title line (seen from some CLI/site
 *      combinations that drop link syntax entirely).
 */
function parseDuckDuckGoMarkdown(mdRaw: string): RawLink[] {
  // Strip image-markdown FIRST. Left in place, "[![](icon)](url)" gets
  // misparsed by the link regex below as a bogus {title: "![", url: icon-url}
  // entry, because the regex can't tell nested "![...]" apart from a real
  // "[...]" link opener.
  const md = mdRaw.replace(/!\[[^\]]*\]\([^)]*\)/g, "");

  const byHref = new Map<string, { title: string; snippet: string }>();
  const order: string[] = [];

  // Shape 1: [Title](url) — including the repeated favicon-text and
  // snippet-text links DDG wraps around the same URL.
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(md)) !== null) {
    const text = stripMarkdownEmphasis(decodeHtmlEntities(m[1])).trim();
    const href = unwrapDuckDuckGoRedirect(m[2]);
    if (!text || !href) continue;

    const existing = byHref.get(href);
    if (!existing) {
      // First occurrence of this URL is the "## [Title](url)" heading.
      byHref.set(href, { title: text, snippet: "" });
      order.push(href);
    } else if (text !== existing.title && text.length > existing.snippet.length && text.length > 20) {
      // A later occurrence of the same URL that's longer than a bare
      // domain (e.g. "www.w3schools.com/sql/") is almost certainly the
      // snippet paragraph — capture it instead of discarding it.
      existing.snippet = text;
    }
  }

  const results: RawLink[] = order.map((href) => {
    const entry = byHref.get(href)!;
    return { title: entry.title, url: href, snippet: entry.snippet };
  });

  if (results.length > 0) return results;

  // Shape 2: fallback — bare URL lines, using the previous non-empty line as title.
  const fallbackSeen = new Set<string>();
  const lines = md.split(/\r?\n/);
  let pendingTitle = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const bareUrlMatch = line.match(/^\(?(https?:\/\/[^\s)]+)\)?$/);
    if (bareUrlMatch) {
      const href = unwrapDuckDuckGoRedirect(bareUrlMatch[1]);
      if (pendingTitle && href && !fallbackSeen.has(href) && isPlausibleResourceUrl(href)) {
        fallbackSeen.add(href);
        results.push({ title: pendingTitle, url: href, snippet: "" });
      }
      pendingTitle = "";
    } else {
      pendingTitle = decodeHtmlEntities(line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, ""));
    }
  }

  return results;
}

/** Parses Wikipedia's public opensearch/search JSON API response. */
function parseWikipediaSearchJson(body: string): RawLink[] {
  try {
    const data = JSON.parse(body);
    const pages = data?.query?.search;
    if (!Array.isArray(pages)) return [];
    return pages.map((p: any) => ({
      title: String(p.title || "Wikipedia article"),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(p.title || "").replace(/ /g, "_"))}`,
      snippet: stripTags(String(p.snippet || "")),
    }));
  } catch {
    return [];
  }
}

/** Parses the Bing HTML results page as a secondary fallback if DuckDuckGo fails. */
function parseBingHtml(html: string): RawLink[] {
  const results: RawLink[] = [];
  const blockRegex = /<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(html)) !== null) {
    const url = decodeHtmlEntities(m[1]);
    const title = stripTags(m[2]);
    if (url.startsWith("http")) {
      results.push({ title, url, snippet: "" });
    }
  }
  return results;
}

/** Markdown-extraction fallback for Bing, mirroring parseDuckDuckGoMarkdown (minus the DDG redirect-unwrap). */
function parseBingMarkdown(mdRaw: string): RawLink[] {
  const md = mdRaw.replace(/!\[[^\]]*\]\([^)]*\)/g, ""); // strip image-links first, same reason as DDG
  const results: RawLink[] = [];
  const seen = new Set<string>();
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(md)) !== null) {
    const title = stripMarkdownEmphasis(decodeHtmlEntities(m[1])).trim();
    const url = m[2];
    if (!title || !url || seen.has(url) || !isPlausibleResourceUrl(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet: "" });
  }
  return results;
}

/** Small delay so consecutive queries don't slam DuckDuckGo/Bing back-to-back and trip rate limiting. */
const QUERY_DELAY_MS = Number(process.env.WEBCMD_QUERY_DELAY_MS || 1500);
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Step 5/6: classify + dedupe
// ---------------------------------------------------------------------------

function classifyType(url: string, title: string): ResourceType {
  const u = url.toLowerCase();
  const t = title.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be") || t.includes("video")) return "video";
  if (t.includes("previous year") || t.includes("question paper") || t.includes("past paper"))
    return "previous-year-paper";
  if (t.includes("practice") || t.includes("quiz") || t.includes("mcq") || t.includes("questions"))
    return "practice-questions";
  if (u.includes("wikipedia.org")) return "article";
  if (u.includes(".edu") || t.includes("lecture") || t.includes("notes")) return "lecture-material";
  if (u.includes("geeksforgeeks") || u.includes("tutorialspoint") || u.includes("javatpoint") || t.includes("tutorial"))
    return "tutorial";
  return "reference";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isPlausibleResourceUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const blocked = ["duckduckgo.com", "bing.com/search", "google.com/search"];
  return !blocked.some((b) => url.includes(b));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface ResearchResult {
  resources: StudyResource[];
  warnings: ResearchWarning[];
}

export interface ResearchProgressCallback {
  (info: { topic: string; query: string; status: "start" | "ok" | "fail" }): void;
}

export async function researchSyllabus(
  subject: string,
  syllabus: string[],
  weakTopics: string[],
  onProgress?: ResearchProgressCallback
): Promise<ResearchResult> {
  const resources: StudyResource[] = [];
  const warnings: ResearchWarning[] = [];
  const seenUrls = new Set<string>();

  const weakLower = weakTopics.map((w) => w.trim().toLowerCase());
  const topicsToResearch = syllabus.slice(0, MAX_TOPICS_RESEARCHED);
  let queryIndex = 0;

  for (const topic of topicsToResearch) {
    const isWeak = weakLower.some(
      (w) => w.length > 0 && (topic.toLowerCase().includes(w) || w.includes(topic.toLowerCase()))
    );
    const queries = buildQueries(subject, topic, isWeak);
    let foundForTopic = 0;

    for (const query of queries) {
      if (foundForTopic >= RESULTS_PER_TOPIC) break;
      onProgress?.({ topic, query, status: "start" });

      // Space out consecutive queries to avoid tripping DuckDuckGo/Bing
      // rate-limiting during a full multi-topic run (see WEBCMD_QUERY_DELAY_MS).
      if (queryIndex > 0) {
        await delay(QUERY_DELAY_MS);
      }
      queryIndex++;

      const links = await runQuery(query, topic, warnings);
      onProgress?.({ topic, query, status: links.length > 0 ? "ok" : "fail" });

      for (const link of links) {
        if (foundForTopic >= RESULTS_PER_TOPIC) break;
        if (!isPlausibleResourceUrl(link.url)) continue;
        const normalized = link.url.split("#")[0];
        if (seenUrls.has(normalized)) continue;
        seenUrls.add(normalized);

        resources.push({
          title: link.title.slice(0, 160),
          url: link.url,
          source: hostnameOf(link.url),
          topic,
          type: classifyType(link.url, link.title),
          description: (link.snippet || "No description available from the source page.").slice(0, 280),
        });
        foundForTopic++;
      }
    }

    if (foundForTopic === 0) {
      warnings.push({
        topic,
        query: queries[0],
        reason: "No resources could be retrieved for this topic via WebCMD.",
      });
    }
  }

  return { resources, warnings };
}

/** Runs one query across DuckDuckGo -> Wikipedia -> Bing, in that order, stopping at the first that yields links. */
async function runQuery(
  query: string,
  topic: string,
  warnings: ResearchWarning[]
): Promise<RawLink[]> {
  // 1) DuckDuckGo HTML (lightweight, no JS required — good fit for `web fetch`'s
  //    plain-HTTP-first strategy).
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ddg = await webcmdFetch(ddgUrl);
  if (ddg.ok) {
    const links = looksLikeMarkdown(ddg.body)
      ? parseDuckDuckGoMarkdown(ddg.body)
      : parseDuckDuckGoHtml(ddg.body);
    if (links.length > 0) return links;
  } else {
    warnings.push({ topic, query, reason: `DuckDuckGo fetch failed (${ddg.code}): ${ddg.message}` });
  }

  // 2) Wikipedia's public search JSON API — extremely stable, always tried
  //    as a reliable secondary source of grounded articles.
  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&format=json&srlimit=3`;
  const wiki = await webcmdFetch(wikiUrl);
  if (wiki.ok) {
    const links = parseWikipediaSearchJson(wiki.body);
    if (links.length > 0) return links;
  } else {
    warnings.push({ topic, query, reason: `Wikipedia fetch failed (${wiki.code}): ${wiki.message}` });
  }

  // 3) Bing HTML as a last-resort fallback in case DuckDuckGo is blocked in
  //    this network environment.
  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const bing = await webcmdFetch(bingUrl);
  if (bing.ok) {
    const links = looksLikeMarkdown(bing.body) ? parseBingMarkdown(bing.body) : parseBingHtml(bing.body);
    if (links.length > 0) return links;
  } else {
    warnings.push({ topic, query, reason: `Bing fetch failed (${bing.code}): ${bing.message}` });
  }

  return [];
}
