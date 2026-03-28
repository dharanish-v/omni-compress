import { useState, useRef, useEffect } from "react";
import { compressImage, compressAudio, archive, WorkerConfig, AbortError } from "@dharanish/omni-compress";
import { themes } from "./themes";
import { triggerFeedback } from "./utils/feedback";
// @ts-ignore - Astro virtual module
import { navigate } from "astro:transitions/client";

// Vite bundles these workers into self-contained assets and returns their URLs.
// @ts-ignore - Vite ?worker&url import
import ImageWorkerUrl from '../../../packages/omni-compress/src/workers/image.worker.ts?worker&url';
// @ts-ignore - Vite ?worker&url import
import AudioWorkerUrl from '../../../packages/omni-compress/src/workers/audio.worker.ts?worker&url';

WorkerConfig.imageWorkerUrl = ImageWorkerUrl;
WorkerConfig.audioWorkerUrl = AudioWorkerUrl;

const MAX_FILE_SIZE_MB = 250;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Custom event name used to coordinate exclusive audio playback (#10)
const AUDIO_PLAY_EVENT = 'omni-compress:audio-play';

function CustomAudioPlayer({ src, isCompressed = false, isMuted = false }: { src: string; isCompressed?: boolean; isMuted?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const instanceId = useRef(Math.random().toString(36).slice(2));

  // Pause this player when another player starts (#10)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail !== instanceId.current && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener(AUDIO_PLAY_EVENT, handler);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, handler);
  }, []);

  const togglePlay = () => {
    triggerFeedback('click', isMuted);
    if (audioRef.current?.paused) {
      // Broadcast so other players pause first
      window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: instanceId.current }));
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      triggerFeedback('tick', isMuted);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const accentBg = isCompressed ? "bg-[var(--theme-accent)] text-[var(--theme-accent-text)]" : "bg-[var(--theme-primary)] text-[var(--theme-primary-text)]";
  const accentColor = isCompressed ? "bg-[var(--theme-accent)]" : "bg-[var(--theme-primary)]";
  const trackColor = isCompressed ? "bg-white/20" : "bg-[var(--theme-border)]/20";
  const containerBorder = isCompressed ? "border-[var(--theme-card-alt-text)]/30" : "border-[var(--theme-border)]/50";
  const shadowColor = isCompressed ? "shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]" : "shadow-[4px_4px_0px_0px_var(--theme-shadow)]";
  const miniShadow = isCompressed ? "shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]" : "shadow-[2px_2px_0px_0px_var(--theme-shadow)]";

  const readoutBg = isCompressed ? "bg-[var(--theme-border)]/20" : "bg-[var(--theme-card-bg)]";
  const readoutText = isCompressed ? "text-[var(--theme-card-alt-text)]" : "text-[var(--theme-text)]";

  return (
    <div className={`w-full flex flex-col p-6 border-2 ${containerBorder} bg-transparent`}>
      <audio 
        ref={audioRef} 
        src={src} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />
      
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={togglePlay}
          className={`w-12 h-12 flex items-center justify-center border-2 border-transparent hover:border-current ${shadowColor} active:translate-x-1 active:translate-y-1 active:shadow-none transition-all ${accentBg}`}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        
        {/* Refined Duration Readout */}
        <div className={`flex items-center gap-2 px-3 py-1.5 border-2 ${containerBorder} ${readoutBg} ${miniShadow} font-mono text-sm tracking-tight`}>
          <span className={`font-black ${readoutText}`}>{formatTime(currentTime)}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-black leading-none ${isCompressed ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]' : 'bg-[var(--theme-primary)] text-[var(--theme-primary-text)]'} shadow-[1px_1px_0px_0px_var(--theme-shadow)]`}>
            /
          </span>
          <span className={`font-bold opacity-60 ${readoutText}`}>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Refined Mechanical Seek Bar */}
      <div className="relative w-full h-8 flex items-center group cursor-pointer">
        <div className={`absolute w-full h-2 ${trackColor} border border-current/10`}></div>
        <div 
          className={`absolute h-2 ${accentColor} transition-all duration-75 shadow-inner`} 
          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        ></div>
        
        {/* Mechanical Knob Handle */}
        <div 
          className={`absolute w-4 h-6 ${accentColor} border-2 border-current ${miniShadow} transform -translate-x-1/2 group-hover:scale-110 transition-transform flex flex-col justify-around py-1 px-0.5`}
          style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        >
          <div className="w-full h-[1px] bg-current/30"></div>
          <div className="w-full h-[1px] bg-current/30"></div>
          <div className="w-full h-[1px] bg-current/30"></div>
        </div>

        <input 
          type="range" 
          min="0" 
          max={duration || 100} 
          step="0.01"
          value={currentTime} 
          onChange={handleSeek}
          className="absolute w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

