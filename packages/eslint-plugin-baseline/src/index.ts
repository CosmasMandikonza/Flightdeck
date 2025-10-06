import type { Rule } from "eslint";
import { scanProject } from "@flightdeck/core";
import path from "node:path";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow Not-yet-Baseline features" },
    schema: []
  },
  create(context) {
    let cache: Set<string> | null = null;
    return {
      Program: async (node) => {
        if (!cache) {
          const cwd = context.getCwd?.() ?? process.cwd();
          const res = await scanProject({ srcDir: cwd });
          cache = new Set(res.violations);
        }
        if (cache.size) {
          // naive: if file mentions any alias; we already surface in CLI; here we warn
          // to avoid perf cost, emit a file-level error if repo has violations.
          context.report({ node, message: "Repo uses features that are not yet in Baseline. Run `baseline-flightdeck scan` for details." });
        }
      }
    };
  }
};

export = { rules: { "no-notyet-baseline": rule } };
