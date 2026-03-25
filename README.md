# Omni Compress

<p align="center">
  <img src="https://img.shields.io/npm/v/@dharanish/omni-compress?style=flat-square&color=0f4c81" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/dharanish-v/omni-compress?style=flat-square&color=5386b4" alt="License" />
  <img src="https://img.shields.io/npm/dt/@dharanish/omni-compress?style=flat-square&color=c06c5b" alt="NPM Downloads" />
  <img src="https://img.shields.io/github/actions/workflow/status/dharanish-v/omni-compress/ci.yml?branch=master&style=flat-square&color=d9a05b" alt="CI Status" />
  <img src="https://img.shields.io/endpoint?url=https://dharanish-v.github.io/omni-compress/coverage.json&style=flat-square" alt="Coverage" />
  <img src="https://img.shields.io/badge/Tested_with-Vitest-729B1B?style=flat-square&logo=vitest" alt="Tested with Vitest" />
</p>

<p align="center">
  <b>Smart-routing media compression for browsers and Node.js.</b><br/>
  One API. Three engines. Zero main-thread blocking.
</p>

---

`omni-compress` accepts an image or audio file and automatically routes compression to the fastest engine available at runtime — native Web APIs, FFmpeg WebAssembly, or OS-level ffmpeg binaries.

```typescript
import { OmniCompressor } from '@dharanish/omni-compress';

const compressed = await OmniCompressor.process(file, {
  type: 'image',
  format: 'webp',
  quality: 0.8,
  onProgress: (p) => console.log(`${p}%`),
});
```

## Highlights

- **Zero main-thread blocking** — All browser processing runs in Web Workers
- **Zero-copy memory** — `Transferable` ArrayBuffer transfers, no RAM duplication
- **Smart routing** — Native `OffscreenCanvas` for standard formats, lazy-loaded FFmpeg Wasm for the rest
- **Resilient fallback** — Fast Path failures automatically fall back to Heavy Path
- **OOM prevention** — Typed `FileTooLargeError` thrown before Wasm memory exhaustion (250 MB guard)
- **FFmpeg singleton caching** — Wasm instance reused across compressions with idle-timeout cleanup
- **Isomorphic** — Same API for browser, Node.js, and Electron
- **Isomorphic Testing** — Comprehensive test suite using Vitest and Playwright across all execution environments
- **Tree-shakeable** — ESM + CJS dual build, no side effects, ~84 KB unpacked

## Monorepo Structure

```
├── packages/omni-compress/   → Core library (published to npm)
└── apps/playground/          → Interactive demo (Astro + React + Tailwind CSS v4)
```

## 🎨 The Neo-Brutalist Playground

The project includes an interactive playground built with a **Neo-Brutalist** design system. This isn't just a compression tool—it's a cultural and visual exploration of **brevity**.

- **26 Historical Personas:** Switch between themes ranging from *Leonardo da Vinci* to *Aryabhata*, each with unique cultural quotes and color palettes.
- **Advanced Engineering:** Exposes granular compression controls (Bitrate, Sample Rate, Dimensions, Metadata stripping) inside a tactile UI.
- **Mechanical UI:** Custom-built components (Mechanical Audio Player, Brutalist Selects) that prioritize raw functionality.
- **Sensory Feedback:** Experience the app through synthesized mechanical sounds (Web Audio API) and tactile haptic vibrations synced with UI interactions.
- **View Transitions:** Experience seamless theme morphing using modern browser APIs (built on Astro SSG).
- **LLM Discoverability:** Implements the `llms.txt` standard. AI agents can natively ingest the library context at `https://dharanish-v.github.io/omni-compress/llms.txt`.

[**Explore the Playground 🚀**](https://dharanish-v.github.io/omni-compress/)

| Package | Description | Links |
|---|---|---|
| `@dharanish/omni-compress` | The compression library | [README](packages/omni-compress/README.md) · [npm](https://www.npmjs.com/package/@dharanish/omni-compress) |
| `playground` | Live demo UI | [Source](apps/playground/) · [Live](https://dharanish-v.github.io/omni-compress/) |

## Quick Start

```bash
npm install @dharanish/omni-compress
```

For full API reference, supported formats, architecture details, and framework examples, see the **[package README](packages/omni-compress/README.md)**.

## Development

```bash
# Prerequisites: Bun (https://bun.sh)
bun install

# Run the playground locally
bun run dev

# Build everything
bun run build
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for our vulnerability reporting policy.

## License

[MIT](LICENSE) &copy; Dharanish V
