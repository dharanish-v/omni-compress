import type { CompressorOptions } from '../../core/router.js';

let ffmpegInstance: any = null;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;

  // Rule 3: Dynamic Imports Only. Load FFmpeg ONLY when the Heavy Path is triggered.
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile } = await import('@ffmpeg/util');

  const ffmpeg = new FFmpeg();
  
  // Note: For production, core/wasm files should ideally be hosted and loaded explicitly.
  // Using unpkg/jsDelivr can cause issues in strict CSP environments, but we'll use defaults
  // for the sake of this library structure.
  await ffmpeg.load();
  ffmpegInstance = { ffmpeg, fetchFile };
  
  return ffmpegInstance;
}

export async function processImageHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions
): Promise<ArrayBuffer> {
  const { ffmpeg, fetchFile } = await getFFmpeg();
  
  const inputFileName = options.originalFileName || 'input_image';
  const outputFileName = `output_image.${options.format}`;
  
  // Convert ArrayBuffer to Uint8Array for FFmpeg
  const fileData = new Uint8Array(buffer);
  
  try {
    // Write file to virtual FS
    await ffmpeg.writeFile(inputFileName, await fetchFile(fileData));

    // Execute FFmpeg command
    // E.g., convert to webp: -i input -vcodec libwebp -lossless 0 -q:v 80 output.webp
    const qualityArgs = options.quality !== undefined ? ['-q:v', Math.floor(options.quality * 100).toString()] : [];
    
    const code = await ffmpeg.exec(['-i', inputFileName, ...qualityArgs, outputFileName]);
    if (code !== 0) {
      throw new Error(`FFmpeg image conversion failed with exit code ${code}`);
    }

    // Read result
    const resultData = await ffmpeg.readFile(outputFileName) as Uint8Array;
    
    // Convert back to ArrayBuffer, cloning data out of the Wasm memory space
    // so we can free the Wasm memory immediately
    const outBuffer = resultData.buffer.slice(resultData.byteOffset, resultData.byteOffset + resultData.byteLength);
    
    return outBuffer;
  } finally {
    // Rule 4: Wasm Memory Safety. Explicitly free memory after EVERY execution.
    try {
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);
    } catch (cleanupError) {
      console.warn('Failed to clean up FFmpeg virtual file system:', cleanupError);
    }
  }
}

export async function processAudioHeavyPath(
  buffer: ArrayBuffer,
  options: CompressorOptions
): Promise<ArrayBuffer> {
  const { ffmpeg, fetchFile } = await getFFmpeg();
  
  // Sanitize original file name to avoid FFmpeg command line parsing issues
  // Replace spaces and special characters with underscores
  let inputFileName = 'input_audio';
  if (options.originalFileName) {
    inputFileName = options.originalFileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  }
  const outputFileName = `output_audio.${options.format}`;
  
  const fileData = new Uint8Array(buffer);
  
  try {
    await ffmpeg.writeFile(inputFileName, await fetchFile(fileData));

    // Audio encoding arguments
    const bitrateArgs = ['-b:a', '128k']; // Simplified default
    
    const code = await ffmpeg.exec(['-y', '-i', inputFileName, ...bitrateArgs, outputFileName]);
    if (code !== 0) {
      throw new Error(`FFmpeg audio conversion failed with exit code ${code}`);
    }

    const resultData = await ffmpeg.readFile(outputFileName) as Uint8Array;
    
    // Extract ArrayBuffer
    const outBuffer = resultData.buffer.slice(resultData.byteOffset, resultData.byteOffset + resultData.byteLength);
    
    return outBuffer;
  } finally {
    // Rule 4: Wasm Memory Safety
    try {
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);
    } catch (cleanupError) {
      console.warn('Failed to clean up FFmpeg virtual file system:', cleanupError);
    }
  }
}
