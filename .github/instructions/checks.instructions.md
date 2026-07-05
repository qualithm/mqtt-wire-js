---
applyTo: "**"
description:
  "Exact pre-commit commands for the bun-lib-mqtt CI archetype, kept in sync with ci.yaml"
---

# Pre-commit Checks

This repo's `ci.yaml` is generated from `dx/ci-templates/bun-lib-mqtt.yaml` via `dx ci sync` (check
for drift with `dx ci drift`). Run these before committing so CI passes on the first try:

```bash
bun run lint
bun run format
bun run typecheck
bun run test:unit
bun run test:conformance   # requires `mosquitto-clients` installed locally
```

On PRs targeting `main`, CI additionally runs and blocks on:

```bash
bun run build && bun run validate:runtime      # cross-runtime export shape
npx vitest run src/__tests__/unit              # Node.js
deno run -A npm:vitest run src/__tests__/unit  # Deno
bun run test:coverage:unit                     # line coverage must be >=80%
```
