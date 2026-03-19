export async function fileToArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export function arrayBufferToBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}

export function getMimeType(type: 'image' | 'audio', format: string): string {
  if (type === 'image') {
    if (format === 'jpg') return 'image/jpeg';
    return `image/${format}`;
  } else {
    return `audio/${format}`;
  }
}
