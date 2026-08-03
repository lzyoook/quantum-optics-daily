// scripts/search_news.js
//
// Enterprise news & policy update search module.
// Replaces exa-search dependency for quantum-optics-daily weekly report.
//
// Backends (prioritized by reliability from behind GFW):
//   1. HackerNews Algolia API — tech/startup news (free, no API key)
//   2. Crossref API — academic papers & policy (free, no API key)
//   3. Bing.cn — general web search (fallback)
//
// Usage via mcp__node_repl (cwd = D:\everyday_recommand):
//   const s = await import("./quantum-optics-daily/scripts/search_news.js");
//   const r = await s.searchEnterprise("quantum sensing startup");
//   nodeRepl.write(JSON.stringify(r, null, 2));
//
//   For combined policy + enterprise sweep:
//   const r = await s.searchAll();
//   nodeRepl.write(JSON.stringify(r, null, 2));

// ── Helpers ────────────────────────────────────────────

function daysAgo(n) {
  return Math.floor(Date.now() / 1000) - n * 86400;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? isoStr : d.toISOString().split('T')[0];
}

function stripHtml(html) {
  return html ? html.replace(/<[^>]+>/g, '').trim() : '';
}

// ── Backend 1: HackerNews Algolia API ─────────────────
//
// Covers tech/startup news. Free, no auth, accessible from China.

async function searchHN(query, { limit = 5, daysBack = 30 } = {}) {
  const since = daysAgo(daysBack);
  const url = `https://hn.algolia.com/api/v1/search?` +
    `query=${encodeURIComponent(query)}` +
    `&hitsPerPage=${limit}` +
    `&tags=story` +
    `&numericFilters=created_at_i>${since}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "quantum-optics-daily/1.0" },
    signal: AbortSignal.timeout(10000)
  });

  if (!resp.ok) throw new Error(`HN API returned ${resp.status}`);

  const data = await resp.json();

  return (data.hits || []).map(h => ({
    title: h.title || '',
    url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: h.url ? new URL(h.url).hostname.replace(/^www\./, '') : 'news.ycombinator.com',
    date: formatDate(h.created_at),
    snippet: h.story_text ? stripHtml(h.story_text).substring(0, 200) : `HN discussion by ${h.author}, ${h.points || 0} points`,
    backend: 'hackernews'
  }));
}

// ── Backend 2: Crossref API ────────────────────────────
//
// Covers academic papers, funding announcements, policy docs.
// Free, no auth, accessible from China.

async function searchCrossref(query, { limit = 5, fromYear = 2025 } = {}) {
  const url = `https://api.crossref.org/works?` +
    `query=${encodeURIComponent(query)}` +
    `&rows=${limit}` +
    `&filter=from-pub-date:${fromYear}-01-01` +
    `&sort=published&order=desc`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "quantum-optics-daily/1.0" },
    signal: AbortSignal.timeout(10000)
  });

  if (!resp.ok) throw new Error(`Crossref API returned ${resp.status}`);

  const data = await resp.json();
  const items = data.message?.items || [];

  return items.map(item => {
    const date = item.published?.date?.parts?.[0]
      ? `${item.published.date.parts[0]}-${String(item.published.date.parts[1] || 1).padStart(2, '0')}-${String(item.published.date.parts[2] || 1).padStart(2, '0')}`
      : '';
    const doi = item.DOI || '';
    return {
      title: item.title?.[0] || '',
      url: doi ? `https://doi.org/${doi}` : '',
      source: item.container?.title?.[0] || (item.publisher || ''),
      date,
      snippet: (item.abstract || '').substring(0, 200).replace(/<[^>]+>/g, ''),
      doi,
      backend: 'crossref'
    };
  });
}

// ── Backend 3: Bing.cn web search ──────────────────────
//
// General web search fallback. Works from behind GFW but
// returns Chinese-biased results for broad queries.

async function searchBing(query, { limit = 5 } = {}) {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!resp.ok) throw new Error(`Bing returned ${resp.status}`);

  const html = await resp.text();
  const items = html.match(/<li class="b_algo"[^>]*>[\s\S]*?<\/li>/g) || [];

  return items.slice(0, limit).map(item => {
    const a = item.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    const caption = item.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const cite = item.match(/<cite>([\s\S]*?)<\/cite>/);

    return {
      title: a ? stripHtml(a[2]) : '',
      url: a ? a[1] : '',
      source: cite ? stripHtml(cite[1]) : (a ? new URL(a[1]).hostname.replace(/^www\./, '') : ''),
      date: '',
      snippet: caption ? stripHtml(caption[1]).substring(0, 200) : '',
      backend: 'bing'
    };
  });
}

