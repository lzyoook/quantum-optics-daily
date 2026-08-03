// weekly_pipeline.mjs ? Unified weekly report pipeline (Workflow B)
// Usage: node weekly_pipeline.mjs [--dry-run]
// Collects: daily papers from past week + supplementary search + enterprise/policy news -> MD report + email

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const NODE = process.execPath;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ?? Week range ???????????????????????????????????????????????????????

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    monday: monday.toISOString().substring(0, 10),
    friday: friday.toISOString().substring(0, 10),
    weekNum: Math.ceil((monday - new Date(monday.getFullYear(), 0, 1)) / 86400000 / 7),
  };
}

// ?? Step 1: Weekly pushed papers ?????????????????????????????????????

function getWeekPushedPapers(weekMonday) {
  const path = resolve(REPO_ROOT, "data", "pushed_papers.json");
  if (!existsSync(path)) return [];
  const all = JSON.parse(readFileSync(path, "utf-8"));
  return all.filter(p => p.first_pushed >= weekMonday);
}

// ?? Step 2: Supplementary search ?????????????????????????????????????

async function runSupplementarySearch() {
  const script = resolve(__dirname, "search_and_filter.mjs");
  const outFile = resolve(REPO_ROOT, "data", "weekly_search_results.json");
  const cmd = `"${NODE}" "${script}" --auto-rotate --days 90 --out "${outFile}"`;
  console.error("Running supplementary search...");
  try {
    execSync(cmd, { stdio: "inherit", timeout: 120000 });
    if (existsSync(outFile)) {
      return JSON.parse(readFileSync(outFile, "utf-8"));
    }
    return [];
  } catch (err) {
    console.error("Supplementary search failed:", err.message);
    return [];
  }
}

// ?? Step 3: Enterprise & policy news ?????????????????????????????????

async function runNewsSearch() {
  const script = resolve(__dirname, "search_news.js");
  console.error("Running enterprise/policy search...");
  try {
    const mod = await import(`file:///${script.replace(/\\/g, "/")}`);
    const results = await mod.searchAll();
    return results || { enterprise: [], policy: [] };
  } catch (err) {
    console.error("News search failed:", err.message);
    return { enterprise: [], policy: [] };
  }
}

// ?? Step 4: Generate Markdown report ??????????????????????????????????

