let jpegModule: typeof import('@jsquash/jpeg') | null = null;

async function load() {
  if (!jpegModule) {
    jpegModule = await import('@jsquash/jpeg');
  }
  return jpegModule;
}

/**
 * Encodes ImageData to JPEG using MozJPEG (Wasm).
 * Produces 5-16% smaller output than canvas libjpeg-turbo at equivalent quality.
 * Output is identical across Chrome, Firefox, and Safari.
 *
 * Quality is 0.0–1.0 (same scale as compressImage options), mapped to MozJPEG's 0–100.
 */
export async function encodeJPEG(imageData: ImageData, quality: number): Promise<ArrayBuffer> {
  const mod = await load();
  return mod.encode(imageData, { quality: Math.round(quality * 100) });
}
