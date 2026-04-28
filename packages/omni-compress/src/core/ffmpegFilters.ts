import type { CompressorOptions } from './router.js';

interface FfmpegPosition {
  hPad: string;
  vPad: string;
  hCrop: string;
  vCrop: string;
}

function resolveFfmpegPosition(pos?: string): FfmpegPosition {
  const p = (pos ?? 'center').toLowerCase().replace(/[\s_]/g, '-');
  const hasLeft = p.includes('left') || p.includes('west');
  const hasRight = p.includes('right') || p.includes('east');
  const hasTop = p.includes('top') || p.includes('north');
  const hasBottom = p.includes('bottom') || p.includes('south');
  return {
    hPad: hasLeft ? '0' : hasRight ? 'ow-iw' : '(ow-iw)/2',
    vPad: hasTop ? '0' : hasBottom ? 'oh-ih' : '(oh-ih)/2',
    hCrop: hasLeft ? '0' : hasRight ? 'iw-ow' : '(iw-ow)/2',
    vCrop: hasTop ? '0' : hasBottom ? 'ih-oh' : '(ih-oh)/2',
  };
}

/**
 * Builds FFmpeg -vf filter strings for image resize.
 * Used by both the Node childProcess adapter and the browser FFmpeg Wasm heavy path.
 *
 * withoutEnlargement in contain/cover mode skips pad/crop since the scaled output
 * may be smaller than the target dimensions — a fixed-size pad/crop would be wrong.
 */
export function buildImageVfFilters(options: CompressorOptions): string[] {
  const filters: string[] = [];

  if (options.width || options.height) {
    const cW = options.width ?? 0;
    const cH = options.height ?? 0;
    const mode = options.resize ?? 'contain';
    const withoutEnlargement = options.withoutEnlargement ?? false;
    const bothDims = cW > 0 && cH > 0;
    const pos = resolveFfmpegPosition(options.position);

    // Scale target expressions — cap at original size when withoutEnlargement
    const sw = cW > 0 ? (withoutEnlargement ? `min(${cW},iw)` : `${cW}`) : '-1';
    const sh = cH > 0 ? (withoutEnlargement ? `min(${cH},ih)` : `${cH}`) : '-1';

    if (mode === 'contain') {
      filters.push(`scale=${sw}:${sh}:force_original_aspect_ratio=decrease`);
      // Pad to exact target only when both dims known and not withoutEnlargement
      if (bothDims && !withoutEnlargement) {
        filters.push(`pad=${cW}:${cH}:${pos.hPad}:${pos.vPad}`);
      }
    } else if (mode === 'cover') {
      filters.push(`scale=${sw}:${sh}:force_original_aspect_ratio=increase`);
      // Crop to exact target only when both dims known and not withoutEnlargement
      if (bothDims && !withoutEnlargement) {
        filters.push(`crop=${cW}:${cH}:${pos.hCrop}:${pos.vCrop}`);
      }
    } else if (mode === 'fill') {
      // Stretch to exact dims, ignore aspect ratio
      const fw = cW > 0 ? (withoutEnlargement ? `min(${cW},iw)` : `${cW}`) : 'iw';
      const fh = cH > 0 ? (withoutEnlargement ? `min(${cH},ih)` : `${cH}`) : 'ih';
      filters.push(`scale=${fw}:${fh}`);
    } else if (mode === 'inside') {
      // Contain without pad — canvas = actual scaled size
      filters.push(`scale=${sw}:${sh}:force_original_aspect_ratio=decrease`);
    } else if (mode === 'outside') {
      // Cover without crop — canvas may exceed target on one axis
      filters.push(`scale=${sw}:${sh}:force_original_aspect_ratio=increase`);
    } else {
      // 'none': scale to exact dimensions, no aspect ratio enforcement
      const nw = cW > 0 ? `${cW}` : 'iw';
      const nh = cH > 0 ? `${cH}` : 'ih';
      filters.push(`scale=${nw}:${nh}`);
    }
  } else if (options.maxWidth || options.maxHeight) {
    // Ceiling downscale — never upscale
    const w = options.maxWidth || -1;
    const h = options.maxHeight || -1;
    if (w !== -1 && h !== -1) {
      filters.push(`scale='min(${w},iw)':'min(${h},ih)':force_original_aspect_ratio=decrease`);
    } else {
      filters.push(`scale=${w}:${h}`);
    }
  }

  // Floor upscale (minWidth/minHeight)
  if (options.minWidth || options.minHeight) {
    const mW = options.minWidth || 0;
    const mH = options.minHeight || 0;
    if (mW && mH) {
      filters.push(`scale='max(${mW},iw)':'max(${mH},ih)':force_original_aspect_ratio=increase`);
    } else if (mW) {
      filters.push(`scale='max(${mW},iw)':-1`);
    } else {
      filters.push(`scale=-1:'max(${mH},ih)'`);
    }
  }

  return filters;
}