function CustomSelect({ 
  value, 
  onChange, 
  options, 
  label,
  className = "",
  isMuted = false
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: { value: string; label: string }[]; 
  label?: string;
  className?: string;
  isMuted?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="text-sm font-bold uppercase text-[var(--theme-text)] mb-2 block">{label}</label>}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          triggerFeedback('click', isMuted);
        }}
        className="w-full flex items-center justify-between border-2 p-3 font-bold bg-[var(--theme-bg)] text-[var(--theme-text)] border-[var(--theme-border)] shadow-[4px_4px_0px_0px_var(--theme-shadow)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all focus:outline-none"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <svg 
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-2 bg-[var(--theme-card-bg)] border-4 border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)] max-h-60 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                triggerFeedback('shift', isMuted);
              }}
              className={`w-full text-left p-3 font-bold hover:bg-[var(--theme-primary)] hover:text-[var(--theme-primary-text)] transition-colors border-b-2 border-[var(--theme-border)] last:border-b-0
                ${option.value === value ? "bg-[var(--theme-secondary)] text-[var(--theme-text)]" : "text-[var(--theme-text)]"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App({ initialTheme = 'en' }: { initialTheme?: string }) {
  const [activeThemeId] = useState<string>(initialTheme);
  const [sabMissing, setSabMissing] = useState(false);
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

  // Advanced Controls State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState<string>("");
  const [maxHeight, setMaxHeight] = useState<string>("");
  const [preserveMetadata, setPreserveMetadata] = useState(false);
  const [audioBitrate, setAudioBitrate] = useState("128k");
  const [audioChannels, setAudioChannels] = useState<string>("auto");
  const [audioSampleRate, setAudioSampleRate] = useState<string>("auto");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeTheme = themes.find(t => t.id === activeThemeId) || themes[0];
  const t = activeTheme.strings;

  const isBatch = files.length > 1;

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

  // Client-only: detect missing SharedArrayBuffer after hydration (#12)
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const timer = setTimeout(() => {
      if (typeof SharedArrayBuffer === 'undefined') setSabMissing(true);
    }, 1500);
    return () => clearTimeout(timer);
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
      const firstFile = files[0];
      const isImage = isImageFile(firstFile);
      if (isImage) {
        if (firstFile.type === 'image/webp') setSelectedFormat('avif');
        else setSelectedFormat('webp');
      } else {
        if (firstFile.type === 'audio/mpeg' || firstFile.type === 'audio/mp3') setSelectedFormat('opus');
        else setSelectedFormat('mp3');
      }
    }
  }, [files]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      triggerFeedback('click', isMuted);
      
      const selectedFiles = Array.from(e.target.files);
      
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
          e.target.value = '';
          return;
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
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
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

      if (isBatch) {
        // --- BATCH ARCHIVE MODE ---
        const archiveEntries = [];
        let totalOriginalSize = 0;
        
        for (let i = 0; i < files.length; i++) {
          const currentFile = files[i];
          const isImage = currentFile.type.startsWith('image/');
          totalOriginalSize += currentFile.size;
          
          // Progress roughly updates based on how many files we've compressed + 50% for archiving
          const updateProgress = (p: number) => {
            const baseProgress = (i / files.length) * 50;
            const itemProgress = (p / 100) * (50 / files.length);
            setProgress(Math.round(baseProgress + itemProgress));
          };

          // Handle mixed batch where selectedFormat might be incompatible with currentFile
          let itemFormat = selectedFormat;
          if (isImage && !['webp', 'avif', 'jpeg', 'png'].includes(itemFormat)) {
             itemFormat = currentFile.type === 'image/webp' ? 'avif' : 'webp';
          } else if (!isImage && !['opus', 'mp3', 'flac', 'wav', 'aac'].includes(itemFormat)) {
             itemFormat = (currentFile.type === 'audio/mpeg' || currentFile.type === 'audio/mp3') ? 'opus' : 'mp3';
          }

          let result;
          if (isImage) {
            result = await compressImage(currentFile, {
              format: itemFormat as any,
              quality: quality / 100,
              maxWidth: maxWidth ? parseInt(maxWidth, 10) : undefined,
              maxHeight: maxHeight ? parseInt(maxHeight, 10) : undefined,
              preserveMetadata,
              onProgress: updateProgress,
              signal: controller.signal,
            });
          } else {
            result = await compressAudio(currentFile, {
              format: itemFormat as any,
              bitrate: audioBitrate,
              channels: audioChannels !== "auto" ? (parseInt(audioChannels, 10) as 1 | 2) : undefined,
              sampleRate: audioSampleRate !== "auto" ? parseInt(audioSampleRate, 10) : undefined,
              onProgress: updateProgress,
              signal: controller.signal,
            });
          }
          
          const newName = currentFile.name.split('.').slice(0, -1).join('.') + '.' + result.format;
          archiveEntries.push({ name: newName, data: result.blob });
        }
        
        // Now archive them
        const zipResult = await archive(archiveEntries, {
          level: 6,
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
        // --- SINGLE FILE MODE ---
        const singleFile = files[0];
        const isImage = singleFile.type.startsWith('image/');

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
        } else {
          result = await compressAudio(singleFile, {
            format: selectedFormat as 'opus' | 'mp3' | 'flac' | 'wav' | 'aac',
            bitrate: audioBitrate,
            channels: audioChannels !== "auto" ? (parseInt(audioChannels, 10) as 1 | 2) : undefined,
            sampleRate: audioSampleRate !== "auto" ? parseInt(audioSampleRate, 10) : undefined,
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

  const isImageFile = (f: File | null) => {
    if (!f) return false;
    if (f.type) return f.type.startsWith('image/');
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic', 'tiff'].includes(ext || '');
  };

  const isLossy = (f: File | null) => {
    if (!f) return false;
    const lossyMimes = [
      'image/jpeg', 'image/jpg', 'audio/mpeg', 'audio/mp3', 'audio/opus', 'audio/ogg', 'audio/webm', 'video/webm'
    ];
    const lossyExts = ['.jpg', '.jpeg', '.mp3', '.ogg', '.opus', '.webm'];
    const fileName = f.name.toLowerCase();
    
    return lossyMimes.includes(f.type) || lossyExts.some(ext => fileName.endsWith(ext));
  };

  const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";

  const handleThemeChange = (nextTheme: string) => {
    triggerFeedback('shift', isMuted);
    navigate(`/omni-compress/${nextTheme === 'en' ? '' : nextTheme}`);
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 pb-20 font-sans transition-colors duration-500 flex items-center justify-center selection:bg-[var(--theme-accent)] selection:text-[var(--theme-accent-text)]">
      
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

        {/* SharedArrayBuffer / COOP-COEP Warning (#12) */}
        {sabMissing && (
          <div className="col-span-1 md:col-span-12 mb-2 border-4 border-[var(--theme-border)] bg-amber-100 text-amber-900 p-6 shadow-[8px_8px_0px_0px_var(--theme-shadow)] relative z-10">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-900 text-amber-100 flex items-center justify-center border-2 border-current font-black text-2xl shadow-[4px_4px_0px_var(--theme-shadow)]">
                ⚠
              </div>
              <div>
                <h3 className="font-black text-lg uppercase tracking-wide mb-1">Cross-Origin Isolation Missing</h3>
                <p className="font-bold text-sm">
                  <code>SharedArrayBuffer</code> is unavailable — your browser is missing the required
                  {' '}<code>Cross-Origin-Opener-Policy</code> / <code>Cross-Origin-Embedder-Policy</code> headers.
                  Heavy-path formats (Opus, FLAC, MP3 via FFmpeg) will fail. Standard web formats still work.
                </p>
              </div>
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
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full font-bold py-4 px-6 border-2 shadow-[6px_6px_0px_0px_var(--theme-shadow)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all bg-[var(--theme-primary)] text-[var(--theme-primary-text)] border-[var(--theme-border)] hover:bg-[var(--theme-text)] hover:text-[var(--theme-bg)]"
              >
                {files.length === 0 ? t.selectFile : (isBatch ? `${files.length} files selected` : files[0].name)}
              </button>
              <input 
                type="file" 
                multiple
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*,audio/*" 
                className="hidden" 
              />

              {files.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold uppercase text-[var(--theme-text)]">
                      {t.outputFormat} {isBatch && "(Batch)"}
                    </label>
                    {isLossy(files[0]) && (
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
                      files[0].type.startsWith('image/') ? [
                        ...(files[0].type !== 'image/webp' ? [{ value: 'webp', label: 'WebP (Optimized)' }] : []),
                        ...(files[0].type !== 'image/avif' ? [{ value: 'avif', label: 'AVIF (High Quality)' }] : []),
                        ...(!(files[0].type === 'image/jpeg' || files[0].type === 'image/jpg') ? [{ value: 'jpeg', label: 'JPEG (Standard)' }] : []),
                        ...(!isLossy(files[0]) && files[0].type !== 'image/png' ? [{ value: 'png', label: 'PNG (Lossless)' }] : [])
                      ] : [
                        ...(files[0].type !== 'audio/mpeg' && files[0].type !== 'audio/mp3' ? [{ value: 'mp3', label: 'MP3 (Compressed)' }] : []),
                        ...(files[0].type !== 'audio/opus' ? [{ value: 'opus', label: 'Opus (Web-ready)' }] : []),
                        ...(!isLossy(files[0]) ? [
                          ...(files[0].type !== 'audio/flac' ? [{ value: 'flac', label: 'FLAC (Lossless)' }] : []),
                          ...(files[0].type !== 'audio/wav' && files[0].type !== 'audio/x-wav' ? [{ value: 'wav', label: 'WAV (Uncompressed)' }] : [])
                        ] : [])
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
                    Advanced Engineering
                  </button>
                  
                  {/* Advanced Panel */}
                  {showAdvanced && (
                    <div className="mt-4 p-4 border-2 border-[var(--theme-border)] bg-[var(--theme-bg)] flex flex-col gap-4">
                      
                      {/* Global: Quality Slider */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-xs font-bold uppercase text-[var(--theme-text)]">Quality</label>
                          <span className="text-xs font-black bg-[var(--theme-card-bg)] px-2 py-0.5 border-2 border-[var(--theme-border)]">{quality}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" max="100" 
                          value={quality}
                          onChange={(e) => {
                            setQuality(Number(e.target.value));
                          }}
                          onMouseUp={() => triggerFeedback('tick', isMuted)}
                          onTouchEnd={() => triggerFeedback('tick', isMuted)}
                          className="w-full accent-[var(--theme-primary)] bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] h-3 appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Image Specific Controls */}
                      {files[0].type.startsWith('image/') && (
                        <>
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
                      {!files[0].type.startsWith('image/') && (
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
                  ) : (isBatch ? "Compress & Archive" : t.startCompress)}
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
              {(originalUrl || isBatch) && (
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
                      files[0]?.type.startsWith('image/') && originalUrl ? (
                        <img src={originalUrl} alt="Original" className={`max-h-64 object-contain group-hover:scale-105 transition-transform ${activeTheme.colors.filter}`} />
                      ) : originalUrl ? (
                        <div className="w-full h-full flex flex-col justify-center items-center p-4">
                          <CustomAudioPlayer src={originalUrl} isMuted={isMuted} />
                        </div>
                      ) : null
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
                    {isBatch ? "ARCHIVE" : t.masterpiece}
                  </div>
                  <div className="flex-grow flex items-center justify-center border-2 overflow-hidden relative transition-colors bg-[var(--theme-bg)]/10 border-[var(--theme-border)]">
                    {isBatch ? (
                       <div className="w-full h-full flex flex-col justify-center items-center p-4 text-center">
                        <svg className="w-16 h-16 opacity-50 mb-2 text-[var(--theme-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        <span className="font-bold text-[var(--theme-accent)] opacity-80">omni-compress.zip</span>
                       </div>
                    ) : (
                      files[0]?.type.startsWith('image/') ? (
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
                    download={isBatch ? "omni-compress.zip" : `compressed-${files[0]?.name.split('.').slice(0, -1).join('.') || 'file'}.${stats.format}`}
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
          <a href="https://github.com/dharanish-v/omni-compress" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--theme-primary)] transition-colors underline decoration-2 underline-offset-4">
            Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;