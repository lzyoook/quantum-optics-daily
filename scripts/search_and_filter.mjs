// search_and_filter.mjs 鈥?Quantum optics daily paper search pipeline
// Usage: node search_and_filter.mjs [--keywords "kw1,kw2" --days 180 --out results.json]

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// 鈹€鈹€ Journal classification 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const RELEVANCE_KEYWORDS = [
  "atom", "vapor", "atomic vapour", "atomic ensemble",
  "photon", "squeez", "entangl", "interferomet",
  "sensing", "sensor", "metrology", "precision measurement",
  "gyroscope", "magnetometer", "magnetometry",
  "optical pump", "EIT", "SERF", "Sagnac", "NOON",
  "spin squeez", "Rydberg", "quantum memory",
  "four-wave mix", "parametric down", "homodyne",
  "electromagnetically induced", "gradient echo",
  "Faraday", "cold atom", "Bose-Einstein", "BEC",
];

const JOURNAL_COMPREHENSIVE = [
  "nature communications", "science advances", "science",
  "proceedings of the national academy", "science china",
  "nature", "physical review research",
];

const JOURNAL_WHITELIST = [
  "physical review letters", "physical review a", "physical review x",
  "optica", "optics letters", "optics express", "optica quantum",
  "nature photonics", "nature physics",
  "laser & photonics review", "light: science & applications",
  "npj quantum information", "quantum",
  "new journal of physics",
];

const JOURNAL_GRAYLIST = [
  "photonics research", "apl photonics", "avs quantum science",
  "epj quantum technology", "ieee transactions on instrumentation",
  "measurement", "sensors", "photonics", "applied physics letters",
  "optics continuum", "journal of the optical society of america",
  "quantum science and technology", "communications physics",
  "physical review applied", "quantum reports",
  "chinese physics", "journal of physics b",
];

function classifyJournal(journalName) {
  if (!journalName) return { tier: "gray", priority: 3 };
  const lower = journalName.toLowerCase().trim();
  for (const w of JOURNAL_WHITELIST) {
    if (lower.includes(w)) return { tier: "white", priority: 1 };
  }
  for (const g of JOURNAL_GRAYLIST) {
    if (lower.includes(g)) return { tier: "gray", priority: 2 };
  }
  return { tier: "other", priority: 3 };
}

// 鈹€鈹€ HTTP helpers with exponential backoff 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€


async function fetchWithRetry(url, opts = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 15000);
      const response = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timeout);
      if (response.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.error(`  Rate limited (429), retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (attempt < retries) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.error(`  Attempt ${attempt + 1} failed: ${err.message}, retry in ${wait}ms`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 鈹€鈹€ OpenAlex search 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function searchOpenAlex(query, fromDate, perPage = 15) {
  const encoded = encodeURIComponent(query);
  const url = `https://api.openalex.org/works?search=${encoded}&filter=from_publication_date:${fromDate},type:article&sort=publication_date:desc&per_page=${perPage}&select=id,doi,title,publication_date,authorships,primary_location,abstract_inverted_index,open_access`;
  console.error(`  OpenAlex: ${query.substring(0, 60)}...`);
  const data = await fetchWithRetry(url, { timeoutMs: 20000 });
  return (data.results || []).map(paper => {
    const journal = paper.primary_location?.source?.display_name || "";
    const authors = (paper.authorships || []).map(a => a.author?.display_name || "").filter(Boolean);
    let abstract = "";
    if (paper.abstract_inverted_index) {
      const idx = paper.abstract_inverted_index;
      const words = [];
      for (const [word, positions] of Object.entries(idx)) {
        for (const p of positions) words[p] = word;
      }
      abstract = words.join(" ");
    }
    const { tier, priority } = classifyJournal(journal);
    return {
      doi: paper.doi || "",
      title: paper.title || "",
      date: paper.publication_date || "",
      journal,
      authors: authors.slice(0, 5),
      abstract: abstract.substring(0, 1000),
      oa: paper.open_access?.is_oa || false,
      oa_url: paper.open_access?.oa_url || "",
      tier,
      priority,
    };
  });
}

// 鈹€鈹€ Crossref search (fallback) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function searchCrossref(query, fromDate, rows = 15) {
  const encoded = encodeURIComponent(query);
  const url = `https://api.crossref.org/works?query=${encoded}&filter=from-pub-date:${fromDate},type:journal-article&rows=${rows}&sort=published&order=desc`;
  console.error(`  Crossref: ${query.substring(0, 60)}...`);
  const data = await fetchWithRetry(url, { timeoutMs: 20000 });
  return (data.message?.items || []).map(item => {
    const journal = item["container-title"]?.[0] || "";
    const authors = (item.author || []).map(a => `${a.given || ""} ${a.family || ""}`.trim());
    const { tier, priority } = classifyJournal(journal);
    return {
      doi: item.DOI || "",
      title: item.title?.[0] || "",
      date: item.created?.["date-time"]?.substring(0, 10) || "",
      journal,
      authors: authors.slice(0, 5),
      abstract: (item.abstract || "").replace(/<[^>]+>/g, "").substring(0, 1000),
      oa: false,
      oa_url: "",
      tier,
      priority,
    };
  });
}

