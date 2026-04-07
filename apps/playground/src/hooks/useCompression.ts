import { useState, useRef } from 'react';
import { 
  compressImage, 
  compressAudio, 
  compressVideo, 
  archive, 
  AbortError,
  isImageFile,
  isAudioFile,
  isVideoFile
} from "omni-compress";
import { triggerFeedback } from "../utils/feedback";
import type { CompressionStats } from '../types';

export function useCompression(isMuted: boolean) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<CompressionStats | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  const handleCompress = async (
    files: File[], 
    selectedFormat: string,
    options: {
      quality: number;
      maxWidth: string;
      maxHeight: string;
      preserveMetadata: boolean;
      audioBitrate: string;
      audioChannels: string;
      audioSampleRate: string;
      videoBitrate: string;
      videoFps: string;
      smartOptimize: boolean;
      archiveLevel: string;
    }
  ) => {
    if (files.length === 0 || !selectedFormat) return;
    
    triggerFeedback('click', isMuted);
    setIsProcessing(true);
    setProgress(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const start = performance.now();
      const isBatch = files.length > 1;

      if (selectedFormat === 'zip') {
        // --- ARCHIVE MODE (Batch or Single Generic) ---
        const archiveEntries = files.map(f => ({ name: f.name, data: f }));
        const totalOriginalSize = files.reduce((acc, f) => acc + f.size, 0);

        const zipResult = await archive(archiveEntries, {
          level: parseInt(options.archiveLevel, 10) as any,
          smartOptimize: options.smartOptimize,
          signal: controller.signal,
          onProgress: (p) => setProgress(p)
        });
        
        const time = Math.round(performance.now() - start);
        const url = URL.createObjectURL(zipResult.blob);
        setCompressedUrl(url);
        setStats({
          origSize: totalOriginalSize,
          newSize: zipResult.compressedSize,
          ratio: totalOriginalSize > 0 ? zipResult.compressedSize / totalOriginalSize : 1,
          time,
          format: 'zip',
        });

      } else if (isBatch) {
        // --- EXPLICIT BULK MEDIA COMPRESSION MODE ---
        const archiveEntries = [];
        let totalOriginalSize = 0;
        
        for (let i = 0; i < files.length; i++) {
          const currentFile = files[i];
          const isImage = isImageFile(currentFile);
          const isAudio = isAudioFile(currentFile);
          const isVideo = isVideoFile(currentFile);
          totalOriginalSize += currentFile.size;
          
          const updateProgress = (p: number) => {
            const baseProgress = (i / files.length) * 50;
            const itemProgress = (p / 100) * (50 / files.length);
            setProgress(Math.round(baseProgress + itemProgress));
          };

          let result;
          if (isImage) {
            result = await compressImage(currentFile, {
              format: selectedFormat as any,
              quality: options.quality / 100,
              maxWidth: options.maxWidth ? parseInt(options.maxWidth, 10) : undefined,
              maxHeight: options.maxHeight ? parseInt(options.maxHeight, 10) : undefined,
              preserveMetadata: options.preserveMetadata,
              onProgress: updateProgress,
              signal: controller.signal,
            });
          } else if (isAudio) {
            result = await compressAudio(currentFile, {
              format: selectedFormat as any,
              bitrate: options.audioBitrate,
              channels: options.audioChannels !== "auto" ? (parseInt(options.audioChannels, 10) as 1 | 2) : undefined,
              sampleRate: options.audioSampleRate !== "auto" ? parseInt(options.audioSampleRate, 10) : undefined,
              onProgress: updateProgress,
              signal: controller.signal,
            });
          } else if (isVideo) {
            result = await compressVideo(currentFile, {
              format: selectedFormat as any,
              bitrate: options.videoBitrate,
              fps: options.videoFps !== "auto" ? parseInt(options.videoFps, 10) : undefined,
              maxWidth: options.maxWidth ? parseInt(options.maxWidth, 10) : undefined,
              maxHeight: options.maxHeight ? parseInt(options.maxHeight, 10) : undefined,
              preserveMetadata: options.preserveMetadata,
              onProgress: updateProgress,
              signal: controller.signal,
            });
          } else {
            result = { blob: currentFile, format: currentFile.name.split('.').pop() || 'bin' };
          }
          
          const newName = currentFile.name.split('.').slice(0, -1).join('.') + '.' + (result as any).format;
          archiveEntries.push({ name: newName, data: (result as any).blob || result });
        }
        
        const zipResult = await archive(archiveEntries, {
          level: 0,
          signal: controller.signal,
          onProgress: (p) => setProgress(50 + Math.round(p / 2))
        });
        
        const time = Math.round(performance.now() - start);
        const url = URL.createObjectURL(zipResult.blob);
        setCompressedUrl(url);
        setStats({
          origSize: totalOriginalSize,
          newSize: zipResult.compressedSize,
          ratio: totalOriginalSize > 0 ? zipResult.compressedSize / totalOriginalSize : 1,
          time,
          format: 'zip',
        });

      } else {
        // --- SINGLE MEDIA MODE ---
        const singleFile = files[0];
        let result;

        if (isImageFile(singleFile)) {
          result = await compressImage(singleFile, {
            format: selectedFormat as any,
            quality: options.quality / 100,
            maxWidth: options.maxWidth ? parseInt(options.maxWidth, 10) : undefined,
            maxHeight: options.maxHeight ? parseInt(options.maxHeight, 10) : undefined,
            preserveMetadata: options.preserveMetadata,
            onProgress: (p: number) => setProgress(Math.round(p)),
            signal: controller.signal,
          });
        } else if (isAudioFile(singleFile)) {
          result = await compressAudio(singleFile, {
            format: selectedFormat as any,
            bitrate: options.audioBitrate,
            channels: options.audioChannels !== "auto" ? (parseInt(options.audioChannels, 10) as 1 | 2) : undefined,
            sampleRate: options.audioSampleRate !== "auto" ? parseInt(options.audioSampleRate, 10) : undefined,
            onProgress: (p: number) => setProgress(Math.round(p)),
            signal: controller.signal,
          });
        } else {
          result = await compressVideo(singleFile, {
            format: selectedFormat as any,
            bitrate: options.videoBitrate,
            fps: options.videoFps !== "auto" ? parseInt(options.videoFps, 10) : undefined,
            maxWidth: options.maxWidth ? parseInt(options.maxWidth, 10) : undefined,
            maxHeight: options.maxHeight ? parseInt(options.maxHeight, 10) : undefined,
            preserveMetadata: options.preserveMetadata,
            onProgress: (p: number) => setProgress(Math.round(p)),
            signal: controller.signal,
          });
        }

        const time = Math.round(performance.now() - start);
        const url = URL.createObjectURL(result.blob);
        setCompressedUrl(url);
        setStats({
          origSize: result.originalSize,
          newSize: result.compressedSize,
          ratio: result.ratio,
          time,
          format: result.format,
        });
      }
      triggerFeedback('success', isMuted);
    } catch (err: unknown) {
      if (err instanceof AbortError) {
        setProgress(0);
        return;
      }
      console.error(err);
      alert("Failed to process files");
    } finally {
      abortControllerRef.current = null;
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    progress,
    stats,
    compressedUrl,
    setCompressedUrl,
    setStats,
    setProgress,
    handleCompress,
    handleCancel
  };
}
