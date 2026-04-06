import { useState, useRef, useEffect } from "react";
import { 
  compressImage, 
  compressAudio, 
  compressVideo,
  archive, 
  WorkerConfig, 
  AbortError,
  isImageFile,
  isAudioFile,
  isVideoFile,
  MT_SUPPORTED
} from "@dharanish/omni-compress";
import { themes } from "./themes";
import { triggerFeedback } from "./utils/feedback";
// @ts-ignore - Astro virtual module
import { navigate } from "astro:transitions/client";

// Shared Components
import { CustomAudioPlayer } from "./components/CustomAudioPlayer";
import { CustomSelect } from "./components/CustomSelect";

// Vite bundles these workers into self-contained assets and returns their URLs.
// @ts-ignore - Vite ?worker&url import
import ImageWorkerUrl from '../../../packages/omni-compress/src/workers/image.worker.ts?worker&url';
// @ts-ignore - Vite ?worker&url import
import AudioWorkerUrl from '../../../packages/omni-compress/src/workers/audio.worker.ts?worker&url';
// @ts-ignore - Vite ?worker&url import
import VideoWorkerUrl from '../../../packages/omni-compress/src/workers/video.worker.ts?worker&url';

WorkerConfig.imageWorkerUrl = ImageWorkerUrl;
WorkerConfig.audioWorkerUrl = AudioWorkerUrl;
WorkerConfig.videoWorkerUrl = VideoWorkerUrl;

