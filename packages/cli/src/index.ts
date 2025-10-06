//!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import * as path from "node:path";
import * as fs from "node:fs";
import { scanProject } from "@flightdeck/core";

const program = new Command();
program.name("baseline-flightdeck").description("Baseline Flightdeck CLI").version("0.1.0");

program.command("scan")
  .requiredOption("--src <path>", "Source directory")
  .option("--report <outDir>", "Write HTML/JSON report to this directory")
  .option("--analytics <csv>", "Analytics CSV (ua,share)")
  .option("--browserslist <query>", "Browserslist query string (overrides .flightdeckrc)")
  .action(async (opts) => {
    const srcDir = path.resolve(process.cwd(), opts.src);
    if (!fs.existsSync(srcDir)) {
      console.error(pc.red("Source directory not found: " + srcDir));
      process.exit(2);
    }
    const outDir = opts.report ? path.resolve(process.cwd(), opts.report) : undefined;
    const res: any = await scanProject({ srcDir, outDir, config: undefined });

    console.log(pc.bold("Baseline Flightdeck:"));
    console.log("Violations (not yet Baseline or below coverage): " + res.summary.violations.length);
    console.log("Warnings (newly / budget): " + res.summary.warnings.length);
    console.log("Coverage: " + res.summary.achieved + "% (budget " + res.summary.coverageBudget + "%)");

    if (res.summary.violations.length) process.exit(2);
    if (res.summary.warnings.length) process.exit(1);
    process.exit(0);
  });

program.command("advise")
  .requiredOption("--src <path>", "Source directory (same as in scan)")
  .option("--report <outDir>", "Report directory (default: ./.baseline in src)")
  .option("--write", "Write suggestions.md inside report dir", false)
  .action(async (opts) => {
    const srcDir = path.resolve(process.cwd(), opts.src);
    if (!fs.existsSync(srcDir)) {
      console.error(pc.red("Source directory not found: " + srcDir));
      process.exit(2);
    }
    const defaultReport = path.join(srcDir, ".baseline");
    const outDir = path.resolve(process.cwd(), opts.report ?? defaultReport);
    const jsonPath = path.join(outDir, "report.json");

    let result: any = null;
    if (fs.existsSync(jsonPath)) {
      result = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    } else {
      result = await scanProject({ srcDir, outDir, config: undefined });
    }

    const md = renderAdvice(result);
    if (opts.write) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "suggestions.md"), md);
      console.log(pc.green(" Wrote " + path.join(outDir, "suggestions.md")));
    } else {
      console.log(md);
    }
  });

program.parse(process.argv);

/* ---------------- Advice rendering ---------------- */
function renderAdvice(res: any): string {
  const lines: string[] = [];
  lines.push("# Baseline Flightdeck  Developer Advisor");
  lines.push("");
  lines.push("**Coverage:** " + res.summary.achieved + "% (budget " + res.summary.coverageBudget + "%)");
  lines.push("**Violations:** " + res.summary.violations.length + " | **Warnings:** " + res.summary.warnings.length);
  lines.push("");
  lines.push("## Quick wins");
  lines.push("- Wrap modern CSS in `@supports(...)` to soften risk");
  lines.push("- Use JS feature detection guards to enable progressive enhancement");
  lines.push("- Adjust `analyticsCsv` or `browserslist` to reflect your real audience");
  lines.push("- Use `.flightdeckrc.json` overrides for truly optional features");
  lines.push("");

  const items = Object.values(res.features).sort((a: any, b: any) => {
    const sev = (s: string) => s === "error" ? 2 : s === "warn" ? 1 : 0;
    return sev((b as any).severity) - sev((a as any).severity) || (b as any).count - (a as any).count;
  });

  for (const u of items as any[]) {
    const title = "**" + u.id + "**  " + String(u.status).toUpperCase() + " | coverage " + u.coverage + "%";
    const mdn = u.mdn ? " ([MDN](" + u.mdn + "))" : "";
    const sev = u.severity === "error" ? " error" : u.severity === "warn" ? " warn" : "? info";
    lines.push("### " + title + mdn);
    lines.push("Severity: " + sev);
    lines.push("");
    lines.push(renderRemediation(u.id));
    lines.push("");
    lines.push(renderHits((u.hits ?? []).slice(0, 10)));
    lines.push("");
  }
  lines.push("---");
  lines.push("**Config levers:**");
  lines.push("- `.flightdeckrc.json > coverageBudget`");
  lines.push("- `.flightdeckrc.json > treatNewlyAsViolation`");
  lines.push("- `.flightdeckrc.json > overrides[feature].severity|minCoverage`");
  lines.push("- `.flightdeckrc.json > ignore`");
  return lines.join("\n");
}

function renderHits(hits: {file:string;line:number;column:number;snippet:string}[]): string {
  if (!hits.length) return "_No direct hits captured._";
  const rows = hits.map(h => "- `" + h.file + ":" + h.line + "`  `" + h.snippet + "`");
  return ["**Top occurrences:**", ...rows].join("\n");
}

function renderRemediation(id: string): string {
  switch (id) {
    case "selector-has":
      return [
        "**CSS :has()**",
        "- Wrap usage in `@supports(selector(:has(*))) { ... }`",
        "- Provide a fallback selector for non-supporting browsers.",
        "```css",
        "@supports(selector(:has(*))) {",
        "  .card:has(button){ outline: 1px solid #ddd; }",
        "}",
        "```"
      ].join("\n");
    case "view-transitions":
      return [
        "**View Transitions API**",
        "- Guard with feature detection; provide non-animated fallback.",
        "```js",
        "if ('startViewTransition' in document) {",
        "  document.startViewTransition(() => { /* state update */ });",
        "} else {",
        "  // fallback update",
        "}",
        "```"
      ].join("\n");
    case "popover-attribute":
      return [
        "**Popover**",
        "- Add light JS fallback (toggle hidden) and/or `dialog` as alternative.",
        "```js",
        "const el = document.getElementById('p1');",
        "if (!('togglePopover' in Element.prototype)) {",
        "  // simple fallback:",
        "  el.hidden = !el.hidden;",
        "}",
        "```"
      ].join("\n");
    case "dialog-element":
      return [
        "**<dialog>**",
        "- Keep usage; provide `nosupport` fallback if needed.",
        "```html",
        "<dialog id=\"dlg\"><p>Hi!</p></dialog>",
        "<noscript><div role=\"dialog\">Hi!</div></noscript>",
        "```"
      ].join("\n");
    case "clipboard-api":
      return [
        "**Clipboard API**",
        "- Use optional chaining / try-catch to protect older browsers.",
        "```js",
        "try {",
        "  navigator.clipboard?.readText?.().then(t => console.log(t));",
        "} catch {}",
        "```"
      ].join("\n");
    default:
      return "_Use progressive enhancement (JS guards / `@supports`) or `.flightdeckrc.json` overrides as appropriate._";
  }
}
