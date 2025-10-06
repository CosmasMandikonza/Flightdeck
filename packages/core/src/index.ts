import fs from "node:fs";
import path from "node:path";
import * as babel from "@babel/parser";
import traverse from "@babel/traverse";
import postcss from "postcss";
import parse5 from "parse5";
import browserslist from "browserslist";
import semver from "semver";

// --- Types
export type FeatureStatus = "widely" | "newly" | "none";
export interface FeatureInfo {
  id: string;
  title: string;
  status: FeatureStatus;          // Baseline status
  mdn?: string;                   // docs link
  browsers: Record<string,string>; // min versions per browser (if known)
}
export interface ScanOptions {
  srcDir: string;
  analyticsCsv?: string; // ua,share (%)
  browserslistQuery?: string;
  outDir?: string;
}
export interface ScanResult {
  features: Record<string, {
    count: number;
    status: FeatureStatus;
    coverage: number; // % users supported if analytics provided or browserslist coverage
    browsers: Record<string,string>;
    mdn?: string;
    sampleFiles: string[];
  }>;
  violations: string[]; // ids with status "none"
  warnings: string[];   // ids with status "newly"
}

// --- Tiny cache shipped with repo so demo works offline:
const fallbackFeaturesPath = path.resolve(process.cwd(), "data/baseline-features.min.json");
const fallbackLinksPath = path.resolve(process.cwd(), "data/mdn-links.min.json");

// Load feature table (prefer local freshly fetched, else fallback)
function loadFeaturesTable(): Record<string,FeatureInfo> {
  // In a real environment we’d import web-features JSON.
  const raw = fs.readFileSync(fallbackFeaturesPath,"utf-8");
  const table = JSON.parse(raw) as FeatureInfo[];
  const links = JSON.parse(fs.readFileSync(fallbackLinksPath,"utf-8")) as Record<string,string>;
  const map: Record<string,FeatureInfo> = {};
  for (const f of table) {
    map[f.id] = { ...f, mdn: links[f.id] ?? f.mdn };
  }
  return map;
}

// Very small alias map (expand via fetch script)
// key: code pattern → feature id
const JS_ALIASES: Record<string,string> = {
  "navigator.clipboard": "clipboard-api",
  "document.startViewTransition": "view-transitions",
  "HTMLDialogElement": "dialog-element",
  "Element.prototype.togglePopover": "popover-attribute",
};
const CSS_ALIASES: Record<string,string> = {
  ":has": "selector-has",
  "dialog": "dialog-element",
  "popover": "popover-attribute",
};
const HTML_ALIASES: Record<string,string> = {
  "dialog": "dialog-element",
  "popovertarget": "popover-attribute",
  "fetchpriority": "fetch-priority-attribute"
};

// Parse analytics CSV (ua,share). Optional.
function parseAnalyticsCsv(p?: string): Record<string, number> {
  if (!p || !fs.existsSync(p)) return {};
  const rows = fs.readFileSync(p,"utf-8").split(/\r?\n/).filter(Boolean);
  const out: Record<string,number> = {};
  for (const line of rows.slice(1)) {
    const [ua,share] = line.split(",");
    const s = Number(share);
    if (ua && !Number.isNaN(s)) out[ua.trim()] = s;
  }
  return out;
}

// Very rough coverage estimation: if we have min versions per browser,
// and analytics or browserslist coverage, compute a % “supported”.
function estimateCoverage(min: Record<string,string>, analytics: Record<string,number>, blq?: string): number {
  // Simplified: if analytics provided, assume UAs are keys like "chrome", "firefox", ... (lowercased)
  let sum = 0;
  let covered = 0;
  const keys = Object.keys(analytics);
  if (keys.length) {
    for (const k of keys) {
      const share = analytics[k] ?? 0;
      sum += share;
      if (min[k]) covered += share; // assume majority on ≥ min version (demo simplification)
    }
    return sum ? Math.round((covered / sum) * 100) : 0;
  }
  // Otherwise browserslist-based approximation: if a browser is in min, we count it.
  const q = blq ?? ">0.5%, not dead";
  const selected = browserslist(q);
  const seen = new Set<string>();
  for (const entry of selected) {
    const b = entry.split(" ")[0].toLowerCase();
    seen.add(b);
  }
  let have = 0;
  for (const b of seen) if (min[b]) have++;
  return seen.size ? Math.round((have / seen.size) * 100) : 0;
}

// Collect files
function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (/\.(m?[jt]sx?|css|html?)$/.test(entry)) acc.push(full);
  }
  return acc;
}

