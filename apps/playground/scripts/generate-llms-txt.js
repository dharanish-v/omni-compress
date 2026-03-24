import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../public');
const ROOT_DIR = path.resolve(import.meta.dirname, '../../../');

const LLMS_TXT_PATH = path.join(PUBLIC_DIR, 'llms.txt');
const LLMS_FULL_TXT_PATH = path.join(PUBLIC_DIR, 'llms-full.txt');

const llmsTxtContent = `# Omni-Compress

> Smart-routing media compression for browsers and Node.js.

Omni-Compress automatically routes media compression to the fastest available engine at runtime: native Web APIs (OffscreenCanvas/WebCodecs), FFmpeg WebAssembly, or OS-level ffmpeg binaries. It features zero main-thread blocking and zero-copy memory transfers.

## Core API
\`\`\`typescript
import { OmniCompressor } from '@dharanish/omni-compress';

const compressedBlob = await OmniCompressor.process(file, {
  type: 'image' | 'audio',
  format: 'webp' | 'opus' | 'mp3' | 'avif' | 'jpeg' | 'png' | 'flac' | 'wav',
  quality: 0.8, // optional
  maxWidth: 1920, // optional (images only)
  maxHeight: 1080, // optional (images only)
  preserveMetadata: false, // optional (images only)
  bitrate: '128k', // optional (audio only)
  channels: 2, // optional (audio only)
  sampleRate: 48000 // optional (audio only)
});
\`\`\`

## Full Documentation
For the complete API reference, architecture details, supported formats, and playground design philosophy, please read the full documentation at:
[https://dharanish-v.github.io/omni-compress/llms-full.txt](https://dharanish-v.github.io/omni-compress/llms-full.txt)
`;

function generateLlmsFullTxt() {
  const filesToInclude = [
    { name: 'Root README', path: path.join(ROOT_DIR, 'README.md') },
    { name: 'Core Library API', path: path.join(ROOT_DIR, 'packages', 'omni-compress', 'README.md') },
    { name: 'Playground Design Thinking', path: path.join(ROOT_DIR, 'apps', 'playground', 'README.md') },
    { name: 'Contributing & Architecture Rules', path: path.join(ROOT_DIR, 'CONTRIBUTING.md') },
  ];

  let fullContent = `# Omni-Compress - Full Documentation Context\n\n`;
  fullContent += `This file contains the concatenated documentation for the Omni-Compress project, designed for consumption by LLMs and AI agents.\n\n`;

  for (const file of filesToInclude) {
    if (fs.existsSync(file.path)) {
      const content = fs.readFileSync(file.path, 'utf-8');
      fullContent += `\n\n---\n\n# ${file.name}\n\n${content}`;
    } else {
      console.warn(`Warning: Could not find file ${file.path}`);
    }
  }

  return fullContent;
}

// Ensure public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Write files
fs.writeFileSync(LLMS_TXT_PATH, llmsTxtContent);
console.log(`Generated ${LLMS_TXT_PATH}`);

const fullTxtContent = generateLlmsFullTxt();
fs.writeFileSync(LLMS_FULL_TXT_PATH, fullTxtContent);
console.log(`Generated ${LLMS_FULL_TXT_PATH}`);
