/**
 * Lossless PNG optimization via @jsquash/oxipng (OxiPNG Rust/Wasm).
 *
 * Always runs in single-threaded (ST) mode on the main thread.
 * The MT variant (wasm-bindgen-rayon) requires a Worker context and
 * creates sub-workers whose filenames Vite hashes — causing 404 crashes.
 * ST mode is fast enough for all practical image sizes.
 *
 * Expected reduction: 20–35% vs raw OffscreenCanvas PNG output.
 */
type OptimiseFn = (data: ArrayBuffer | ImageData, options?: object) => Promise<ArrayBuffer>;
let _optimise: OptimiseFn | null = null;

export async function optimizePNG(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (!_optimise) {
    const mod = await import('@jsquash/oxipng');
    _optimise = mod.optimise as unknown as OptimiseFn;
  }
  return _optimise!(buffer, { level: 2 });
}