export async function scanProject(opts: ScanOptions): Promise<ScanResult> {
  const { srcDir, analyticsCsv, browserslistQuery, outDir } = opts;
  const features = loadFeaturesTable();
  const analytics = parseAnalyticsCsv(analyticsCsv);
  const result: ScanResult = { features: {}, violations: [], warnings: [] };

  const files = walk(srcDir);
  for (const file of files) {
    const code = fs.readFileSync(file, "utf-8");
    if (/\.(m?[jt]sx?)$/.test(file)) {
      const ast = babel.parse(code, { sourceType: "unambiguous", plugins: ["typescript","jsx"] });
      traverse(ast, {
        MemberExpression(p) {
          const text = `${p.node.object && ("name" in p.node.object ? p.node.object.name : "")}.${"name" in p.node.property ? p.node.property.name : ""}`;
          if (JS_ALIASES[text]) record(JS_ALIASES[text], file);
        },
        Identifier(p) {
          const name = p.node.name;
          if (JS_ALIASES[name]) record(JS_ALIASES[name], file);
        },
        NewExpression(p) {
          if (p.node.callee && "name" in p.node.callee) {
            const name = p.node.callee.name;
            if (JS_ALIASES[name]) record(JS_ALIASES[name], file);
          }
        }
      });
    } else if (/\.css$/.test(file)) {
      const root = postcss.parse(code);
      root.walkRules(rule => {
        if (rule.selector.includes(":has")) record(CSS_ALIASES[":has"], file);
        if (rule.selector.includes("dialog")) record(CSS_ALIASES["dialog"], file);
      });
      root.walkDecls(decl => {
        if (decl.prop.includes("popover") || decl.value.includes("popover")) {
          record(CSS_ALIASES["popover"], file);
        }
      });
    } else if (/\.html?$/.test(file)) {
      const doc = parse5.parse(code) as any;
      const visit = (node: any) => {
        if (node.nodeName && HTML_ALIASES[node.nodeName]) record(HTML_ALIASES[node.nodeName], file);
        if (node.attrs) {
          for (const a of node.attrs) {
            if (HTML_ALIASES[a.name]) record(HTML_ALIASES[a.name], file);
          }
        }
        if (node.childNodes) node.childNodes.forEach(visit);
      };
      visit(doc);
    }
  }

  function record(id: string, file: string) {
    const f = features[id];
    if (!f) return;
    const bucket = result.features[id] ?? {
      count: 0,
      status: f.status,
      coverage: 0,
      browsers: f.browsers,
      mdn: f.mdn,
      sampleFiles: []
    };
    bucket.count++;
    if (bucket.sampleFiles.length < 5) bucket.sampleFiles.push(file);
    result.features[id] = bucket;
  }

  // finalize coverage + violations/warnings
  for (const [id, f] of Object.entries(result.features)) {
    const base = features[id];
    f.coverage = estimateCoverage(base.browsers, analytics, browserslistQuery);
    if (f.status === "none") result.violations.push(id);
    else if (f.status === "newly") result.warnings.push(id);
  }

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(outDir, "index.html"), renderHtml(result));
  }
  return result;
}

function renderHtml(r: ScanResult): string {
  const rows = Object.entries(r.features).map(([id,f]) => `
    <tr>
      <td><code>${id}</code></td>
      <td>${f.status}</td>
      <td>${f.coverage}%</td>
      <td>${Object.entries(f.browsers).map(([b,v])=>`${b}≥${v}`).join(", ")}</td>
      <td>${f.mdn ? `<a href="${f.mdn}" target="_blank">MDN</a>` : "-"}</td>
      <td>${f.sampleFiles.slice(0,2).map(s=>s.replace(process.cwd()+"/","")).join("<br/>")}</td>
    </tr>
  `).join("");
  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<title>Baseline Flightdeck Report</title>
<style>
body{font-family:ui-sans-serif,system-ui; padding:20px;}
table{border-collapse:collapse; width:100%;}
th,td{border:1px solid #ddd; padding:8px; font-size:14px;}
th{background:#f6f7f9; text-align:left;}
.badge{display:inline-block; padding:4px 8px; border-radius:8px; background:#eef;}
</style>
</head><body>
<h1>Baseline Flightdeck</h1>
<p class="badge">Violations: ${r.violations.length} • Warnings: ${r.warnings.length}</p>
<table>
<thead><tr><th>Feature</th><th>Status</th><th>Coverage</th><th>Min Browsers</th><th>Docs</th><th>Examples</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}
