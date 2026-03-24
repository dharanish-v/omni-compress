# Omni-Compress Playground 🎨

> "Brevity is the soul of wit." — William Shakespeare

The **Omni-Compress Playground** is an interactive, high-performance web application designed to demonstrate the power of the `@dharanish/omni-compress` library. It combines cutting-edge WebAssembly technology with a bold, **Neo-Brutalist** design system.

---

## 🏛️ Design Thinking: Neo-Brutalism

The playground is built on a **Neo-Brutalist** (or *New Brutalist*) design philosophy. This approach rejects the "softness" and over-polishing of modern SaaS interfaces in favor of something more raw, honest, and mechanical.

### Key Pillars:
- **Raw Functionality:** High-contrast `4px` and `2px` borders define every element. There are no gradients or subtle blurs—only solid colors and sharp lines.
- **Mechanical UI:** Every component is designed to feel like a physical machine. 
    - The **Audio Player** features a "digital readout" for duration and a tactile "mechanical knob" for seeking.
    - **Select Dropdowns** use heavy shadows and sharp corners instead of floating native menus.
- **Haptic Feedback:** To simulate physical interaction, elements use a consistent `6px` or `4px` offset shadow. On hover/active states, the element translates `1:1` into its shadow, creating a satisfying "press" effect. This is paired with actual **Haptic Vibrations** (`navigator.vibrate`) for a truly tactile experience.
- **Mechanical Sound Synthesis:** Utilizing the **Web Audio API**, the playground synthesizes "engine-like" click, shift, and success sounds in real-time. No sound files are downloaded; the audio is generated on-the-fly to ensure zero latency and a mechanical feel.
- **Intentional Chaos:** Diagonal background patterns, oversized typography, and overlapping decorative shapes create a sense of raw energy and "construction."

### 🎭 Persona-Driven Themes
The playground features **26 unique themes**, each tied to a historical persona (from *Leonardo da Vinci* to *Aryabhata*). 
- **Cultural Color Theory:** Each theme uses a palette inspired by the persona's era or art style (e.g., Monet's soft saturations vs. Picasso's bold blues).
- **Localized Context:** Themes include localized strings and quotes that reflect the persona's philosophy on "brevity" and "simplicity."
- **Seamless Transitions:** Leveraging the modern **View Transitions API**, switching personas morphs the entire UI—from background patterns to button shapes—seamlessly.

---

## 🛠️ Technical Highlights

- **Static Site Generation (SSG):** Built with **Astro**. The playground uses `getStaticPaths` to pre-render all 26 persona themes into distinct, indexable HTML pages at build time, ensuring perfect SEO and instant Time-To-Interactive (TTI).
- **View Transitions:** Leverages Astro's `<ClientRouter />` for seamless, morphing CSS animations when switching between statically generated persona pages.
- **LLM Discoverability:** Includes an automated build script that generates `llms.txt` and `llms-full.txt` context files, making the entire repository and API surface easily digestible by AI coding assistants.
- **Isomorphic Compression:** Automatically routes between native browser APIs (`OffscreenCanvas`, `WebCodecs`) and heavy-duty FFmpeg WebAssembly.
- **Zero-Copy Memory:** Uses `Transferable Objects` to pass large media buffers between the main thread and Web Workers without RAM duplication.

---

## 🚀 Development

```bash
# From the project root:
bun run dev
```

The playground is built with **Astro**, **React**, and **Tailwind CSS v4**. It serves as both a testing ground for the core library and a reference implementation for high-performance media processing in the browser.
