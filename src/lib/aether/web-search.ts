/**
 * Structured web search — separate from phone open_url.
 * DuckDuckGo Instant Answer API (no key). Results are untrusted data.
 */

export type WebSearchHit = {
  title: string;
  snippet: string;
  url?: string;
};

export type WebSearchResult =
  | { ok: true; query: string; hits: WebSearchHit[]; message: string }
  | { ok: false; query: string; message: string };

export async function webSearch(
  query: string,
  opts: { fetchImpl?: typeof fetch; limit?: number } = {},
): Promise<WebSearchResult> {
  const q = query.trim().slice(0, 200);
  if (!q) {
    return { ok: false, query: "", message: "What should I search for?" };
  }

  const fetchFn = opts.fetchImpl ?? fetch;
  const limit = Math.min(5, Math.max(1, opts.limit ?? 5));
  const url =
    "https://api.duckduckgo.com/?" +
    `q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, query: q, message: "Web search is unavailable right now." };
    }
    const json = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };

    const hits: WebSearchHit[] = [];
    if (json.AbstractText) {
      hits.push({
        title: json.Heading || q,
        snippet: json.AbstractText.slice(0, 400),
        url: json.AbstractURL,
      });
    }
    for (const topic of json.RelatedTopics ?? []) {
      if (hits.length >= limit) break;
      if (topic.Text) {
        hits.push({
          title: (topic.Text.split(" - ")[0] || topic.Text).slice(0, 80),
          snippet: topic.Text.slice(0, 300),
          url: topic.FirstURL,
        });
      }
    }

    if (!hits.length) {
      return { ok: false, query: q, message: `No structured results for "${q}".` };
    }

    const message =
      hits.length === 1
        ? `${hits[0].title}: ${hits[0].snippet}`
        : hits.map((h, i) => `${i + 1}. ${h.title}`).join(" ");

    return { ok: true, query: q, hits, message };
  } catch {
    return { ok: false, query: q, message: "Couldn't reach the search service." };
  }
}
