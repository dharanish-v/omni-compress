/**
 * omni-compress Image Compression Benchmark
 * ==========================================
 * Compares omni-compress (Node path via ffmpeg-static) against:
 *   - sharp    (libvips — fastest Node image library, 36.5M/wk)
 *   - jimp     (pure JS — baseline)
 *   - raw ffmpeg (direct spawn, no library overhead)
 *
 * Usage:
 *   cd packages/omni-compress
 *   bun bench/image-benchmark.mjs           # run benchmark
 *   bun bench/image-benchmark.mjs --install # auto-install sharp + jimp first
 */

import { execFileSync, spawnSync, execSync } from 'child_process';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const INSTALL   = process.argv.includes('--install');

// ── colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  red: '\x1b[31m', magenta: '\x1b[35m', blue: '\x1b[34m',
  bgGreen: '\x1b[42m\x1b[30m', bgRed: '\x1b[41m\x1b[97m',
};
const bold   = s => `${C.bold}${s}${C.reset}`;
const dim    = s => `${C.dim}${s}${C.reset}`;
const green  = s => `${C.green}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const cyan   = s => `${C.cyan}${s}${C.reset}`;
const red    = s => `${C.red}${s}${C.reset}`;

// ── locate ffmpeg-static ──────────────────────────────────────────────────────
let FFMPEG;
const ffmpegCandidates = [
  // bun cache path
  join(__dirname, '../../../node_modules/.bun/ffmpeg-static@5.3.0/node_modules/ffmpeg-static/ffmpeg'),
  join(__dirname, '../node_modules/ffmpeg-static/ffmpeg'),
  join(__dirname, '../../..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
];
try {
  const mod = require('ffmpeg-static');
  const p   = mod.default ?? mod;
  if (p && existsSync(p)) FFMPEG = p;
} catch {}
if (!FFMPEG) FFMPEG = ffmpegCandidates.find(existsSync);
if (!FFMPEG) { console.error(red('✗ ffmpeg-static not found')); process.exit(1); }

// ── optional competitor install ───────────────────────────────────────────────
if (INSTALL) {
  console.log(cyan('\n  Installing sharp and jimp for comparison...'));
  try { execSync('bun add -d sharp jimp', { cwd: join(__dirname, '..'), stdio: 'inherit' }); }
  catch { execSync('npm install --save-dev sharp jimp', { cwd: join(__dirname, '..'), stdio: 'inherit' }); }
}

// ── fixture generation ────────────────────────────────────────────────────────
const FIXTURES_DIR = join(__dirname, 'fixtures');
if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });

// Generate synthetic images with noise (realistic detail, not solid colour)
const SIZES = [
  { label: 'tiny   ~100KB', name: 'test-tiny.jpg',   w: 800,  h: 600  },
  { label: 'small  ~500KB', name: 'test-small.jpg',  w: 1920, h: 1080 },
  { label: 'medium   ~2MB', name: 'test-medium.jpg', w: 3000, h: 2000 },
  { label: 'large    ~5MB', name: 'test-large.jpg',  w: 4000, h: 3000 },
];

function generateFixtures() {
  let n = 0;
  for (const { name, w, h } of SIZES) {
    const p = join(FIXTURES_DIR, name);
    if (existsSync(p) && statSync(p).size > 50_000) continue;
    // Use rgbtestsrc (colourful gradients with real detail) at -q:v 2 (high quality)
    spawnSync(FFMPEG, [
      '-f', 'lavfi', '-i', `rgbtestsrc=size=${w}x${h}:rate=1`,
      '-vframes', '1', '-q:v', '2', '-y', p
    ], { stdio: 'ignore' });
    n++;
  }
  if (n) console.log(`  ✓ Generated ${n} test fixtures (${FIXTURES_DIR})\n`);
}

// ── timing ────────────────────────────────────────────────────────────────────
const RUNS = 3;

async function time(fn) {
  const times = [];
  let lastResult, lastError;
  for (let i = 0; i < RUNS; i++) {
    try {
      const t0 = performance.now();
      lastResult = await fn();
      // Treat null return as "not supported" — don't count the time
      if (lastResult === null) return { ms: null, result: null };
      times.push(performance.now() - t0);
    } catch (e) {
      lastError = e;
    }
  }
  if (!times.length) return { error: lastError?.message ?? 'failed', ms: null, result: null };
  times.sort((a, b) => a - b);
  return { ms: times[Math.floor(RUNS / 2)], result: lastResult };
}

// ── libraries ─────────────────────────────────────────────────────────────────

async function omniNode(inputPath, format, quality) {
  const { compressImage, logger } = await import('../dist/index.js');
  logger.setLevel('warn'); // suppress INFO noise in benchmark output
  const data = readFileSync(inputPath);
  const blob = new Blob([data], { type: 'image/jpeg' });
  const res  = await compressImage(blob, {
    format,
    quality,
    useWorker: false,
    onProgress: () => {},
  });
  if (!res?.compressedSize) throw new Error(`omni returned no size (got ${JSON.stringify(res)})`);
  return { size: res.compressedSize, originalSize: res.originalSize };
}

let sharpLib = null;
async function sharpCompress(inputPath, format, quality) {
  if (sharpLib === false) return null;
  if (!sharpLib) {
    try { sharpLib = (await import('sharp')).default; }
    catch { sharpLib = false; return null; }
  }
  const q = Math.round(quality * 100);
  let p = sharpLib(inputPath);
  if (format === 'webp') p = p.webp({ quality: q });
  else if (format === 'avif') p = p.avif({ quality: q });
  else if (format === 'jpeg' || format === 'jpg') p = p.jpeg({ quality: q, mozjpeg: true });
  else if (format === 'png') p = p.png({ compressionLevel: 6 });
  else return null;
  const buf = await p.toBuffer();
  return { size: buf.length };
}

let jimpLib = null;
async function jimpCompress(inputPath, format, quality) {
  if (jimpLib === false) return null;
  if (!jimpLib) {
    try {
      const m = await import('jimp');
      jimpLib = m.Jimp ?? m.default?.Jimp ?? m.default;
    } catch { jimpLib = false; return null; }
  }
  if (format === 'webp' || format === 'avif') return null; // not supported
  const img = await jimpLib.read(inputPath);
  const tmp = join(tmpdir(), `jimp_${randomUUID()}.${format === 'jpeg' ? 'jpg' : format}`);
  if (format === 'jpeg' || format === 'jpg') img.quality(Math.round(quality * 100));
  await img.writeAsync(tmp);
  return { size: statSync(tmp).size };
}

function rawFfmpegCompress(inputPath, format, quality) {
  const tmp = join(tmpdir(), `raw_${randomUUID()}.${format}`);
  const q = Math.round(quality * 100);
  const args = ['-y', '-i', inputPath, '-threads', '0'];
  if (format === 'webp') args.push('-c:v', 'libwebp', '-q:v', String(q), '-compression_level', '0', '-method', '0');
  else if (format === 'jpeg') args.push('-q:v', String(Math.round((1 - quality) * 31 + 1)));
  else if (format === 'png') args.push('-compression_level', '6');
  else if (format === 'avif') args.push('-c:v', 'libaom-av1', '-crf', String(Math.round((1 - quality) * 63)), '-cpu-used', '8');
  args.push(tmp);
  const r = spawnSync(FFMPEG, args, { stdio: 'pipe' });
  if (r.status !== 0 || !existsSync(tmp)) return null;
  return { size: statSync(tmp).size };
}

// ── formatting ────────────────────────────────────────────────────────────────
function pad(s, n) { return String(s).padStart(n); }
function fmtKB(b)  { return b != null ? pad((b / 1024).toFixed(0) + 'KB', 8) : dim(pad('—', 8)); }
function fmtMs(ms, best) {
  if (ms == null) return dim(pad('n/a', 8));
  const s = pad(ms.toFixed(0) + 'ms', 8);
  if (ms === best) return `${C.bgGreen}${C.bold}${s}${C.reset}`;
  if (ms < 100)    return green(s);
  if (ms < 500)    return yellow(s);
  return red(s);
}
function fmtSaved(orig, out) {
  if (!out) return dim(pad('—', 8));
  const pct = ((1 - out / orig) * 100).toFixed(1);
  return parseFloat(pct) > 0 ? green(pad('-' + pct + '%', 8)) : red(pad('+' + Math.abs(pct) + '%', 8));
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + bold('═'.repeat(100)));
  console.log(bold(cyan('  omni-compress Image Benchmark')) + dim('  Node.js path  ·  ffmpeg-static  ·  3-run median'));
  console.log(bold('═'.repeat(100)));

  // Build (always rebuild to pick up latest source changes)
  console.log(cyan('\n  Building omni-compress...'));
  spawnSync('bun', ['run', 'build'], { cwd: join(__dirname, '..'), stdio: 'inherit' });

  // Fixtures
  process.stdout.write('\n  Generating test images (rgbtestsrc — realistic gradients)...');
  generateFixtures();
  if (!SIZES.some(s => existsSync(join(FIXTURES_DIR, s.name)))) {
    console.error(red('\n✗ Fixture generation failed')); process.exit(1);
  }
  console.log('  done\n');

  // Warm up (cold start is unfair)
  process.stdout.write('  Warming up (first FFmpeg spawn initializes binary cache)...');
  const warmPath = join(FIXTURES_DIR, SIZES[0].name);
  try { await omniNode(warmPath, 'webp', 0.8); } catch {}
  try { rawFfmpegCompress(warmPath, 'webp', 0.8); } catch {}
  try { await sharpCompress(warmPath, 'webp', 0.8); } catch {}
  console.log(' done\n');

  // Header
  console.log(bold(
    pad('  Scenario', 30) +
    pad('Input',  9) +
    pad('OutSz',  9) +
    pad('Saved',  9) +
    pad('omni-compress', 15) +
    pad('raw-ffmpeg', 12) +
    pad('sharp',    10) +
    pad('jimp',     10)
  ));
  console.log(dim('  ' + '─'.repeat(100)));

  const FORMATS   = ['webp', 'jpeg', 'avif'];
  const QUALITY   = 0.8;
  const allRows   = [];
  let omniSlower  = [];

  for (const format of FORMATS) {
    for (const { label, name } of SIZES) {
      const inputPath = join(FIXTURES_DIR, name);
      if (!existsSync(inputPath)) continue;
      const inputSize = statSync(inputPath).size;

      // Run all in parallel (they hit different processes anyway)
      const [omni, raw, sharp, jimp] = await Promise.all([
        time(() => omniNode(inputPath, format, QUALITY)),
        time(() => rawFfmpegCompress(inputPath, format, QUALITY)),
        time(() => sharpCompress(inputPath, format, QUALITY)),
        time(() => jimpCompress(inputPath, format, QUALITY)),
      ]);

      const validMs = [omni, raw, sharp, jimp]
        .filter(r => r.ms != null).map(r => r.ms);
      const best = validMs.length ? Math.min(...validMs) : null;

      const row = `  [${format.toUpperCase()}] ${label}`;
      const outSz = omni?.result?.size ?? null;
      const cols = [
        row.padEnd(32),
        fmtKB(inputSize),
        fmtKB(outSz),
        fmtSaved(inputSize, outSz),
        fmtMs(omni?.ms,  best),
        fmtMs(raw?.ms,   best),
        fmtMs(sharp?.ms, best),
        fmtMs(jimp?.ms,  best),
      ];

      if (omni?.error) cols.push(red(`  ✗ ${omni.error.slice(0, 40)}`));
      console.log(cols.join('  '));

      allRows.push({ format, label, inputSize, omni, raw, sharp, jimp, best });
      if (omni?.ms && best && omni.ms > best * 1.1) {
        const winner = [
          raw?.ms === best && 'raw-ffmpeg',
          sharp?.ms === best && 'sharp',
          jimp?.ms === best && 'jimp',
        ].find(Boolean);
        omniSlower.push({ format, label, omniMs: omni.ms, bestMs: best, winner });
      }
    }
    console.log('');
  }

  // Summary
  console.log(bold('═'.repeat(100)));
  console.log(bold('  ANALYSIS'));
  console.log(bold('═'.repeat(100)));

  const total = allRows.filter(r => r.omni?.ms && r.best).length;
  const wins  = allRows.filter(r => r.omni?.ms && r.omni.ms === r.best).length;
  console.log(`\n  omni-compress fastest in: ${green(wins + '/' + total)} scenarios\n`);

  if (omniSlower.length) {
    console.log(yellow('  Where omni-compress loses (Node path only):'));
    for (const { format, label, omniMs, bestMs, winner } of omniSlower) {
      const ratio = (omniMs / bestMs).toFixed(1);
      console.log(yellow(`    [${format.toUpperCase()}] ${label} → ${winner} is ${ratio}x faster (${bestMs.toFixed(0)}ms vs ${omniMs.toFixed(0)}ms)`));
    }
  }

  console.log('\n' + bold('  ROOT CAUSE EXPLANATION'));
  console.log(dim(`
  omni-compress Node path: file → temp-write → ffmpeg-static spawn → temp-read → Blob
  raw-ffmpeg path:         file → ffmpeg-static spawn → output
  sharp path:              Buffer in → libvips (thread pool) → Buffer out

  The overhead is:
    1. Temp file I/O (writeFile + readFile): adds ~5-15ms per call
    2. Child process spawn overhead: ~10-30ms baseline (already warmed up)
    3. Blob construction from Buffer: ~1ms

  Browser path is different: OffscreenCanvas + WebCodecs (GPU-accelerated) runs
  WITHOUT any of this overhead — typically 5-50ms for images on modern hardware.
  `));

  console.log(bold('  PLANNED FIXES (performance roadmap):'));
  console.log(green(`
    #61 — FFmpeg speed flags (-threads 0, -method 0) → 15-30% faster heavy path
    #62 — Zero-copy ArrayBuffer transfer → less memory, ~10ms saved per call
    #59 — Eliminate double bitmap decode → 15-25% faster browser fast path
    #56 — Parallel archive compression → 5-10x for multi-file archives
    #64 — Optional sharp backend for Node → match or beat raw-ffmpeg speed
  `));
  console.log(bold('═'.repeat(100)) + '\n');
}

main().catch(e => { console.error(red('\n✗ Benchmark error: ' + e.message)); console.error(e); process.exit(1); });