const MAX_FILE_SIZE_MB = 250;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Custom event name used to coordinate exclusive audio playback (#10)
const AUDIO_PLAY_EVENT = 'omni-compress:audio-play';

const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";

function App({ initialTheme = 'en' }: { initialTheme?: string }) {
  const [activeThemeId] = useState<string>(initialTheme);
  const [isMTActive, setIsMTActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ origSize: number; newSize: number; ratio: number; time: number; format: string } | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [isMuted, setIsMuted] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Advanced Controls State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState<string>("");
  const [maxHeight, setMaxHeight] = useState<string>("");
  const [preserveMetadata, setPreserveMetadata] = useState(false);
  const [audioBitrate, setAudioBitrate] = useState("128k");
  const [audioChannels, setAudioChannels] = useState<string>("auto");
  const [audioSampleRate, setAudioSampleRate] = useState<string>("auto");
  const [videoBitrate, setVideoBitrate] = useState("1M");
  const [videoFps, setVideoFps] = useState<string>("auto");
  
  // Smart Archive Controls
  const [smartOptimize, setSmartOptimize] = useState(true);
  const [archiveLevel, setArchiveLevel] = useState("6");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeTheme = themes.find(t => t.id === activeThemeId) || themes[0];
  const t = activeTheme.strings;

  const isBatch = files.length > 1;
  const isAllImages = files.length > 0 && files.every(f => isImageFile(f));
  const isAllAudio = files.length > 0 && files.every(f => isAudioFile(f));
  const isAllVideos = files.length > 0 && files.every(f => isVideoFile(f));
  const isMixedOrGeneric = files.length > 0 && !isAllImages && !isAllAudio && !isAllVideos;

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Client-only: restore mute from sessionStorage after hydration (#11)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('omni-compress:muted');
      if (stored === 'true') setIsMuted(true);
    } catch {}
  }, []);

  // Client-only: detect Multi-threading support after hydration
  useEffect(() => {
    setIsMTActive(MT_SUPPORTED);
  }, []);

  // Persist mute preference across Astro view-transition navigations (#11)
  const hasMuteRestoredRef = useRef(false);
  useEffect(() => {
    if (!hasMuteRestoredRef.current) {
      hasMuteRestoredRef.current = true;
      return;
    }
    try { sessionStorage.setItem('omni-compress:muted', String(isMuted)); } catch {}
  }, [isMuted]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      triggerFeedback('click', isMuted);
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(activeTheme.colors).forEach(([key, value]) => {
      if (key !== 'filter' && key !== 'pattern') {
        const cssVarName = `--theme-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`;
        root.style.setProperty(cssVarName, value as string);
      }
    });

    document.body.classList.forEach(className => {
      if (className.startsWith('pattern-')) {
        document.body.classList.remove(className);
      }
    });
    
    // @ts-ignore - pattern is dynamically added to colors object
    const pattern = activeTheme.colors.pattern || 'grid';
    document.body.classList.add(`pattern-${pattern}`);

  }, [activeTheme]);

  useEffect(() => {
    if (files.length > 0) {
      if (isMixedOrGeneric) {
        setSelectedFormat('zip');
      } else if (isAllImages) {
        const firstFile = files[0];
        if (firstFile.type === 'image/webp') setSelectedFormat('avif');
        else setSelectedFormat('webp');
      } else if (isAllAudio) {
        const firstFile = files[0];
        if (firstFile.type === 'audio/mpeg' || firstFile.type === 'audio/mp3') setSelectedFormat('opus');
        else setSelectedFormat('mp3');
      } else if (isAllVideos) {
        setSelectedFormat('mp4');
      }
    }
  }, [files, isAllImages, isAllAudio, isAllVideos, isMixedOrGeneric]);

  useEffect(() => {
    return () => {
      if (originalUrl) {
        try { URL.revokeObjectURL(originalUrl); } catch (e) {}
      }
    };
  }, [originalUrl]);

  useEffect(() => {
    return () => {
      if (compressedUrl) {
        try { URL.revokeObjectURL(compressedUrl); } catch (e) {}
      }
    };
  }, [compressedUrl]);

  const processFiles = (selectedFiles: File[]) => {
    for (const selectedFile of selectedFiles) {
      if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        setFileSizeError(
          `File "${selectedFile.name}" is ${(selectedFile.size / 1024 / 1024).toFixed(1)} MB \u2014 exceeds the ${MAX_FILE_SIZE_MB} MB limit. ` +
            `Large files can exhaust WebAssembly memory and crash your browser tab.`,
        );
        setFiles([]);
        setOriginalUrl(null);
        setCompressedUrl(null);
        setStats(null);
        setProgress(0);
        return false;
      }
    }

    setFileSizeError(null);
    setFiles(selectedFiles);
    if (selectedFiles.length === 1) {
      setOriginalUrl(URL.createObjectURL(selectedFiles[0]));
    } else {
      setOriginalUrl(null); // No preview for batch
    }
    setCompressedUrl(null);
    setStats(null);
    setProgress(0);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      triggerFeedback('click', isMuted);
      const selectedFiles = Array.from(e.target.files);
      if (!processFiles(selectedFiles)) {
        e.target.value = '';
      }
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      triggerFeedback('click', isMuted);
      const droppedFiles = Array.from(e.dataTransfer.files);
      processFiles(droppedFiles);
    }
  };

  const handleClear = () => {
    triggerFeedback('click', isMuted);
    setFiles([]);
    setOriginalUrl(null);
    setCompressedUrl(null);
    setStats(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    triggerFeedback('click', isMuted);
    const newFiles = [...files];
    newFiles.splice(index, 1);
    processFiles(newFiles);
  };

  const handleCompress = async () => {
    if (files.length === 0 || !selectedFormat) return;
    triggerFeedback('click', isMuted);
    setIsProcessing(true);
    setProgress(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const start = performance.now();

      if (selectedFormat === 'zip') {
        // --- ARCHIVE MODE (Batch or Single Generic) ---
        const archiveEntries = files.map(f => ({ name: f.name, data: f }));
        
        const totalOriginalSize = files.reduce((acc, f) => acc + f.size, 0);

        const zipResult = await archive(archiveEntries, {
          level: parseInt(archiveLevel, 10) as any,
          smartOptimize,
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
              quality: quality / 100,
              maxWidth: maxWidth ? parseInt(maxWidth, 10) : undefined,
              maxHeight: maxHeight ? parseInt(maxHeight, 10) : undefined,
              preserveMetadata,
              onProgress: updateProgress,
              signal: controller.signal,
            });
          } else if (isAudio) {
            result = await compressAudio(currentFile, {
              format: selectedFormat as any,
              bitrate: audioBitrate,
              channels: audioChannels !== "auto" ? (parseInt(audioChannels, 10) as 1 | 2) : undefined,
              sampleRate: audioSampleRate !== "auto" ? parseInt(audioSampleRate, 10) : undefined,
              onProgress: updateProgress,
              signal: controller.signal,
            });
          } else if (isVideo) {
            result = await compressVideo(currentFile, {
              format: selectedFormat as any,
              bitrate: videoBitrate,
              fps: videoFps !== "auto" ? parseInt(videoFps, 10) : undefined,
              maxWidth: maxWidth ? parseInt(maxWidth, 10) : undefined,
              maxHeight: maxHeight ? parseInt(maxHeight, 10) : undefined,
              preserveMetadata,
              onProgress: updateProgress,
              signal: controller.signal,
            });
          } else {
            // Non-media file just copied to archive as is
            result = { blob: currentFile, format: currentFile.name.split('.').pop() || 'bin' };
          }
          
          const newName = currentFile.name.split('.').slice(0, -1).join('.') + '.' + result.format;
          archiveEntries.push({ name: newName, data: result.blob });
        }
        
        // Archive them without re-compressing the zip significantly since they are already compressed media
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
        const isImage = isImageFile(singleFile);

        let result;
        if (isImage) {
          result = await compressImage(singleFile, {
            format: selectedFormat as 'webp' | 'avif' | 'jpeg' | 'png',
            quality: quality / 100,
            maxWidth: maxWidth ? parseInt(maxWidth, 10) : undefined,
            maxHeight: maxHeight ? parseInt(maxHeight, 10) : undefined,
            preserveMetadata,
            onProgress: (p: number) => setProgress(Math.round(p)),
            signal: controller.signal,
          });
        } else if (isAudioFile(singleFile)) {
          result = await compressAudio(singleFile, {
            format: selectedFormat as 'opus' | 'mp3' | 'flac' | 'wav' | 'aac',
            bitrate: audioBitrate,
            channels: audioChannels !== "auto" ? (parseInt(audioChannels, 10) as 1 | 2) : undefined,
            sampleRate: audioSampleRate !== "auto" ? parseInt(audioSampleRate, 10) : undefined,
            onProgress: (p: number) => setProgress(Math.round(p)),
            signal: controller.signal,
          });
        } else {
          result = await compressVideo(singleFile, {
            format: selectedFormat as 'mp4' | 'webm',
            bitrate: videoBitrate,
            fps: videoFps !== "auto" ? parseInt(videoFps, 10) : undefined,
            maxWidth: maxWidth ? parseInt(maxWidth, 10) : undefined,
            maxHeight: maxHeight ? parseInt(maxHeight, 10) : undefined,
            preserveMetadata,
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

  const handleThemeChange = (nextTheme: string) => {
    triggerFeedback('shift', isMuted);
    navigate(`/omni-compress/${nextTheme === 'en' ? '' : nextTheme}`);
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 pb-20 font-sans transition-colors duration-500 flex items-center justify-center selection:bg-[var(--theme-accent)] selection:text-[var(--theme-accent-text)]"
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[1000] bg-[var(--theme-bg)]/80 backdrop-blur-sm flex items-center justify-center border-8 border-dashed border-[var(--theme-accent)] m-4 pointer-events-none">
          <div className="text-center p-12 bg-[var(--theme-card-bg)] border-4 border-[var(--theme-border)] shadow-[12px_12px_0px_0px_var(--theme-shadow)]">
            <svg className="w-24 h-24 text-[var(--theme-accent)] mx-auto mb-6 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <h2 className="text-4xl font-black uppercase tracking-tighter text-[var(--theme-text)]">Drop files anywhere</h2>
            <p className="text-lg font-bold text-[var(--theme-text)] mt-2 opacity-70 italic">to compress or archive instantly</p>
          </div>
        </div>
      )}
      
      {/* Top Controls */}
      <div className="fixed top-6 right-6 z-[200] flex items-center gap-4">
        
        {/* PWA Install Button */}
        {deferredPrompt && (
          <button 
            onClick={handleInstallClick}
            className="hidden sm:flex items-center gap-2 font-bold text-sm uppercase px-4 py-2 border-2 bg-[var(--theme-accent)] text-[var(--theme-accent-text)] border-[var(--theme-border)] shadow-[4px_4px_0px_0px_var(--theme-shadow)] transition-all hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            Install App
          </button>
        )}

        {/* Mute Toggle */}
        <button 
          onClick={() => {
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            triggerFeedback('click', false);
          }}
          className={`p-2 border-2 border-[var(--theme-border)] shadow-[4px_4px_0px_0px_var(--theme-shadow)] transition-all hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] ${isMuted ? 'bg-stone-200 text-stone-500' : 'bg-[var(--theme-card-bg)] text-[var(--theme-text)]'}`}
          title={isMuted ? "Unmute feedback" : "Mute feedback"}
        >
          {isMuted ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>

        {/* Theme Dropdown */}
        <CustomSelect
          value={activeThemeId}
          onChange={handleThemeChange}
          options={themes.map(t => ({ value: t.id, label: `${t.person} (${t.language})` }))}
          className="min-w-[240px]"
          isMuted={isMuted}
        />
      </div>

      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 relative">
        
        {/* Decorative background shapes */}
        <div style={{ viewTransitionName: 'shape-1' }} className="absolute -top-10 -left-10 w-48 h-48 rounded-full mix-blend-multiply opacity-50 blur-xl transition-colors duration-700 bg-[var(--theme-shape1)]"></div>
        <div style={{ viewTransitionName: 'shape-2' }} className="absolute -bottom-10 -right-10 w-72 h-72 mix-blend-multiply opacity-30 blur-2xl transform rotate-12 transition-colors duration-700 bg-[var(--theme-shape2)]"></div>
        <div style={{ viewTransitionName: 'shape-3' }} className="absolute top-1/2 left-1/4 w-64 h-64 mix-blend-multiply opacity-40 blur-2xl transform -translate-y-1/2 transition-colors duration-700 bg-[var(--theme-shape3)]"></div>

        {/* File Size Error Banner */}
        {fileSizeError && (
          <div className="col-span-1 md:col-span-12 mb-2 border-4 border-[var(--theme-border)] bg-red-100 text-red-900 p-6 shadow-[8px_8px_0px_0px_var(--theme-shadow)] relative z-10">
            <button
              onClick={() => {
                setFileSizeError(null);
                triggerFeedback('click', isMuted);
              }}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center border-2 border-current font-black text-lg hover:bg-red-900 hover:text-red-100 transition-colors cursor-pointer"
              aria-label="Dismiss error"
            >
              X
            </button>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-900 text-red-100 flex items-center justify-center border-2 border-current font-black text-2xl shadow-[4px_4px_0px_0px_var(--theme-shadow)]">
                !
              </div>
              <div>
                <h3 className="font-black text-lg uppercase tracking-wide mb-1">File Too Large</h3>
                <p className="font-bold text-sm">{fileSizeError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Multi-threading Status / Warning (#34) */}
        {!isMTActive && !import.meta.env.DEV && (
          <div className="col-span-1 md:col-span-12 mb-2 border-4 border-[var(--theme-border)] bg-amber-100 text-amber-900 p-6 shadow-[8px_8px_0px_0px_var(--theme-shadow)] relative z-10 text-[var(--theme-text)]">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-900 text-amber-100 flex items-center justify-center border-2 border-current font-black text-2xl shadow-[4px_4px_0px_0px_var(--theme-shadow)]">
                ⚠
              </div>
              <div>
                <h3 className="font-black text-lg uppercase tracking-wide mb-1">Performance Reduced</h3>
                <p className="font-bold text-sm">
                  <code>SharedArrayBuffer</code> is unavailable. FFmpeg will run in <b>single-threaded mode</b>. 
                  This usually happens when COOP/COEP headers are missing or blocked by your browser.
                </p>
              </div>
            </div>
          </div>
        )}

        {isMTActive && (
          <div className="col-span-1 md:col-span-12 mb-4 flex justify-end">
            <div className="inline-flex items-center gap-2 px-3 py-1 border-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[10px] font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--theme-shadow)] text-[var(--theme-text)]">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Neural Multi-threading Active
            </div>
          </div>
        )}

        {/* Header / Intro Section (Spans 5 cols) */}
        <div className="md:col-span-5 flex flex-col justify-center relative z-10" style={{ viewTransitionName: 'intro-section' }}>
          <div className="border-4 p-8 shadow-[12px_12px_0px_0px_var(--theme-shadow)] transform -rotate-1 hover:rotate-0 transition-all duration-300 bg-[var(--theme-card-bg)] border-[var(--theme-border)]">
            <h1 style={{ viewTransitionName: 'main-title' }} className="text-5xl font-black tracking-tighter uppercase leading-none mb-4 transition-colors text-[var(--theme-text)]">
              Omni<br />
              <span className="text-[var(--theme-accent)] italic normal-case block mt-1">
                {t.titleSuffix}
              </span>
            </h1>
            <p style={{ viewTransitionName: 'main-desc' }} className="text-lg font-medium leading-relaxed mb-6 border-l-4 pl-4 transition-colors text-[var(--theme-text)] border-[var(--theme-primary)] opacity-90">
              {t.desc}
            </p>

            <div className="space-y-4" style={{ viewTransitionName: 'controls-area' }}>
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`w-full cursor-pointer p-8 border-4 border-dashed transition-all duration-300 flex flex-col items-center justify-center gap-4 group
                  ${isDragging ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/10 scale-[0.98]' : 'border-[var(--theme-border)] bg-[var(--theme-card-bg)] hover:bg-[var(--theme-primary)]/5'}`}
              >
                <svg className={`w-12 h-12 transition-transform duration-500 ${isDragging ? 'scale-110' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div className="text-center">
                  <span className="text-xl font-black uppercase tracking-tight block text-[var(--theme-text)]">
                    {files.length === 0 ? 'Click or Drop Files' : `${files.length} Files Loaded`}
                  </span>
                  <span className="text-xs font-bold opacity-50 uppercase tracking-widest text-[var(--theme-text)]">
                    Images, Audio, or Mixed (Auto-ZIP)
                  </span>
                </div>
              </div>

              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />

              {files.length > 0 && (
                <div className="border-4 p-4 bg-[var(--theme-bg)] border-[var(--theme-border)] max-h-48 overflow-y-auto scrollbar-thin">
                  <div className="flex justify-between items-center mb-2 sticky top-0 bg-[var(--theme-bg)] pb-2 border-b-2 border-[var(--theme-border)]/20">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Selection Manifest</span>
                    <button onClick={handleClear} className="text-[10px] font-black uppercase text-red-600 hover:underline">Clear Selection</button>
                  </div>
                  <div className="space-y-2 text-[var(--theme-text)]">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-4 p-2 bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] text-xs font-bold group">
                        <span className="truncate flex-grow">{f.name}</span>
                        <span className="opacity-50 flex-shrink-0">{formatSize(f.size)}</span>
                        <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-red-600 hover:scale-125 transition-transform">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {files.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold uppercase text-[var(--theme-text)]">
                      {t.outputFormat} {isBatch && "(Batch)"}
                    </label>
                    {isLossy(files[0]) && !isBatch && selectedFormat !== 'zip' && (
                      <span className="text-[10px] px-2 py-0.5 font-bold rounded bg-[var(--theme-accent)] text-[var(--theme-accent-text)]">
                        {t.lossySource}
                      </span>
                    )}
                  </div>
                  
                  <CustomSelect
                    value={selectedFormat}
                    onChange={(val) => setSelectedFormat(val)}
                    isMuted={isMuted}
                    options={
                      isMixedOrGeneric ? [
                        { value: 'zip', label: 'ZIP Archive' }
                      ] : isAllImages ? [
                        ...(files[0].type !== 'image/webp' ? [{ value: 'webp', label: 'WebP (Optimized)' }] : []),
                        ...(files[0].type !== 'image/avif' ? [{ value: 'avif', label: 'AVIF (High Quality)' }] : []),
                        ...(!(files[0].type === 'image/jpeg' || files[0].type === 'image/jpg') ? [{ value: 'jpeg', label: 'JPEG (Standard)' }] : []),
                        ...(!isLossy(files[0]) && files[0].type !== 'image/png' ? [{ value: 'png', label: 'PNG (Lossless)' }] : []),
                        ...(isBatch ? [] : [{ value: 'zip', label: 'ZIP Archive' }])
                      ] : isAllAudio ? [
                        ...(files[0].type !== 'audio/mpeg' && files[0].type !== 'audio/mp3' ? [{ value: 'mp3', label: 'MP3 (Compressed)' }] : []),
                        ...(files[0].type !== 'audio/opus' ? [{ value: 'opus', label: 'Opus (Web-ready)' }] : []),
                        ...(!isLossy(files[0]) ? [
                          ...(files[0].type !== 'audio/flac' ? [{ value: 'flac', label: 'FLAC (Lossless)' }] : []),
                          ...(files[0].type !== 'audio/wav' && files[0].type !== 'audio/x-wav' ? [{ value: 'wav', label: 'WAV (Uncompressed)' }] : [])
                        ] : []),
                        ...(isBatch ? [] : [{ value: 'zip', label: 'ZIP Archive' }])
                      ] : [
                        { value: 'zip', label: 'ZIP Archive' }
                      ]
                    }
                  />
                </div>
              )}

              {/* Advanced Controls Toggle */}
              {files.length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setShowAdvanced(!showAdvanced);
                      triggerFeedback('click', isMuted);
                    }}
                    className="flex items-center gap-2 text-sm font-bold uppercase text-[var(--theme-text)] opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                    </svg>
                    {selectedFormat === 'zip' ? "Archive Options" : isAllImages ? "Advanced Image Options" : isAllAudio ? "Advanced Audio Options" : "Advanced Options"}
                  </button>
                  
                  {/* Advanced Panel */}
                  {showAdvanced && (
                    <div className="mt-4 p-4 border-2 border-[var(--theme-border)] bg-[var(--theme-bg)] flex flex-col gap-4">
                      
                      {/* Archive specific controls */}
                      {selectedFormat === 'zip' && (
                        <>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-xs font-bold uppercase text-[var(--theme-text)]">Deflate Level</label>
                              <span className="text-xs font-black bg-[var(--theme-card-bg)] px-2 py-0.5 border-2 border-[var(--theme-border)]">{archiveLevel}</span>
                            </div>
                            <input 
                              type="range" 
                              min="0" max="9" 
                              value={archiveLevel}
                              onChange={(e) => setArchiveLevel(e.target.value)}
                              onMouseUp={() => triggerFeedback('tick', isMuted)}
                              onTouchEnd={() => triggerFeedback('tick', isMuted)}
                              className="w-full accent-[var(--theme-primary)] bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] h-3 appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] uppercase font-bold mt-1 opacity-60">
                              <span>0 (Store)</span>
                              <span>9 (Max)</span>
                            </div>
                          </div>
                          
                          {isBatch && (
                            <label className="flex items-center gap-2 cursor-pointer group mt-2">
                              <div className="relative flex items-center justify-center w-6 h-6 border-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)]">
                                <input 
                                  type="checkbox" 
                                  className="opacity-0 absolute w-full h-full cursor-pointer"
                                  checked={smartOptimize}
                                  onChange={(e) => {
                                    setSmartOptimize(e.target.checked);
                                    triggerFeedback('click', isMuted);
                                  }}
                                />
                                {smartOptimize && <div className="w-3 h-3 bg-[var(--theme-accent)]"></div>}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold uppercase text-[var(--theme-text)] group-hover:opacity-100 opacity-80">Smart Optimize Media</span>
                                <span className="text-[10px] opacity-60">Pre-compress images/audio before archiving</span>
                              </div>
                            </label>
                          )}
                        </>
                      )}

                      {/* Image Specific Controls */}
                      {selectedFormat !== 'zip' && isAllImages && (
                        <>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-xs font-bold uppercase text-[var(--theme-text)]">Quality</label>
                              <span className="text-xs font-black bg-[var(--theme-card-bg)] px-2 py-0.5 border-2 border-[var(--theme-border)]">{quality}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="1" max="100" 
                              value={quality}
                              onChange={(e) => setQuality(Number(e.target.value))}
                              onMouseUp={() => triggerFeedback('tick', isMuted)}
                              onTouchEnd={() => triggerFeedback('tick', isMuted)}
                              className="w-full accent-[var(--theme-primary)] bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] h-3 appearance-none cursor-pointer"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-bold uppercase text-[var(--theme-text)] mb-1 block">Max Width (px)</label>
                              <input 
                                type="number" 
                                placeholder="Auto"
                                value={maxWidth}
                                onChange={e => setMaxWidth(e.target.value)}
                                className="w-full border-2 p-2 font-mono text-sm bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[var(--theme-border)] focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-bold uppercase text-[var(--theme-text)] mb-1 block">Max Height (px)</label>
                              <input 
                                type="number" 
                                placeholder="Auto"
                                value={maxHeight}
                                onChange={e => setMaxHeight(e.target.value)}
                                className="w-full border-2 p-2 font-mono text-sm bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[var(--theme-border)] focus:outline-none"
                              />
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <div className="relative flex items-center justify-center w-6 h-6 border-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)]">
                              <input 
                                type="checkbox" 
                                className="opacity-0 absolute w-full h-full cursor-pointer"
                                checked={preserveMetadata}
                                onChange={(e) => {
                                  setPreserveMetadata(e.target.checked);
                                  triggerFeedback('click', isMuted);
                                }}
                              />
                              {preserveMetadata && <div className="w-3 h-3 bg-[var(--theme-accent)]"></div>}
                            </div>
                            <span className="text-xs font-bold uppercase text-[var(--theme-text)] group-hover:opacity-100 opacity-80">Preserve EXIF Metadata</span>
                          </label>
                        </>
                      )}

                      {/* Audio Specific Controls */}
                      {selectedFormat !== 'zip' && isAllAudio && (
                        <>
                          <div>
                            <CustomSelect
                              label="Bitrate"
                              value={audioBitrate}
                              onChange={setAudioBitrate}
                              isMuted={isMuted}
                              options={[
                                { value: '64k', label: '64 kbps (Voice/Low)' },
                                { value: '128k', label: '128 kbps (Standard)' },
                                { value: '192k', label: '192 kbps (High)' },
                                { value: '320k', label: '320 kbps (Audiophile)' },
                              ]}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <CustomSelect
                              label="Channels"
                              value={audioChannels}
                              onChange={setAudioChannels}
                              isMuted={isMuted}
                              options={[
                                { value: 'auto', label: 'Auto (Original)' },
                                { value: '1', label: 'Mono (1)' },
                                { value: '2', label: 'Stereo (2)' }
                              ]}
                            />
                            <CustomSelect
                              label="Sample Rate"
                              value={audioSampleRate}
                              onChange={setAudioSampleRate}
                              isMuted={isMuted}
                              options={[
                                { value: 'auto', label: 'Auto' },
                                { value: '48000', label: '48000 Hz' },
                                { value: '44100', label: '44100 Hz' },
                                { value: '22050', label: '22050 Hz' }
                              ]}
                            />
                          </div>
                        </>
                      )}

                      {/* Video Specific Controls */}
                      {selectedFormat !== 'zip' && isAllVideos && (
                        <>
                          <div>
                            <CustomSelect
                              label="Video Bitrate"
                              value={videoBitrate}
                              onChange={setVideoBitrate}
                              isMuted={isMuted}
                              options={[
                                { value: '500k', label: '500 kbps (Low)' },
                                { value: '1M', label: '1 Mbps (Standard)' },
                                { value: '2M', label: '2 Mbps (High)' },
                                { value: '5M', label: '5 Mbps (Maximum)' },
                              ]}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-[var(--theme-text)]">
                            <CustomSelect
                              label="FPS"
                              value={videoFps}
                              onChange={setVideoFps}
                              isMuted={isMuted}
                              options={[
                                { value: 'auto', label: 'Auto' },
                                { value: '24', label: '24 FPS (Cinematic)' },
                                { value: '30', label: '30 FPS (Standard)' },
                                { value: '60', label: '60 FPS (Fluid)' }
                              ]}
                            />
                            <div>
                              <label className="text-xs font-bold uppercase text-[var(--theme-text)] mb-1 block">Max Width</label>
                              <input 
                                type="number" 
                                placeholder="Auto"
                                value={maxWidth}
                                onChange={e => setMaxWidth(e.target.value)}
                                className="w-full border-2 p-2 font-mono text-sm bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[var(--theme-border)] focus:outline-none"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              <button
                onClick={isProcessing ? handleCancel : handleCompress}
                disabled={files.length === 0 && !isProcessing}
                className={`group relative w-full font-bold py-4 px-6 border-2 shadow-[6px_6px_0px_0px_var(--theme-shadow)] transition-all overflow-hidden
                  ${(files.length === 0 && !isProcessing)
                    ? "bg-stone-200 text-stone-500 cursor-not-allowed shadow-none translate-x-[2px] translate-y-[2px] border-[var(--theme-border)]"
                    : isProcessing
                      ? "bg-red-600 text-white border-[var(--theme-border)] hover:bg-red-700 hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] cursor-pointer"
                      : "bg-[var(--theme-secondary)] text-[var(--theme-text)] border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-accent-text)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px]"}`}
              >
                {/* Progress Fill Layer */}
                {isProcessing && (
                  <div
                    className="absolute top-0 left-0 h-full bg-white/20 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  ></div>
                )}

                <div className="relative flex justify-center items-center gap-2">
                  {isProcessing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t.processing} {progress}% — Click to Cancel
                    </>
                  ) : (selectedFormat === 'zip' ? "Archive" : isBatch ? "Compress & Zip" : t.startCompress)}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Results / Preview Section (Spans 7 cols) */}
        <div className="md:col-span-7 relative z-10 flex flex-col justify-center" style={{ viewTransitionName: 'preview-section' }}>
          {(files.length === 0 && !compressedUrl) && (
            <div style={{ viewTransitionName: 'empty-state-quote' }} className="h-full min-h-[400px] border-4 border-dashed flex items-center justify-center transform rotate-1 p-8 text-center transition-all duration-500 border-[var(--theme-secondary)]/50 bg-[var(--theme-card-bg)]/40">
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              <p className="text-2xl font-bold rotate-[-2deg] transition-colors text-[var(--theme-text)] opacity-80 relative z-10">
                <span className="italic">"{t.quote.split('-')[0].replace(/"/g, '').trim()}"</span><br/>
                <span className="text-lg opacity-70 block mt-4">- {t.quote.split('-').slice(1).join('-').trim()}</span>
              </p>
            </div>
          )}

          {(files.length > 0 || compressedUrl) && (
            <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-6 h-full">
              
              {/* Conversion Arrow (Desktop Only) */}
              {compressedUrl && (
                <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 items-center justify-center pointer-events-none">
                  <div className="bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] p-2 rounded-full shadow-[4px_4px_0px_0px_var(--theme-shadow)] rotate-[-15deg]">
                    <svg className="w-6 h-6 text-[var(--theme-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Original Card */}
              {(originalUrl || isBatch || (!isImageFile(files[0]) && !isAudioFile(files[0]))) && (
                <div style={{ viewTransitionName: 'original-card' }} className="border-4 p-4 flex flex-col transition-all duration-500 bg-[var(--theme-card-bg)] border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)]">
                  <div className="font-bold uppercase tracking-wider py-1 px-3 inline-block self-start mb-4 border-2 bg-[var(--theme-secondary)] text-[var(--theme-text)] border-[var(--theme-border)]">
                    {isBatch ? "BATCH UPLOAD" : t.original}
                  </div>
                  <div className="flex-grow flex items-center justify-center border-2 overflow-hidden relative group transition-colors bg-[var(--theme-bg)] border-[var(--theme-border)]">
                    {isBatch ? (
                      <div className="w-full h-full flex flex-col justify-center items-center p-4 text-center">
                        <svg className="w-16 h-16 opacity-50 mb-2 text-[var(--theme-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                        </svg>
                        <span className="font-bold text-[var(--theme-text)] opacity-80">{files.length} Files Selected</span>
                      </div>
                    ) : (
                      isImageFile(files[0]) && originalUrl ? (
                        <img src={originalUrl} alt="Original" className={`max-h-64 object-contain group-hover:scale-105 transition-transform ${activeTheme.colors.filter}`} />
                      ) : isAudioFile(files[0]) && originalUrl ? (
                        <div className="w-full h-full flex flex-col justify-center items-center p-4">
                          <CustomAudioPlayer src={originalUrl} isMuted={isMuted} />
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col justify-center items-center p-4 text-center overflow-hidden">
                          <svg className="w-16 h-16 opacity-50 mb-2 text-[var(--theme-text)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="font-bold text-[var(--theme-text)] opacity-80 truncate w-full px-4">{files[0]?.name}</span>
                        </div>
                      )
                    )}
                  </div>
                  {stats && (
                    <div className="mt-4 flex justify-between items-end border-t-2 border-dashed pt-4 border-[var(--theme-border)] opacity-80">
                      <span className="text-sm font-bold uppercase text-[var(--theme-text)]">{t.size}</span>
                      <span className="text-xl font-black text-[var(--theme-text)]">{formatSize(stats.origSize)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Compressed Card */}
              {compressedUrl && stats && (
                <div style={{ viewTransitionName: 'compressed-card' }} className="border-4 p-4 flex flex-col transform md:translate-y-8 transition-all duration-500 bg-[var(--theme-card-alt)] border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)] text-[var(--theme-card-alt-text)]">
                  <div className="font-black uppercase tracking-wider py-1 px-3 inline-block self-start mb-4 border-2 bg-[var(--theme-accent)] text-[var(--theme-accent-text)] border-[var(--theme-card-alt-text)]">
                    {stats.format === 'zip' ? "ARCHIVE" : t.masterpiece}
                  </div>
                  <div className="flex-grow flex items-center justify-center border-2 overflow-hidden relative transition-colors bg-[var(--theme-bg)]/10 border-[var(--theme-border)]">
                    {stats.format === 'zip' ? (
                       <div className="w-full h-full flex flex-col justify-center items-center p-4 text-center">
                        <svg className="w-16 h-16 opacity-50 mb-2 text-[var(--theme-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        <span className="font-bold text-[var(--theme-accent)] opacity-80">omni-compress.zip</span>
                       </div>
                    ) : (
                      isImageFile(files[0]) ? (
                        <img src={compressedUrl} alt="Compressed" className={`max-h-64 object-contain ${activeTheme.colors.filter}`} />
                      ) : (
                        <div className="w-full h-full flex flex-col justify-center items-center p-4">
                          <CustomAudioPlayer src={compressedUrl} isCompressed isMuted={isMuted} />
                        </div>
                      )
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t-2 border-dashed pt-4 border-[var(--theme-border)] opacity-80">
                    <div>
                      <span className="text-xs font-bold uppercase block opacity-70">{t.newSize}</span>
                      <span className="text-xl font-black text-[var(--theme-accent)]">{formatSize(stats.newSize)}</span>
                      <span className="text-xs font-bold block mt-1 text-[var(--theme-accent)]">
                        ↓ {Math.round((1 - stats.ratio) * 100)}% smaller
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold uppercase block opacity-70">{t.time}</span>
                      <span className="text-xl font-black text-[var(--theme-secondary)]">{stats.time}ms</span>
                    </div>
                  </div>
                  <a 
                    href={compressedUrl} 
                    download={stats.format === 'zip' ? "omni-compress.zip" : `compressed-${files[0]?.name.split('.').slice(0, -1).join('.') || 'file'}.${stats.format}`}
                    onClick={() => triggerFeedback('click', isMuted)}
                    className="mt-4 w-full text-center font-bold py-3 px-4 border-2 transition-all uppercase tracking-widest bg-[var(--theme-primary)] text-[var(--theme-primary-text)] border-[var(--theme-border)] shadow-[6px_6px_0px_0px_var(--theme-shadow)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px]"
                  >
                    {t.download}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer / Copyright */}
      <footer className="fixed bottom-0 left-0 w-full p-2 border-t-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text)] z-50 flex justify-center items-center">
        <div className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
          <span>&copy; {new Date().getFullYear()} Dharanish V</span>
          <span className="w-1 h-1 bg-[var(--theme-accent)] rounded-full"></span>
          <a href="/omni-compress/benchmark" className="hover:text-[var(--theme-primary)] transition-colors underline decoration-2 underline-offset-4">
            Benchmark
          </a>
          <span className="w-1 h-1 bg-[var(--theme-accent)] rounded-full"></span>
          <a href="https://github.com/dharanish-v/omni-compress#migration-from-compressorjs" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--theme-primary)] transition-colors underline decoration-2 underline-offset-4">
            Migration
          </a>
          <span className="w-1 h-1 bg-[var(--theme-accent)] rounded-full"></span>
          <a href="https://github.com/dharanish-v/omni-compress" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--theme-primary)] transition-colors underline decoration-2 underline-offset-4">
            Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;