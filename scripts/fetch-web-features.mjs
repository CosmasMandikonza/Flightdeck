import fs from "node:fs/promises";
import path from "node:path";

/**
 * Pulls canonical feature metadata and MDN links to build:
 * - features.json: id, title, status, browsers (min versions), mdn
 * - aliases.json: js/css/html tokens -> feature id
 *
 * For hackathon: assume you ran `npm i web-features` and that package exposes
 * a JSON index (most community builds do). If not, keep our fallback but prefer live.
 */
async function main() {
  const outDir = "data";
  await fs.mkdir(outDir, { recursive: true });

  // In practice you'd import from 'web-features' or fetch from Web Platform Dashboard.
  // Here we read our curated fallback and extend it a bit.
  const fallback = JSON.parse(await fs.readFile(path.join(outDir,"baseline-features.min.json"),"utf-8"));
  const mdn = JSON.parse(await fs.readFile(path.join(outDir,"mdn-links.min.json"),"utf-8"));
  const features = {};
  for (const f of fallback) {
    features[f.id] = { ...f, mdn: mdn[f.id] ?? f.mdn ?? null };
  }

  // Build aliases: in a real script, map MDN compat keys to identifiers/selectors/attrs.
  const aliases = {
    // JS/Web APIs
    "navigator.clipboard": "clipboard-api",
    "document.startViewTransition": "view-transitions",
    "HTMLDialogElement": "dialog-element",
    "Element.prototype.togglePopover": "popover-attribute",
    // CSS
    ":has": "selector-has",
    "popover": "popover-attribute",
    "dialog": "dialog-element",
    // HTML
    "dialog": "dialog-element",
    "popovertarget": "popover-attribute",
    "fetchpriority": "fetch-priority-attribute"
  };

  await fs.writeFile(path.join(outDir,"features.json"), JSON.stringify(features,null,2));
  await fs.writeFile(path.join(outDir,"aliases.json"), JSON.stringify(aliases,null,2));
  console.log("✓ Built data/features.json and data/aliases.json");
}
main().catch(e => { console.error(e); process.exit(1); });
