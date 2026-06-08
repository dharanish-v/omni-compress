import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE = '/omni-compress';

function createMinimalPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

// Minimal valid WAV: 44-byte header + ~1KB of silence
function createMinimalWav(): Buffer {
  const sampleRate = 44100;
  const numSamples = 1000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;
  const buf = Buffer.alloc(44 + dataSize, 0);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(fileSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);           // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

// The compress/archive button uses theme-translated text.
// In the default English theme:
//   - single file (non-zip): "Start Process"  (t.startCompress)
//   - selectedFormat=zip: "Archive"
//   - batch media: "Compress & Zip"
// These strings don't appear in any other button, so exact text is safe.
async function clickCompressButton(page: import('@playwright/test').Page) {
  const btn = page.locator('button').filter({
    hasText: /^(Start Process|Archive|Compress & Zip)$/,
  }).first();
  await expect(btn).toBeVisible({ timeout: 5_000 });
  await btn.click();
}

// Select a format from the CustomSelect dropdown.
// currentLabel: text currently shown in the trigger (the selected format).
// targetLabel: the option to switch to.
async function selectFormat(
  page: import('@playwright/test').Page,
  currentLabel: string,
  targetLabel: string,
) {
  // Click the trigger button identified by its displayed text to open the dropdown
  await page.locator('button').filter({ hasText: currentLabel }).first().click();
  // Click the target option (appears only after dropdown opens)
  await page.locator('button').filter({ hasText: targetLabel }).first().click();
}

// Bug 1 regression: WAV→Opus output must be a valid Ogg container, not raw frames.
// After the fix, processAudioFastPath throws for Opus → Worker catches → FFmpeg heavy path
// produces proper Ogg Opus via libopus.
// NOTE: Requires FFmpeg Wasm download from CDN — needs internet access.
test('WAV→Opus output is valid Ogg container (no raw frames)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');

  const tmpWav = path.join('/tmp', 'test-opus.wav');
  fs.writeFileSync(tmpWav, createMinimalWav());

  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput).toBeAttached({ timeout: 15_000 });
  await fileInput.setInputFiles(tmpWav);

  // WAV auto-selects MP3 — switch to Opus via the format dropdown
  await selectFormat(page, 'MP3 (Compressed)', 'Opus (Web-ready)');

  let alertFired = false;
  page.on('dialog', (dialog) => { alertFired = true; dialog.dismiss(); });

  await clickCompressButton(page);

  // FFmpeg single-threaded Wasm loads from CDN (~10 MB) on first call — allow up to 80s
  const downloadLink = page.getByRole('link', { name: /download/i }).first();
  await expect(downloadLink).toBeVisible({ timeout: 80_000 });
  expect(alertFired).toBe(false);

  // Verify output is a valid Ogg container (OggS magic bytes: 4F 67 67 53)
  const blobUrl = await downloadLink.getAttribute('href');
  expect(blobUrl).toMatch(/^blob:/);

  const magic = await page.evaluate(async (url: string) => {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    return Array.from(new Uint8Array(buf, 0, 4));
  }, blobUrl!);

  expect(magic).toEqual([0x4f, 0x67, 0x67, 0x53]); // OggS

  fs.unlinkSync(tmpWav);
});

// Bug 5 regression: stats panel clears when a new file is uploaded
test('stats panel clears when a new file is uploaded', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');

  const tmpPng1 = path.join('/tmp', 'test-stale-1.png');
  const tmpPng2 = path.join('/tmp', 'test-stale-2.png');
  fs.writeFileSync(tmpPng1, createMinimalPng());
  fs.writeFileSync(tmpPng2, createMinimalPng());

  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput).toBeAttached({ timeout: 15_000 });

  // Upload first PNG and compress (OffscreenCanvas fast path — < 1s)
  await fileInput.setInputFiles(tmpPng1);
  await clickCompressButton(page);
  await expect(page.getByText(/masterpiece/i).first()).toBeVisible({ timeout: 20_000 });

  // Upload a new file — stats must clear immediately
  await fileInput.setInputFiles(tmpPng2);
  await expect(page.getByRole('link', { name: /download/i })).not.toBeVisible({ timeout: 3_000 });

  fs.unlinkSync(tmpPng1);
  fs.unlinkSync(tmpPng2);
});

// Bug 5 regression (variant): stats clear when a file is removed via the × button
test('stats panel clears when a file is removed from manifest', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');

  const tmpPng = path.join('/tmp', 'test-stale-remove.png');
  fs.writeFileSync(tmpPng, createMinimalPng());

  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput).toBeAttached({ timeout: 15_000 });
  await fileInput.setInputFiles(tmpPng);
  await clickCompressButton(page);
  await expect(page.getByRole('link', { name: /download/i }).first()).toBeVisible({ timeout: 20_000 });

  // Click the × remove button in the manifest
  await page.locator('button').filter({ hasText: '×' }).first().click();
  await expect(page.getByRole('link', { name: /download/i })).not.toBeVisible({ timeout: 3_000 });

  fs.unlinkSync(tmpPng);
});

// Bug 3 regression: Smart Optimize archive with mixed PNG + WAV must not crash.
// WAV audio → compressed to MP3 (via FFmpeg heavy path), PNG → WebP.
// NOTE: Requires FFmpeg Wasm download from CDN — needs internet access.
test('Smart Optimize archive with PNG + WAV completes without error', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');

  const tmpPng = path.join('/tmp', 'test-archive.png');
  const tmpWav = path.join('/tmp', 'test-archive.wav');
  fs.writeFileSync(tmpPng, createMinimalPng());
  fs.writeFileSync(tmpWav, createMinimalWav());

  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput).toBeAttached({ timeout: 15_000 });
  await fileInput.setInputFiles([tmpPng, tmpWav]);

  // Mixed files → ZIP format auto-selected; Smart Optimize is on by default
  await expect(page.getByText(/zip/i).first()).toBeVisible({ timeout: 5_000 });

  let alertFired = false;
  page.on('dialog', (dialog) => { alertFired = true; dialog.dismiss(); });

  // Button text = "Archive" when selectedFormat=zip
  await clickCompressButton(page);

  const downloadLink = page.getByRole('link', { name: /download/i }).first();
  await expect(downloadLink).toBeVisible({ timeout: 100_000 });

  expect(alertFired).toBe(false);
  const href = await downloadLink.getAttribute('href');
  expect(href).toMatch(/^blob:/);

  fs.unlinkSync(tmpPng);
  fs.unlinkSync(tmpWav);
});

// Bug 6 regression: upload zone label uses theme selectFile string (not hardcoded English)
test('upload zone label uses theme selectFile string', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');
  // English theme: selectFile = "Select File(s)"
  await expect(page.getByText('Select File(s)')).toBeVisible({ timeout: 10_000 });
});
