import fs from "node:fs";
import { Octokit } from "@octokit/rest";

const token = process.env.GITHUB_TOKEN;
const repoFull = process.env.GITHUB_REPOSITORY || "";
const sha = process.env.GITHUB_SHA || "";
const [owner, repo] = repoFull.split("/");

if (!token || !owner || !repo || !sha) {
  console.error("Missing GitHub context/environment.");
  process.exit(1);
}

const reportPath = "./.baseline/report.json";
if (!fs.existsSync(reportPath)) {
  console.error("Report not found at .baseline/report.json");
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

const octokit = new Octokit({ auth: token });

const annotations = [];
for (const usage of Object.values(report.features)) {
  const level = usage.severity === "error" ? "failure" : usage.severity === "warn" ? "warning" : "notice";
  for (const h of usage.hits.slice(0, 30)) {
    annotations.push({
      path: h.file.replace(process.cwd()+"\\","").replace(process.cwd()+"/",""),
      start_line: h.line,
      end_line: h.line,
      annotation_level: level,
      message: `[${usage.id}] ${usage.status.toUpperCase()} — coverage ${usage.coverage}% ${usage.mdn ? `| ${usage.mdn}` : ""}`,
      title: "Baseline Flightdeck"
    });
  }
}

await octokit.checks.create({
  owner, repo,
  name: "Baseline Flightdeck",
  head_sha: sha,
  status: "completed",
  conclusion: report.summary.violations.length ? "failure" : "success",
  output: {
    title: "Baseline Flightdeck",
    summary: `Coverage ${report.summary.achieved}% (budget ${report.summary.coverageBudget}%). Violations: ${report.summary.violations.length}, Warnings: ${report.summary.warnings.length}`,
    annotations
  }
});

console.log(`Posted ${annotations.length} annotations.`);
