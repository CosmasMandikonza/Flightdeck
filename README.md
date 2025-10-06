# Baseline Flightdeck

![Baseline](examples/sample-app/.baseline/badge.svg)

Know. Enforce. Upgrade.  
A CLI + ESLint rule that scans your code for modern Web features, maps them to **Baseline** status, computes **coverage**, produces a **HTML report + badge**, and **annotates PR lines** in GitHub.

## Quick start
```bash
pnpm install
pnpm fetch:features           # generates data/features.json + data/aliases.json
pnpm -C packages/core build
pnpm -C packages/cli build

# Demo:
pnpm scan:example             # writes examples/sample-app/.baseline/index.html
