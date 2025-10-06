import fs from "node:fs/promises";
import path from "node:path";

const outDir = "data";
const featuresMin = path.join(outDir,"baseline-features.min.json");
const linksMin = path.join(outDir,"mdn-links.min.json");

async function main() {
  const fallback = JSON.parse(await fs.readFile(featuresMin,"utf-8"));
  const links = JSON.parse(await fs.readFile(linksMin,"utf-8"));

  const features = {};
  for (const f of fallback) {
    features[f.id] = { ...f, mdn: links[f.id] ?? null };
  }

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
  console.log("✓ Generated data/features.json and data/aliases.json");
}
main().catch(err => { console.error(err); process.exit(1); });