// ── Public API ─────────────────────────────────────────

/**
 * Search enterprise/tech news.
 * Primary: HackerNews (tech startups, funding, products)
 * Fallback: Bing.cn
 */
export async function searchEnterprise(query, { limit = 5, daysBack = 30 } = {}) {
  let results = [];
  let sources = [];

  try {
    results = await searchHN(query, { limit, daysBack });
    sources.push('hackernews');
  } catch (e) {
    // fall through to next backend
  }

  if (results.length < 3) {
    try {
      const bingResults = await searchBing(query, { limit: limit - results.length });
      const existingUrls = new Set(results.map(r => r.url));
      for (const br of bingResults) {
        if (!existingUrls.has(br.url)) {
          results.push(br);
          existingUrls.add(br.url);
        }
      }
      sources.push('bing');
    } catch (e) {
      // ignore Bing failures
    }
  }

  return { query, category: 'enterprise', total: results.length, sources, results };
}

/**
 * Search policy/news updates.
 * Primary: Crossref (academic policy docs)
 * Secondary: HackerNews (broader tech policy)
 * Fallback: Bing.cn
 */
export async function searchPolicy(query, { limit = 5, fromYear = 2025 } = {}) {
  let results = [];
  let sources = [];

  try {
    results = await searchHN(query, { limit, daysBack: 365 });
    sources.push('hackernews');
  } catch (e) {
    // fall through
  }

  if (results.length < 3) {
    try {
      const crResults = await searchCrossref(query, { limit: limit - results.length, fromYear });
      const existingUrls = new Set(results.map(r => r.url));
      for (const cr of crResults) {
        if (!existingUrls.has(cr.url)) {
          results.push(cr);
          existingUrls.add(cr.url);
        }
      }
      sources.push('crossref');
    } catch (e) {
      // ignore
    }
  }

  if (results.length < 2) {
    try {
      const bingResults = await searchBing(query, { limit: limit - results.length });
      const existingUrls = new Set(results.map(r => r.url));
      for (const br of bingResults) {
        if (!existingUrls.has(br.url)) {
          results.push(br);
          existingUrls.add(br.url);
        }
      }
      sources.push('bing');
    } catch (e) {
      // ignore
    }
  }

  return { query, category: 'policy', total: results.length, sources, results };
}

/**
 * General news search.
 */
export async function searchNews(query, { limit = 5, daysBack = 30 } = {}) {
  let results = [];
  let sources = [];

  try {
    results = await searchHN(query, { limit, daysBack });
    sources.push('hackernews');
  } catch (e) {
    // fall through
  }

  if (results.length < limit) {
    try {
      const bingResults = await searchBing(query, { limit: limit - results.length });
      const existingUrls = new Set(results.map(r => r.url));
      for (const br of bingResults) {
        if (!existingUrls.has(br.url)) {
          results.push(br);
          existingUrls.add(br.url);
        }
      }
      sources.push('bing');
    } catch (e) {
      // ignore
    }
  }

  return { query, category: 'news', total: results.length, sources, results };
}

/**
 * Run all standard enterprise and policy queries from policy-sources.md.
 * Returns combined, date-sorted results.
 */
export async function searchAll({ enterpriseLimit = 3, policyLimit = 3 } = {}) {
  const enterpriseQueries = [
    "quantum sensing startup funding",
    "atomic magnetometer commercial",
    "quantum gyroscope company",
    "cold atom industry product",
    "quantum sensor product launch"
  ];

  const policyQueries = [
    "quantum technology government funding",
    "quantum sensing DARPA",
    "national quantum strategy",
    "EU quantum flagship",
    "quantum technology policy"
  ];

  const all = [];

  for (const q of enterpriseQueries) {
    try {
      const res = await searchEnterprise(q, { limit: enterpriseLimit, daysBack: 90 });
      all.push(...res.results.map(r => ({ ...r, category: 'enterprise', searchQuery: q })));
    } catch (e) {
      // skip failed query
    }
  }

  for (const q of policyQueries) {
    try {
      const res = await searchPolicy(q, { limit: policyLimit, fromYear: 2024 });
      all.push(...res.results.map(r => ({ ...r, category: 'policy', searchQuery: q })));
    } catch (e) {
      // skip failed query
    }
  }

  // Sort by date descending (most recent first)
  all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    category: 'all',
    total: all.length,
    results: all
  };
}
