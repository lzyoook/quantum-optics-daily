// daily_pipeline.mjs — Standalone daily paper report pipeline
// Runs without Codex AI: search -> filter -> abstract fetch -> MD report -> email
// Usage: node daily_pipeline.mjs [--dry-run]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const NODE = process.execPath;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ——— Date helpers ———

function todayStr() {
  return new Date().toISOString().substring(0, 10);
}

// ——— Step 1: Paper search via search_and_filter.mjs ———

async function runPaperSearch() {
  const script = resolve(__dirname, "search_and_filter.mjs");
  const outFile = resolve(REPO_ROOT, "data", "daily_search_results.json");
  const cmd = `"${NODE}" "${script}" --auto-rotate --days 7 --out "${outFile}"`;
  console.error("Running paper search (daily pipeline)...");
  try {
    execSync(cmd, { stdio: "inherit", timeout: 120000 });
    if (existsSync(outFile)) {
      return JSON.parse(readFileSync(outFile, "utf-8"));
    }
    return [];
  } catch (err) {
    console.error("Paper search failed:", err.message);
    return [];
  }
}

// ——— Step 2: Fetch abstracts for top papers ———

async function enrichPapers(papers) {
  // For each top-tier paper, try to fetch abstract via Crossref
  const enriched = [];
  for (const p of papers.slice(0, 10)) {
    const item = { ...p };
    if (!item.abstract && item.doi) {
      try {
        const url = `https://api.crossref.org/works/${item.doi}`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "quantum-optics-daily/1.0" },
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          const data = await resp.json();
          const abs = (data.message?.abstract || "").replace(/<[^>]+>/g, "").trim();
          if (abs) item.abstract = abs.substring(0, 1000);
        }
      } catch (e) {
        // skip abstract fetch failures
      }
    }
    enriched.push(item);
    await sleep(200); // rate limit
  }
  return enriched;
}

// ——— Step 3: Generate Markdown daily report ———

function generateDailyMd(papers, dateStr) {
  const lines = [];
  lines.push(`# 量子光学精密测量 · 文献日报`);
  lines.push(`## ${dateStr}`);
  lines.push("");
  lines.push(`**自动检索结果** | 未经过 AI 深度分析，仅提供文献元数据和摘要`);
  lines.push("");
  lines.push("---");
  lines.push("");

  if (papers.length === 0) {
    lines.push("今日未检索到新文献。");
    lines.push("");
  } else {
    const tierLabels = { white: "核心期刊", gray: "相关期刊", other: "其他来源" };

    // Group by tier
    for (const tier of ["white", "gray", "other"]) {
      const tierPapers = papers.filter(p => p.tier === tier);
      if (tierPapers.length === 0) continue;

      lines.push(`## ${tierLabels[tier] || tier} (${tierPapers.length}篇)`);
      lines.push("");

      tierPapers.forEach((p, i) => {
        lines.push(`### ${i + 1}. ${p.title || "N/A"}`);
        lines.push("");
        if (p.doi) lines.push(`- **DOI**: [${p.doi}](https://doi.org/${p.doi})`);
        if (p.journal) lines.push(`- **期刊**: ${p.journal}`);
        if (p.date) lines.push(`- **日期**: ${p.date}`);
        if (p.authors?.length) lines.push(`- **作者**: ${p.authors.slice(0, 5).join(", ")}`);
        if (p.abstract) {
          lines.push(`- **摘要**:`);
          lines.push(`  > ${p.abstract.substring(0, 500)}${p.abstract.length > 500 ? "..." : ""}`);
        }
        if (p.oa_url) lines.push(`- **OA全文**: ${p.oa_url}`);
        lines.push("");
      });
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`*自动生成于 ${new Date().toISOString()} | quantum-optics-daily daily-pipeline*`);
  lines.push(`*注意：本报告为自动检索结果，未经 AI 深度分析。如需深度分析，请在 Codex 中手动运行 Workflow A。*`);

  return lines.join("\n");
}

// ——— Step 4: Save & send email ———

async function saveAndSend(mdContent, dateStr) {
  const reportDir = resolve(REPO_ROOT, "reports", dateStr.substring(0, 4), dateStr.substring(5, 7));
  mkdirSync(reportDir, { recursive: true });
  const mdPath = resolve(reportDir, `${dateStr}-日报.md`);
  writeFileSync(mdPath, mdContent, "utf-8");
  console.error(`Daily report saved: ${mdPath}`);

  // Send email
  try {
    const { sendReportEmail } = await import(`file:///${resolve(__dirname, "send_email.mjs").replace(/\\/g, "/")}`);
    const result = await sendReportEmail(mdPath);
    console.error("Daily report email sent:", JSON.stringify(result));
  } catch (err) {
    console.error("Email failed:", err.message);
  }

  return mdPath;
}

// ——— Step 5: Update pushed_papers.json ———

function updatePushedPapers(papers, dateStr) {
  const path = resolve(REPO_ROOT, "data", "pushed_papers.json");
  let all = [];
  if (existsSync(path)) {
    try { all = JSON.parse(readFileSync(path, "utf-8")); } catch {}
  }

  const existingDois = new Set(all.map(p => (p.doi || "").toLowerCase().trim()));

  for (const p of papers) {
    const doi = (p.doi || "").toLowerCase().trim();
    if (!doi || existingDois.has(doi)) continue;
    all.push({
      doi: p.doi,
      title: p.title,
      journal: p.journal,
      date: p.date,
      tier: p.tier,
      first_pushed: dateStr,
      pushed_as: p.tier === "white" ? "main" : "recommended",
    });
    existingDois.add(doi);
  }

  writeFileSync(path, JSON.stringify(all, null, 2), "utf-8");
  console.error(`Updated pushed_papers.json: ${all.length} total`);
}

// ——— Main ———

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dateStr = todayStr();

  console.error("=== Daily Report Pipeline ===");
  console.error(`Date: ${dateStr}`);

  // Step 1: Search
  const papers = dryRun ? [] : await runPaperSearch();
  console.error(`Papers found: ${papers.length}`);

  // Step 2: Enrich with abstracts
  const enriched = dryRun ? papers : await enrichPapers(papers);
  console.error(`Enriched: ${enriched.length}`);

  // Step 3: Generate MD
  const mdContent = generateDailyMd(enriched, dateStr);

  // Step 4: Save + send
  if (!dryRun) {
    await saveAndSend(mdContent, dateStr);
    updatePushedPapers(enriched, dateStr);
  } else {
    console.error("[DRY RUN] Report preview:");
    console.error(mdContent.substring(0, 500));
  }

  // Update memory
  const memPath = resolve(REPO_ROOT, "data", "memory.json");
  let mem = {};
  if (existsSync(memPath)) {
    try { mem = JSON.parse(readFileSync(memPath, "utf-8")); } catch {}
  }
  mem.last_daily_run = {
    date: dateStr,
    papers_count: enriched.length,
    white_count: enriched.filter(p => p.tier === "white").length,
    gray_count: enriched.filter(p => p.tier === "gray").length,
  };
  writeFileSync(memPath, JSON.stringify(mem, null, 2), "utf-8");

  console.error("=== Daily pipeline complete ===");
}

main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
