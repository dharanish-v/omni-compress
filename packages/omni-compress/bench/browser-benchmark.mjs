/**
 * omni-compress Browser Benchmark (Playwright)
 * =============================================
 * Runs a real Chromium browser against the HTML benchmark page and
 * prints a formatted comparison table.
 *
 * Usage:
 *   bun run bench:browser          # or: node bench/browser-benchmark.mjs
 *   bun run bench:browser --headed  # watch the browser window
 *
 * Prerequisites:
 *   bun run build   (builds dist/ used by the benchmark page)
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, execSync } from 'child_process';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const HEADED = process.argv.includes('--headed');
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (large images + 3 runs each)

// ── colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  red: '\x1b[31m', bgGreen: '\x1b[42m\x1b[30m',
};
const bold = s => `${C.bold}${s}${C.reset}`;
const dim = s => `${C.dim}${s}${C.reset}`;
const green = s => `${C.green}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const cyan = s => `${C.cyan}${s}${C.reset}`;
const red = s => `${C.red}${s}${C.reset}`;

const MIME = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.cjs': 'application/javascript',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.css': 'text/css',
  '.json': 'application/json',
};

// ── Build ─────────────────────────────────────────────────────────────────────
console.log(cyan('\n  Building omni-compress…'));
spawnSync('bun', ['run', 'build'], { cwd: PKG_ROOT, stdio: 'inherit' });

// Also generate fixtures if missing
const fixturesDir = join(PKG_ROOT, 'bench', 'fixtures');
const neededFixtures = ['test-tiny.jpg', 'test-small.jpg', 'test-medium.jpg', 'test-large.jpg'];
const missingFixtures = neededFixtures.filter(f => !existsSync(join(fixturesDir, f)));
if (missingFixtures.length > 0) {
  console.log(cyan('  Generating missing test fixtures…'));
  // Find ffmpeg binary
  let ffmpegBin = 'ffmpeg';
  try {
    const mod = await import('ffmpeg-static');
    const p = mod.default ?? mod;
    if (p && existsSync(p)) ffmpegBin = p;
  } catch {}

  const sizes = { 'test-tiny.jpg': '800x600', 'test-small.jpg': '1920x1080', 'test-medium.jpg': '3000x2000', 'test-large.jpg': '4000x3000' };
  for (const name of missingFixtures) {
    const [w, h] = sizes[name].split('x');
    const outPath = join(fixturesDir, name);
    spawnSync(ffmpegBin, ['-f', 'lavfi', '-i', `rgbtestsrc=size=${w}x${h}:rate=1`, '-vframes', '1', '-q:v', '2', '-y', outPath], { stdio: 'ignore' });
    if (existsSync(outPath)) console.log(`    ✓ ${name}`);
  }
}

// ── Static file server ────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/bench/browser-benchmark.html';
  const filePath = join(PKG_ROOT, urlPath);

  try {
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    // COOP/COEP not strictly required for WebP/JPEG fast path, but set for future heavy path
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end(`Not found: ${urlPath}`);
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const BASE = `http://localhost:${port}`;

console.log(dim(`  Local server: ${BASE}\n`));

// ── Launch browser ────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  headless: !HEADED,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security', // allow loading CDN scripts (compressor.js)
  ],
});

const context = await browser.newContext({
  // Bypass CDN COEP issues — the CDN scripts don't send CORP headers
  bypassCSP: true,
});

const page = await context.newPage();

// Relay browser console to terminal
page.on('console', msg => {
  if (msg.type() === 'error') console.error(dim(`  [browser] ${msg.text()}`));
});
page.on('pageerror', err => console.error(red(`  [browser error] ${err.message}`)));

console.log(bold('═'.repeat(130)));
console.log(bold(cyan('  omni-compress Browser Benchmark')) + dim('  Chromium  ·  main thread  ·  3-run median'));
console.log(bold('═'.repeat(130)));
console.log('');
console.log(dim('  Loading page and CDN dependencies (compressor.js, browser-image-compression)…'));

await page.goto(`${BASE}/bench/browser-benchmark.html`, { waitUntil: 'domcontentloaded' });

// Stream browser log lines to terminal in real-time
await page.exposeFunction('__playwrightLog', line => process.stdout.write('  ' + line + '\n'));
await page.evaluate(() => {
  const orig = console.log.bind(console);
  console.log = (...args) => { window.__playwrightLog?.(args.join(' ')); orig(...args); };
});

// Wait for benchmark to finish
try {
  await page.waitForFunction(() => window.__benchDone === true, { timeout: TIMEOUT_MS });
} catch (e) {
  console.error(red('\n  Timeout waiting for benchmark. Check browser console above for errors.'));
  await browser.close();
  server.close();
  process.exit(1);
}

const results = await page.evaluate(() => window.__benchResults ?? []);
const benchError = await page.evaluate(() => window.__benchError ?? null);

await browser.close();
server.close();

if (benchError) {
  console.error(red(`\n  Benchmark error: ${benchError}`));
  process.exit(1);
}

// ── Render formatted table ────────────────────────────────────────────────────
const pad = (s, n) => String(s).padStart(n);

function fmtMs(ms, best) {
  if (ms == null) return dim(pad('n/a', 7));
  const s = pad(ms.toFixed(0) + 'ms', 7);
  if (ms <= best * 1.05) return `${C.bgGreen}${C.bold}${s}${C.reset}`; // ≤5% of best = winner
  if (ms < best * 1.3) return green(s);
  if (ms < best * 2.0) return yellow(s);
  return red(s);
}

console.log('');
console.log(bold('═'.repeat(130)));
console.log(bold('  RESULTS  (lower = faster, green background = fastest in row)'));
console.log(bold('═'.repeat(130)));
console.log('');
console.log(bold(
  '  Format + Size             '.padEnd(32) +
  pad('InputKB', 9) +
  pad('omni-compress', 16) +
  pad('raw-OffscreenCanvas', 22) +
  pad('raw-HTMLCanvas', 18) +
  pad('compressor.js', 16) +
  pad('bic', 12)
));
console.log(dim('  ' + '─'.repeat(124)));

let lastFormat = null;
for (const r of results) {
  if (lastFormat !== null && r.format !== lastFormat) console.log('');
  lastFormat = r.format;

  const allMs = [r.omni, r.rawOC, r.rawHC, r.compJS, r.bic].filter(v => v != null);
  const best = allMs.length ? Math.min(...allMs) : 9999;

  const label = `[${r.format.toUpperCase()}] ${r.label}`;
  console.log(
    '  ' + label.padEnd(30) +
    pad((r.inputKB / 1024).toFixed(0) + 'KB', 9) + '  ' +
    fmtMs(r.omni, best) + '     ' +
    fmtMs(r.rawOC, best) + '              ' +
    fmtMs(r.rawHC, best) + '         ' +
    fmtMs(r.compJS, best) + '         ' +
    fmtMs(r.bic, best)
  );
}

// ── Analysis ──────────────────────────────────────────────────────────────────
console.log('');
console.log(bold('═'.repeat(130)));
console.log(bold('  ANALYSIS'));
console.log(bold('═'.repeat(130)));
console.log('');

const vsCompressorJS = results.filter(r => r.omni != null && r.compJS != null);
const omniWinsVsCompJS = vsCompressorJS.filter(r => r.omni <= r.compJS * 1.05);
console.log(`  omni-compress vs compressor.js: ${green(`${omniWinsVsCompJS.length}/${vsCompressorJS.length}`)} scenarios where omni is faster or tied`);

if (vsCompressorJS.length > 0) {
  const ratios = vsCompressorJS.map(r => r.compJS / r.omni);
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  console.log(`  Speed ratio (compressor.js / omni): avg ${bold(avg.toFixed(2))}x  |  min ${min.toFixed(2)}x  |  max ${max.toFixed(2)}x`);
  if (avg > 1) console.log(green(`  → omni-compress is on average ${avg.toFixed(2)}x FASTER than compressor.js`));
  else console.log(red(`  → compressor.js is on average ${(1/avg).toFixed(2)}x faster than omni-compress`));
}

console.log('');
const vsRawOC = results.filter(r => r.omni != null && r.rawOC != null);
if (vsRawOC.length > 0) {
  const overhead = vsRawOC.map(r => r.omni - r.rawOC);
  const avgOH = overhead.reduce((a, b) => a + b, 0) / overhead.length;
  const pctOH = vsRawOC.map(r => ((r.omni - r.rawOC) / r.rawOC) * 100);
  const avgPct = pctOH.reduce((a, b) => a + b, 0) / pctOH.length;
  console.log(`  omni-compress overhead vs raw OffscreenCanvas: +${avgOH.toFixed(1)}ms avg  (+${avgPct.toFixed(0)}%)`);
  console.log(dim(`  (Overhead = fileToArrayBuffer conversion + router logic + format detection)`));
}

const vsRawHC = results.filter(r => r.compJS != null && r.rawHC != null);
if (vsRawHC.length > 0) {
  const overhead = vsRawHC.map(r => r.compJS - r.rawHC);
  const avgOH = overhead.reduce((a, b) => a + b, 0) / overhead.length;
  console.log(`  compressor.js overhead vs raw HTMLCanvas:  +${avgOH.toFixed(1)}ms avg`);
  console.log(dim(`  (Overhead = Image load event + orientation correction + quality fallback logic)`));
}

console.log('');
console.log(bold('  WHY omni-compress is faster:'));
console.log(dim(`
  OffscreenCanvas.convertToBlob()  > HTMLCanvasElement.toBlob()
  createImageBitmap(blob, {resize}) > img.onload + ctx.drawImage()   (single GPU pass vs two)
  Omits EXIF orientation step      > compressor.js always checks EXIF
  ArrayBuffer input (no re-fetch)  > compressor.js re-creates ObjectURL per call
`));

console.log(bold('═'.repeat(130)) + '\n');
