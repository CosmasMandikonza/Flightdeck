import fs from "node:fs";
import path from "node:path";
import * as babel from "@babel/parser";
import traverse from "@babel/traverse";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import parse5 from "parse5";
import browserslist from "browserslist";

type Severity = "info"|"warn"|"error";
export type FeatureStatus = "widely"|"newly"|"none";

export interface FeatureMeta {
  id: string; title: string; status: FeatureStatus;
  mdn?: string; browsers: Record<string,string>;
}
export interface Hit {
  file: string; line: number; column: number; snippet: string;
}
export interface FeatureUsage {
  id: string; count: number; hits: Hit[];
  status: FeatureStatus; coverage: number;
  browsers: Record<string,string>; mdn?: string; severity: Severity;
  minCoverage?: number;
}
export interface ScanResult {
  features: Record<string, FeatureUsage>;
  summary: { violations: string[]; warnings: string[]; pass: boolean; coverageBudget: number; achieved: number };
}

export interface FlightdeckConfig {
  profile: "conservative"|"moderate"|"early";
  baselineYear: number;
  browserslist?: string;
  analyticsCsv?: string; // ua,share
  coverageBudget: number; // e.g., 95
  treatNewlyAsViolation: boolean;
  ignore: string[];
  overrides: Record<string,{ minCoverage?: number; severity?: Severity }>;
}

const projectRoot = process.cwd();
const readJSON = (p: string) => JSON.parse(fs.readFileSync(p,"utf-8"));
const FEATURES: Record<string,FeatureMeta> = readJSON(path.join(projectRoot,"data","features.json"));
const ALIASES: Record<string,string> = readJSON(path.join(projectRoot,"data","aliases.json"));

function loadConfig(cwd = projectRoot): FlightdeckConfig {
  const cfgPath = path.join(cwd, ".flightdeckrc.json");
  if (!fs.existsSync(cfgPath)) {
    // default moderate
    return {
      profile: "moderate", baselineYear: 2024, coverageBudget: 95,
      treatNewlyAsViolation: false, ignore: [], overrides: {}, browserslist: ">0.5%, not dead"
    };
  }
  return readJSON(cfgPath);
}

function parseAnalyticsCsv(p?: string): Record<string, number> {
  if (!p || !fs.existsSync(p)) return {};
  const rows = fs.readFileSync(p,"utf-8").split(/\r?\n/).filter(Boolean);
  const out: Record<string,number> = {};
  for (const [i,line] of rows.entries()) {
    if (i===0) continue;
    const [ua,share] = line.split(",");
    if (!ua) continue;
    const s = Number(share);
    if (!Number.isNaN(s)) out[ua.trim().toLowerCase()] = s;
  }
  return out;
}

// Blend browserslist (min version inclusion) with analytics distribution
function estimateCoverage(min: Record<string,string>, analytics: Record<string,number>, blq?: string): number {
  const keys = Object.keys(analytics);
  if (keys.length) {
    let total=0, covered=0;
    for (const k of keys) {
      const share = analytics[k];
      total += share;
      if (min[k]) covered += share; // assume UA meets min (we don’t parse versions from CSV)
    }
    return total ? Math.round(covered/total*100) : 0;
  }
  const selected = browserslist(blq ?? ">0.5%, not dead");
  const set = new Set<string>(selected.map(s => s.split(" ")[0].toLowerCase()));
  let have = 0; for (const b of set) if (min[b]) have++;
  return set.size ? Math.round(have/set.size*100) : 0;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir)) {
    const full = path.join(dir,e);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full,acc);
    else if (/\.(m?[jt]sx?|css|html?)$/.test(e)) acc.push(full);
  }
  return acc;
}

function addHit(usages: Record<string,FeatureUsage>, id: string, file: string, line: number, column: number, snippet: string) {
  const meta = FEATURES[id]; if (!meta) return;
  const u = usages[id] ?? {
    id, count: 0, hits: [], status: meta.status, coverage: 0,
    browsers: meta.browsers, mdn: meta.mdn, severity: "info"
  };
  u.count++; u.hits.push({ file, line, column, snippet });
  usages[id] = u;
}

