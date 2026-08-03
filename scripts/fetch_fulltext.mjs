// fetch_fulltext.mjs 鈥?Full-text retriever for academic papers
// Usage: node fetch_fulltext.mjs --doi 10.xxx/yyy
//        node fetch_fulltext.mjs --arxiv 2607.19853
// Tries: arXiv HTML 鈫?Nature OA HTML 鈫?Optica 鈫?Crossref abstract

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSection(text, sectionName) {
  const patterns = [
    new RegExp(`${sectionName}\\s*\\n(.+?)(?=\\n[A-Z][a-z]+\\s*\\n|$)`, "is"),
    new RegExp(`${sectionName}[\\s\\S]*?<\\/p>(.+?)(?=<h[23]|$)`, "i"),
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].substring(0, 3000);
  }
  return "";
}

// 鈹€鈹€ arXiv 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function fetchArxiv(arxivId) {
  const htmlUrl = `https://arxiv.org/html/${arxivId}v1`;
  const absUrl = `https://arxiv.org/abs/${arxivId}`;
  console.error(`  Trying arXiv HTML: ${htmlUrl}`);
  try {
    const html = await fetchWithTimeout(htmlUrl, 12000);
    let text = stripHtml(html);
    // Find abstract and introduction
    const absIdx = text.indexOf("Abstract");
    if (absIdx >= 0) {
      return { tier: "fulltext", text: text.substring(absIdx, Math.min(absIdx + 5000, text.length)), source: "arxiv" };
    }
    return { tier: "fulltext", text: text.substring(0, 5000), source: "arxiv" };
  } catch (err) {
    console.error(`  arXiv HTML failed: ${err.message}, trying abstract page...`);
    try {
      const html = await fetchWithTimeout(absUrl, 10000);
      const text = stripHtml(html);
      const absIdx = text.indexOf("Abstract");
      if (absIdx >= 0) return { tier: "abstract", text: text.substring(absIdx, Math.min(absIdx + 3000, text.length)), source: "arxiv" };
      return { tier: "abstract", text: text.substring(0, 3000), source: "arxiv" };
    } catch (err2) {
      throw new Error(`arXiv: ${err2.message}`);
    }
  }
}

// 鈹€鈹€ Nature OA 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function fetchNature(doi) {
  const url = `https://www.nature.com/articles/${doi.split("/").pop()}`;
  console.error(`  Trying Nature: ${url}`);
  const html = await fetchWithTimeout(url, 12000);
  const text = stripHtml(html);
  // Extract Abstract + Results + Discussion
  const absIdx = text.indexOf("Abstract");
  if (absIdx < 0) throw new Error("No Abstract found");
  let result = text.substring(absIdx);
  const refIdx = result.indexOf("References");
  if (refIdx > 0) result = result.substring(0, refIdx);
  return { tier: "fulltext", text: result.substring(0, 8000), source: "nature" };
}

// 鈹€鈹€ Optica 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function fetchOptica(doi) {
  const url = `https://opg.optica.org/abstract.cfm?uri=${doi.replace("10.1364/", "")}`;
  console.error(`  Trying Optica: ${url}`);
  const html = await fetchWithTimeout(url, 12000);
  // Extract meta abstract
  const metaMatch = html.match(/<meta\s+name="citation_abstract"\s+content="([^"]+)"/i);
  if (metaMatch) {
    return { tier: "abstract", text: metaMatch[1].replace(/<[^>]+>/g, ""), source: "optica" };
  }
  const text = stripHtml(html);
  const absIdx = text.indexOf("Abstract");
  return { tier: "abstract", text: absIdx >= 0 ? text.substring(absIdx, Math.min(absIdx + 3000, text.length)) : text.substring(0, 2000), source: "optica" };
}

// 鈹€鈹€ Crossref (fallback) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function fetchCrossref(doi) {
  const url = `https://api.crossref.org/works/${doi}`;
  console.error(`  Trying Crossref: ${url}`);
  const respText = await fetchWithTimeout(url, 10000);
  const json = JSON.parse(respText);
  const msg = json.message;
  const abstract = (msg.abstract || "").replace(/<[^>]+>/g, "").trim();
  if (abstract && abstract.length > 50) {
    return { tier: "abstract", text: abstract, source: "crossref" };
  }
  // Metadata-only fallback
  const title = msg.title?.[0] || "N/A";
  const journal = msg["container-title"]?.[0] || "N/A";
  const date = msg.created?.["date-time"]?.substring(0, 10) || "N/A";
  const authors = (msg.author || []).map(a => `${a.given || ""} ${a.family || ""}`).slice(0, 5).join(", ");
  const metadata = `TITLE: ${title}
AUTHORS: ${authors}
JOURNAL: ${journal}
DATE: ${date}

METADATA_ONLY: Full text not available via automated retrieval.`;
  return { tier: "metadata", text: metadata, source: "crossref" };
}

// 鈹€鈹€ Main 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export async function fetchFulltext(doi, arxivId = null) {
  // Try arXiv first if available
  if (arxivId) {
    try {
      return await fetchArxiv(arxivId);
    } catch (err) {
      console.error(`  arXiv failed: ${err.message}`);
    }
  }

  // Try Nature
  if (doi && doi.includes("10.1038/")) {
    try {
      return await fetchNature(doi);
    } catch (err) {
      console.error(`  Nature failed: ${err.message}`);
    }
  }

  // Try Optica
  if (doi && doi.includes("10.1364/")) {
    try {
      return await fetchOptica(doi);
    } catch (err) {
      console.error(`  Optica failed: ${err.message}`);
    }
  }

  // Fallback to Crossref
  try {
    return await fetchCrossref(doi);
  } catch (err) {
    return { tier: "error", text: `Could not retrieve content for ${doi}: ${err.message}`, source: "none" };
  }
}

// 鈹€鈹€ CLI 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function main() {
  const args = process.argv.slice(2);
  let doi = null, arxivId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--doi" && args[i + 1]) { doi = args[i + 1]; i++; }
    if (args[i] === "--arxiv" && args[i + 1]) { arxivId = args[i + 1]; i++; }
  }
  if (!doi && !arxivId) {
    console.error("Usage: node fetch_fulltext.mjs --doi 10.xxx/yyy [--arxiv XXXX.XXXXX]");
    process.exit(1);
  }
  const result = await fetchFulltext(doi, arxivId);
  if (typeof result === "object" && result.tier) {
    console.log(`[TIER: ${result.tier}] [SOURCE: ${result.source}]`);
    console.log(result.text);
  } else {
    console.log(result);
  }
}

const isMain = process.argv[1] && process.argv[1].includes("fetch_fulltext");
if (isMain) {
  main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
}

