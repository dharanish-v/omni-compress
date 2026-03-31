# Contributing to Omni Compress

Thank you for your interest in contributing! We welcome bug reports, feature requests, and pull requests.

## Development Setup

This project uses [Bun](https://bun.sh/) workspaces. Ensure you have Bun installed before proceeding.

### Prerequisites

- [Bun](https://bun.sh/docs/installation) (latest)
- [ffmpeg](https://ffmpeg.org/) (optional — only needed for Node adapter testing)

### Getting Started

```bash
git clone https://github.com/dharanish-v/omni-compress.git
cd omni-compress
bun install
```

### Commands

```bash
# Run the playground locally
bun run dev

# Build the library and playground
bun run build

# Run the automated test suite
cd packages/omni-compress
bunx playwright install --with-deps chromium # Run once to install browser
bun run test

# Type-check the library
bun run typecheck

# Clean all build artifacts and node_modules
bun run clean
```

## Project Structure

```
├── packages/omni-compress/   → Core library (published to npm)
│   ├── src/
│   │   ├── adapters/         → Environment-specific adapters (browser / node)
│   │   ├── core/             → Router, utils, logger, errors
│   │   ├── workers/          → Web Worker entry points (with Fast→Heavy fallback)
│   │   └── index.ts          → Public API
│   ├── tests/                → Vitest test suites (node + browser)
│   └── tsup.config.ts        → Build config (source maps disabled in production)
│
└── apps/playground/          → Astro + React interactive demo
```

## Architecture Rules

When contributing code, please maintain these design invariants:

### Core Library (`packages/omni-compress/`):
1. **Zero-copy memory** — Always use `Transferable` objects for ArrayBuffer passing between threads.
2. **Wasm memory safety** — Always call `ffmpeg.deleteFile()` in a `finally` block to clean the Virtual File System. The FFmpeg singleton self-terminates after an idle timeout — do not call `ffmpeg.terminate()` manually after each operation. Workers are cached and self-terminate when idle.
3. **Lazy imports** — Heavy dependencies (`@ffmpeg/ffmpeg`) must be dynamically imported, never at module top level.
4. **No main-thread work** — All compute-intensive processing (media or archiving) in browsers must run inside Web Workers or use asynchronous APIs.
5. **Graceful fallback** — Fast Path operations must be wrapped in try/catch within workers. On failure, fall back to the Heavy Path rather than surfacing the error to the user.
6. **Size guards** — Always validate file size against `SAFE_SIZE_LIMITS` before passing data to Wasm. Throw `FileTooLargeError` for oversized inputs.

### Playground (`apps/playground/`):
1. **Neo-Brutalist Aesthetic** — Maintain high-contrast `4px`/`2px` borders and sharp `6px`/`4px` offset shadows.
2. **Haptic Feedback** — Standardize `active:translate` behavior to match the 1:1 shadow translation pattern.
3. **Persona-First** — New UI components should adapt to the theme's `primary`, `secondary`, and `accent` color variables.
4. **Mechanical Components** — Prioritize raw, physical-feeling UI elements over polished or "soft" components.

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add HEIC support via Heavy Path
fix: prevent Wasm OOM on large audio files
docs: update supported formats table
refactor: extract shared FFmpeg args builder
```

## Pull Request Process

1. Fork the repository.
2. Create a feature branch from `master` (`git checkout -b feature/amazing-feature`).
3. Make your changes, ensuring `bun run typecheck` passes.
4. Run the automated test suite (`cd packages/omni-compress && bun run test`) to ensure no regressions.
5. Test your changes visually in the playground (`bun run dev`).
6. Commit using conventional commit messages.
7. Push to your fork and open a Pull Request targeting `master`.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.