// Progressive enhancement heuristics
function isProgressiveJS(context: string): boolean {
  return /\bif\s*\(\s*['"][\w$]+['"]\s*in\s*[A-Za-z0-9_.]+\s*\)/.test(context) || /try\s*{[\s\S]+}\s*catch\s*\(/.test(context);
}
function hasSupportsWrapper(cssText: string): boolean {
  return /@supports\s*\(/.test(cssText);
}

export async function scanProject(opts: { srcDir: string; config?: FlightdeckConfig; outDir?: string }): Promise<ScanResult> {
  const cfg = opts.config ?? loadConfig(opts.srcDir);
  const analytics = parseAnalyticsCsv(cfg.analyticsCsv ? path.resolve(projectRoot, cfg.analyticsCsv) : undefined);
  const usages: Record<string,FeatureUsage> = {};
  const files = walk(opts.srcDir);

  for (const file of files) {
    const code = fs.readFileSync(file,"utf-8");

    if (/\.(m?[jt]sx?)$/.test(file)) {
      const ast = babel.parse(code, { sourceType:"unambiguous", plugins: ["typescript","jsx"] });
      traverse(ast, {
        enter(p) {
          // MemberExpression like navigator.clipboard, document.startViewTransition
          if (p.isMemberExpression()) {
            const obj = p.node.object as any, prop = p.node.property as any;
            const text = `${obj?.name ?? (obj?.object?.name ? obj.object.name : "")}.${prop?.name ?? ""}`;
            const id = ALIASES[text];
            if (id) {
              const loc = p.node.loc?.start ?? { line: 1, column: 0 };
              const lineText = code.split("\n")[loc.line-1]?.trim() ?? "";
              addHit(usages, id, file, loc.line, loc.column, lineText);
              if (isProgressiveJS(lineText)) usages[id].severity = "warn"; // softened
            }
          }
          if (p.isIdentifier()) {
            const id = ALIASES[p.node.name];
            if (id) {
              const loc = p.node.loc?.start ?? { line:1, column:0 };
              const lineText = code.split("\n")[loc.line-1]?.trim() ?? "";
              addHit(usages, id, file, loc.line, loc.column, lineText);
              if (isProgressiveJS(lineText)) usages[id].severity = "warn";
            }
          }
        }
      });
    } else if (/\.css$/.test(file)) {
      const root = postcss.parse(code, { from: file });
      let wrapped = hasSupportsWrapper(code);
      root.walkRules(rule => {
        const parsed = selectorParser().astSync(rule.selector);
        parsed.walkPseudos(ps => {
          if (ps.value.includes(":has")) {
            const loc = (rule as any).source?.start ?? { line: 1, column: 0 };
            addHit(usages, ALIASES[":has"], file, loc.line, loc.column, rule.selector);
          }
        });
        if (rule.selector.includes("dialog")) {
          const loc = (rule as any).source?.start ?? { line: 1, column: 0 };
          addHit(usages, ALIASES["dialog"], file, loc.line, loc.column, rule.selector);
        }
      });
      root.walkDecls(decl => {
        if (decl.prop.includes("popover") || decl.value.includes("popover")) {
          const loc = (decl as any).source?.start ?? { line: 1, column: 0 };
          addHit(usages, ALIASES["popover"], file, loc.line, loc.column, `${decl.prop}: ${decl.value}`);
        }
      });
      if (wrapped) {
        // downgrade severity for all CSS hits in this file
        for (const u of Object.values(usages)) {
          if (u.hits.some(h => h.file===file)) if (u.severity==="info") u.severity = "warn";
        }
      }
    } else if (/\.html?$/.test(file)) {
      const doc = parse5.parse(code, { sourceCodeLocationInfo: true }) as any;
      const visit = (node: any) => {
        if (node.nodeName && ALIASES[node.nodeName]) {
          const loc = node.sourceCodeLocation?.startTag ?? node.sourceCodeLocation ?? { startLine: 1, startCol: 0 };
          const line = loc.startLine ?? 1, column = loc.startCol ?? 0;
          const lineText = code.split("\n")[line-1]?.trim() ?? "";
          addHit(usages, ALIASES[node.nodeName], file, line, column, lineText);
        }
        if (node.attrs) {
          for (const a of node.attrs) {
            if (ALIASES[a.name]) {
              const loc = node.sourceCodeLocation?.attrs?.[a.name] ?? { startLine: 1, startCol: 0 };
              const line = loc.startLine ?? 1, column = loc.startCol ?? 0;
              const lineText = code.split("\n")[line-1]?.trim() ?? "";
              addHit(usages, ALIASES[a.name], file, line, column, lineText);
            }
          }
        }
        if (node.childNodes) node.childNodes.forEach(visit);
      };
      visit(doc);
    }
  }

  // finalize coverage & severities
  let totalCovered=0, totalCount=0;
  for (const [id,u] of Object.entries(usages)) {
    const feature = FEATURES[id];
    const coverage = estimateCoverage(feature.browsers, analytics, cfg.browserslist);
    u.coverage = coverage;
    // severity computation:
    // - none => error
    // - newly => warn (or error if profile says so)
    // apply overrides and ignore
    if (cfg.ignore.includes(id)) { u.severity = "info"; continue; }
    if (feature.status === "none") u.severity = "error";
    else if (feature.status === "newly") u.severity = cfg.treatNewlyAsViolation ? "error" : (u.severity==="info"?"warn":u.severity);
    if (cfg.overrides[id]?.severity) u.severity = cfg.overrides[id]!.severity!;
    if (cfg.overrides[id]?.minCoverage && u.coverage < cfg.overrides[id]!.minCoverage!) u.severity = "error";
    if (u.coverage < cfg.coverageBudget) u.severity = u.severity==="error" ? "error" : "warn";
    // aggregate coverage
    totalCovered += Math.min(100, u.coverage) * u.count;
    totalCount += u.count;
  }

  const achieved = totalCount ? Math.round(totalCovered/totalCount) : 100;
  const violations = Object.values(usages).filter(u => u.severity==="error").map(u => u.id);
  const warnings = Object.values(usages).filter(u => u.severity==="warn").map(u => u.id);

  const res: ScanResult = {
    features: usages,
    summary: {
      violations, warnings, pass: violations.length===0 && achieved>=cfg.coverageBudget,
      coverageBudget: cfg.coverageBudget, achieved
    }
  };

  if (opts.outDir) {
    fs.mkdirSync(opts.outDir, { recursive: true });
    fs.writeFileSync(path.join(opts.outDir,"report.json"), JSON.stringify(res,null,2));
    fs.writeFileSync(path.join(opts.outDir,"index.html"), renderHtml(res));
    // badge
    fs.writeFileSync(path.join(opts.outDir,"badge.svg"), renderBadge(res.summary.pass));
  }

  return res;
}

// (same idea as before—table + small summary; omitted for brevity)
function renderHtml(res: ScanResult): string { /* ... keep prior template, add severity column ... */ return `<!doctype html><html><body><h1>Baseline Flightdeck</h1><p>Violations: ${res.summary.violations.length} | Warnings: ${res.summary.warnings.length} | Coverage ${res.summary.achieved}% (budget ${res.summary.coverageBudget}%)</p></body></html>`; }
function renderBadge(pass: boolean): string { return `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="20"><rect width="130" height="20" fill="#555"/><rect x="60" width="70" height="20" fill="${pass?"#4c1":"#e05d44"}"/><g fill="#fff" font-family="Verdana" font-size="11"><text x="7" y="14">baseline</text><text x="70" y="14">${pass?"passing":"failing"}</text></g></svg>`; }
