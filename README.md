# MQTT Wire

[![CI](https://github.com/qualithm/mqtt-wire-js/actions/workflows/ci.yaml/badge.svg)](https://github.com/qualithm/mqtt-wire-js/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/qualithm/mqtt-wire-js/graph/badge.svg)](https://codecov.io/gh/qualithm/mqtt-wire-js)
[![npm](https://img.shields.io/npm/v/@qualithm/mqtt-wire)](https://www.npmjs.com/package/@qualithm/mqtt-wire)

Server-side MQTT protocol codec and connection state machine for JavaScript and TypeScript runtimes.
Accepts connections from MQTT clients, parses bytes into typed packets, encodes packets into bytes,
and manages per-connection protocol state.

## Development

### Prerequisites

- [Bun](https://bun.sh/) (recommended), Node.js 20+, or [Deno](https://deno.land/)

### Setup

```bash
bun install
```

### Building

```bash
bun run build
```

### Running

```bash
bun run start
```

### Testing

```bash
bun test
```

### Linting & Formatting

```bash
bun run lint
bun run format
bun run typecheck
```

### Benchmarks

```bash
bun run bench
```

## Publishing

The package is automatically published to NPM when CI passes on main. Update the version in
`package.json` before merging to trigger a new release.

## Licence

Apache-2.0