function generateMdReport(reportData, weekInfo) {
  const { dailyPapers, supplementaryPapers, enterpriseNews, policyNews } = reportData;
  const { monday, friday, weekNum } = weekInfo;

  let lines = [];
  lines.push(`# ???????? ? ??????`);
  lines.push(`## ?${weekNum}? ? ${monday} ? ${friday}`);
  lines.push("");
  lines.push(`**????**?${new Date().toISOString().substring(0, 10)} | ?????`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Section 1: This week's pushed papers
  lines.push("## ????????");
  lines.push("");
  if (dailyPapers.length === 0) {
    lines.push("??????????");
  } else {
    const mainPapers = dailyPapers.filter(p => p.pushed_as === "main");
    const recPapers = dailyPapers.filter(p => p.pushed_as === "recommended");
    lines.push(`????? ${dailyPapers.length} ????${mainPapers.length} ????? + ${recPapers.length} ???????`);
    lines.push("");
    if (mainPapers.length > 0) {
      lines.push("### ????");
      mainPapers.forEach((p, i) => {
        lines.push(`${i + 1}. DOI: [${p.doi}](https://doi.org/${p.doi})?${p.first_pushed}?`);
      });
      lines.push("");
    }
  }

  // Section 2: Supplementary discoveries
  lines.push("## ????????");
  lines.push("");
  if (supplementaryPapers.length === 0) {
    lines.push("???????????");
  } else {
    lines.push(`?????? ${supplementaryPapers.length} ????????`);
    lines.push("");
    supplementaryPapers.slice(0, 10).forEach((p, i) => {
      const journal = p.journal || "unknown";
      lines.push(`${i + 1}. **${p.title || "N/A"}** ? ${journal} (${p.date || "N/A"})`);
      if (p.doi) lines.push(`   DOI: [${p.doi}](https://doi.org/${p.doi})`);
      if (p.abstract) lines.push(`   > ${p.abstract.substring(0, 200)}...`);
      lines.push("");
    });
  }

  // Section 3: Enterprise news
  lines.push("## ??????");
  lines.push("");
  if (enterpriseNews.length === 0) {
    lines.push("??????????");
  } else {
    enterpriseNews.forEach((item, i) => {
      lines.push(`${i + 1}. **${item.title || "N/A"}**`);
      if (item.source) lines.push(`   ???${item.source}`);
      if (item.url) lines.push(`   ???${item.url}`);
      if (item.snippet) lines.push(`   > ${item.snippet}`);
      lines.push("");
    });
  }

  // Section 4: Policy updates
  lines.push("## ??????");
  lines.push("");
  if (policyNews.length === 0) {
    lines.push("??????????");
  } else {
    policyNews.forEach((item, i) => {
      lines.push(`${i + 1}. **${item.title || "N/A"}**`);
      if (item.source) lines.push(`   ???${item.source}`);
      if (item.url) lines.push(`   ???${item.url}`);
      if (item.snippet) lines.push(`   > ${item.snippet}`);
      lines.push("");
    });
  }

  lines.push("---");
  lines.push("");
  lines.push(`*?????${new Date().toISOString()} | ????Codex quantum-optics-daily workflow B*`);

  return lines.join("\n");
}

// ?? Step 5: Save and send ????????????????????????????????????????????

async function saveAndSend(mdContent, weekInfo) {
  const reportDir = resolve(REPO_ROOT, "reports", weekInfo.friday.substring(0, 4), weekInfo.friday.substring(5, 7));
  mkdirSync(reportDir, { recursive: true });
  const mdPath = resolve(reportDir, `${weekInfo.friday}-??.md`);
  writeFileSync(mdPath, mdContent, "utf-8");
  console.error(`Report saved: ${mdPath}`);

  // Send email
  try {
    const { sendReportEmail } = await import(`file:///${resolve(__dirname, "send_email.mjs").replace(/\\/g, "/")}`);
    await sendReportEmail(mdPath);
    console.error("Weekly report email sent");
  } catch (err) {
    console.error("Email failed:", err.message);
  }

  return mdPath;
}

// ?? Main pipeline ????????????????????????????????????????????????????

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const weekInfo = getWeekRange();

  console.error("=== Weekly Report Pipeline ===");
  console.error(`Week: ${weekInfo.weekNum} (${weekInfo.monday} - ${weekInfo.friday})`);

  // Step 1: Pushed papers
  const weekPapers = getWeekPushedPapers(weekInfo.monday);
  console.error(`Daily papers this week: ${weekPapers.length}`);

  // Step 2: Supplementary search
  const suppPapers = dryRun ? [] : await runSupplementarySearch();
  console.error(`Supplementary papers: ${suppPapers.length}`);

  // Step 3: News
  const news = dryRun ? { enterprise: [], policy: [] } : await runNewsSearch();
  console.error(`Enterprise: ${news.enterprise?.length || 0}, Policy: ${news.policy?.length || 0}`);

  // Step 4: Generate MD
  const reportData = {
    dailyPapers: weekPapers,
    supplementaryPapers: suppPapers.slice(0, 10),
    enterpriseNews: news.enterprise || [],
    policyNews: news.policy || [],
  };

  const mdContent = generateMdReport(reportData, weekInfo);

  // Step 5: Save + send
  let mdPath = "(dry-run, skipped)";
  if (!dryRun) {
    mdPath = await saveAndSend(mdContent, weekInfo);
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
  mem.last_weekly_run = {
    date: new Date().toISOString().substring(0, 10),
    week: weekInfo.weekNum,
    daily_papers_count: weekPapers.length,
    supplementary_count: suppPapers.length,
    enterprise_count: news.enterprise?.length || 0,
    policy_count: news.policy?.length || 0,
    md_path: mdPath,
  };
  mem.last_weekly_run_format = "markdown";
  writeFileSync(memPath, JSON.stringify(mem, null, 2), "utf-8");

  console.error("=== Pipeline complete ===");
}

main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