// 鈹€鈹€ Dedup 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

 function normalizeDoi(doi) {
   if (!doi) return '';
   let d = doi.trim();
   d = d.replace(/^https?:\/\/doi\.org\//i, '');
   d = d.replace(/^https?:\/\/dx\.doi\.org\//i, '');
   try { d = decodeURIComponent(d); } catch (_) {}
   d = d.replace(/\?.*$/, '');
   d = d.replace(/#.*$/, '');
   d = d.replace(/\.(pdf|xml|html?|txt|png|jpe?g|gif|eps)$/i, '');
   d = d.replace(/\/+$/, '');
   d = d.toLowerCase();
   return d;
 }



function loadPushedDois() {
  const path = resolve(REPO_ROOT, "data", "pushed_papers.json");
  if (!existsSync(path)) return new Set();
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return new Set(data.map(p => normalizeDoi(p.doi)));
  } catch {
    return new Set();
  }
}

function dedupPapers(papers, pushedDois) {
  return papers.filter(p => {
    if (!p.doi) return false;
    if (pushedDois.has(normalizeDoi(p.doi))) {
      console.error("  SKIP (dup): " + p.title.substring(0, 60));
      return false;
    }
    return true;
  });
}

function isRelevant(abstract, title) {
  const text = ((abstract || "") + " " + (title || "")).toLowerCase();
  return RELEVANCE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

function filterRelevant(papers) {
  return papers.filter(p => {
    if (!p.needsContentCheck) return true;
    const relevant = isRelevant(p.abstract, p.title);
    if (!relevant) {
      console.error("  SKIP (irrelevant): [" + p.tier + "] " + p.journal + " - " + (p.title || "").substring(0, 60));
    }
    return relevant;
  });
}


const KEYWORD_POOLS = [
  { name: "quantum interferometer", keywords: ["SU(1,1) interferometer", "quantum-enhanced interferometer", "nonlinear interferometer squeezed", "Heisenberg-limited interferometry"] },
  { name: "hot-atom squeezed light", keywords: ["squeezed light atomic vapor", "four-wave mixing atomic squeezing", "polarization squeezing hot atoms", "quantum noise reduction atomic vapor"] },
  { name: "quantum memory", keywords: ["quantum memory atomic vapor", "electromagnetically induced transparency quantum memory", "gradient echo memory atomic", "room temperature quantum memory"] },
  { name: "optically pumped magnetometer", keywords: ["optically pumped magnetometer atomic vapor", "SERF magnetometer", "spin-exchange relaxation-free magnetometer", "atomic magnetometer high sensitivity"] },
  { name: "quantum gyroscope", keywords: ["quantum gyroscope optical fiber", "quantum-enhanced Sagnac interferometer", "fiber optic gyroscope quantum noise", "atom interferometer rotation sensing"] },
  { name: "distributed quantum sensing", keywords: ["distributed quantum sensing optical", "quantum sensor network optical", "entanglement-enhanced optical sensing", "multiparameter estimation quantum optical"] },
  { name: "Rydberg sensing", keywords: ["Rydberg atom sensing", "Rydberg electrometry", "Rydberg quantum metrology", "Rydberg atom interferometer"] },
];

function autoRotateKeywords() {
  const memPath = resolve(REPO_ROOT, "data", "memory.json");
  let history = [];
  if (existsSync(memPath)) {
    try {
      const mem = JSON.parse(readFileSync(memPath, "utf-8"));
      history = mem.keyword_rotation_history || [];
    } catch {}
  }
  const recentNames = new Set(history.slice(-7).map(h => h.name));
  for (const pool of KEYWORD_POOLS) {
    if (!recentNames.has(pool.name)) {
      console.error("Auto-rotated to: " + pool.name);
      return { keywords: pool.keywords, poolName: pool.name };
    }
  }
  const oldest = history[0]?.name || KEYWORD_POOLS[0].name;
  const pool = KEYWORD_POOLS.find(p => p.name === oldest) || KEYWORD_POOLS[0];
  console.error("All pools rotated recently, reusing oldest: " + pool.name);
  return { keywords: pool.keywords, poolName: pool.name };
}


export async function searchPapers(keywords, options = {}) {
  const {
    daysBack = 180,
    maxResults = 30,
    strictMode = false,
    poolName = "manual",
  } = options;

  const fromDate = new Date(Date.now() - daysBack * 86400000).toISOString().substring(0, 10);
  const pushedDois = loadPushedDois();
  console.error("Pushed DOIs loaded: " + pushedDois.size);
  console.error("Strict mode: " + strictMode);

  let allPapers = [];

  for (const kw of keywords) {
    try {
      let results = await searchOpenAlex(kw, fromDate, strictMode);
      allPapers.push(...results);
    } catch (err) {
      console.error('  OpenAlex failed for "' + kw + '": ' + err.message + ', trying Crossref...');
      try {
        let results = await searchCrossref(kw, fromDate, strictMode);
        allPapers.push(...results);
      } catch (err2) {
        console.error("  Crossref also failed: " + err2.message);
      }
    }
    await sleep(500);
  }

  // Self-dedup
  const seen = new Set();
  const unique = [];
  for (const p of allPapers) {
    const key = p.doi || p.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }

  // Content-based relevance filter
  const relevant = filterRelevant(unique);
  console.error("Relevance filter: " + unique.length + " -> " + relevant.length);

  // Dedup against pushed papers
  const deduped = dedupPapers(relevant, pushedDois);

  // Strict mode: only white-tier
  const final = strictMode ? deduped.filter(p => p.tier === "white") : deduped;

  // Sort by tier then date
  const tierOrder = { white: 0, comprehensive: 1, gray: 2, other: 3 };
  final.sort((a, b) => {
    const ta = tierOrder[a.tier] ?? 3;
    const tb = tierOrder[b.tier] ?? 3;
    if (ta !== tb) return ta - tb;
    return (b.date || "").localeCompare(a.date || "");
  });

  console.error("\nPipeline: " + allPapers.length + " raw -> " + unique.length + " unique -> " + relevant.length + " relevant -> " + deduped.length + " deduped -> " + final.length + " final");
  return { papers: final.slice(0, maxResults), poolName };
}


async function main() {
  const args = process.argv.slice(2);
  let keywords = ["quantum sensing squeezed light", "quantum interferometer experiment"];
  let daysBack = 180;
  let outFile = null;
  let strictMode = false;
  let autoRotate = false;
  let poolName = "manual";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keywords" && args[i + 1]) {
      keywords = args[i + 1].split(",").map(s => s.trim());
      i++;
    } else if (args[i] === "--days" && args[i + 1]) {
      daysBack = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--out" && args[i + 1]) {
      outFile = args[i + 1];
      i++;
    } else if (args[i] === "--strict") {
      strictMode = true;
    } else if (args[i] === "--auto-rotate") {
      autoRotate = true;
    }
  }

  if (autoRotate) {
    const rotated = autoRotateKeywords();
    keywords = rotated.keywords;
    poolName = rotated.poolName;
  }

  console.error("Searching with " + keywords.length + " keywords, " + daysBack + " days back, strict=" + strictMode + "...");
  const { papers, poolName: usedPool } = await searchPapers(keywords, { daysBack, strictMode, poolName });

  // Update keyword rotation history
  if (autoRotate || poolName !== "manual") {
    const memPath = resolve(REPO_ROOT, "data", "memory.json");
    let mem = {};
    if (existsSync(memPath)) {
      try { mem = JSON.parse(readFileSync(memPath, "utf-8")); } catch {}
    }
    if (!mem.keyword_rotation_history) mem.keyword_rotation_history = [];
    mem.keyword_rotation_history.push({ date: new Date().toISOString().substring(0, 10), name: usedPool || poolName, keywords });
    writeFileSync(memPath, JSON.stringify(mem, null, 2), "utf-8");
  }

  const output = JSON.stringify(papers, null, 2);
  if (outFile) {
    writeFileSync(outFile, output, "utf-8");
    console.error("Results written to " + outFile);
  }
  console.log(output);
}

const isMain = process.argv[1] && process.argv[1].includes("search_and_filter");
if (isMain) {
  main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
}
