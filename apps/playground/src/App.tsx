import { useState, useRef, useEffect } from "react";
import { OmniCompressor, WorkerConfig } from "@dharanish/omni-compress";
import { themes } from "./themes";
import { triggerFeedback } from "./utils/feedback";

// Vite bundles these workers into self-contained assets and returns their URLs.
// @ts-ignore - Vite ?worker&url import
import ImageWorkerUrl from '../../../packages/omni-compress/src/workers/image.worker.ts?worker&url';
// @ts-ignore - Vite ?worker&url import
import AudioWorkerUrl from '../../../packages/omni-compress/src/workers/audio.worker.ts?worker&url';

WorkerConfig.imageWorkerUrl = ImageWorkerUrl;
WorkerConfig.audioWorkerUrl = AudioWorkerUrl;

function CustomAudioPlayer({ src, isCompressed = false, isMuted = false }: { src: string; isCompressed?: boolean; isMuted?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    triggerFeedback('click', isMuted);
    if (audioRef.current?.paused) {
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
  const [activeThemeId, setActiveThemeId] = useState<string>(initialTheme);
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ origSize: number; newSize: number; time: number; format: string } | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [isMuted, setIsMuted] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTheme = themes.find(t => t.id === activeThemeId) || themes[0];
  const t = activeTheme.strings;

  useEffect(() => {
    // Astro Layout handles the initial CSS var injection. 
    // This effect is kept to handle potential client-side fallback/hydration edge cases.
    const root = document.documentElement;
    Object.entries(activeTheme.colors).forEach(([key, value]) => {
      if (key !== 'filter' && key !== 'pattern') {
        const cssVarName = `--theme-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`;
        root.style.setProperty(cssVarName, value as string);
      }
    });

    // Remove old pattern classes
    document.body.classList.forEach(className => {
      if (className.startsWith('pattern-')) {
        document.body.classList.remove(className);
      }
    });
    
    // Add new pattern class
    // @ts-ignore - pattern is dynamically added to colors object
    const pattern = activeTheme.colors.pattern || 'grid';
    document.body.classList.add(`pattern-${pattern}`);

  }, [activeTheme]);

  useEffect(() => {
    if (file) {
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        if (file.type === 'image/webp') setSelectedFormat('avif');
        else setSelectedFormat('webp');
      } else {
        if (file.type === 'audio/mpeg' || file.type === 'audio/mp3') setSelectedFormat('opus');
        else setSelectedFormat('mp3');
      }
    }
  }, [file]);

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
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setOriginalUrl(URL.createObjectURL(selectedFile));
      setCompressedUrl(null);
      setStats(null);
      setProgress(0);
    }
  };

  const handleCompress = async () => {
    if (!file || !selectedFormat) return;
    triggerFeedback('click', isMuted);
    setIsProcessing(true);
    setProgress(0);
    
    try {
      const isImage = file.type.startsWith('image/');
      const type = isImage ? 'image' : 'audio';

      const start = performance.now();
      
      const resultBlob = await OmniCompressor.process(file, {
        type,
        format: selectedFormat,
        quality: 0.8,
        onProgress: (p) => setProgress(Math.round(p))
      });

      const time = Math.round(performance.now() - start);

      const url = URL.createObjectURL(resultBlob);
      setCompressedUrl(url);
      setStats({
        origSize: file.size,
        newSize: resultBlob.size,
        time,
        format: selectedFormat
      });
      triggerFeedback('success', isMuted);
    } catch (err) {
      console.error(err);
      alert("Failed to compress file");
    } finally {
      setIsProcessing(false);
    }
  };

  const isLossy = (file: File | null) => {
    if (!file) return false;
    const lossyMimes = [
      'image/jpeg', 'image/jpg', 'audio/mpeg', 'audio/mp3', 'audio/opus', 'audio/ogg', 'audio/webm', 'video/webm'
    ];
    const lossyExts = ['.jpg', '.jpeg', '.mp3', '.ogg', '.opus', '.webm'];
    const fileName = file.name.toLowerCase();
    
    return lossyMimes.includes(file.type) || lossyExts.some(ext => fileName.endsWith(ext));
  };

  const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";

  const handleThemeChange = (nextTheme: string) => {
    triggerFeedback('shift', isMuted);
    // Navigate via standard URL for Astro SSG and View Transitions
    window.location.href = `/omni-compress/${nextTheme === 'en' ? '' : nextTheme}`;
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-500 flex items-center justify-center selection:bg-[var(--theme-accent)] selection:text-[var(--theme-accent-text)]">
      
      {/* Top Controls */}
      <div className="fixed top-6 right-6 z-[200] flex items-center gap-4">
        {/* Mute Toggle */}
        <button 
          onClick={() => {
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            triggerFeedback('click', false); // Feedback for the toggle itself
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
                {file ? file.name : t.selectFile}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*,audio/*" 
                className="hidden" 
              />

              {file && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold uppercase text-[var(--theme-text)]">
                      {t.outputFormat}
                    </label>
                    {isLossy(file) && (
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
                      file.type.startsWith('image/') ? [
                        ...(file.type !== 'image/webp' ? [{ value: 'webp', label: 'WebP (Optimized)' }] : []),
                        ...(file.type !== 'image/avif' ? [{ value: 'avif', label: 'AVIF (High Quality)' }] : []),
                        ...(!(file.type === 'image/jpeg' || file.type === 'image/jpg') ? [{ value: 'jpeg', label: 'JPEG (Standard)' }] : []),
                        ...(!isLossy(file) && file.type !== 'image/png' ? [{ value: 'png', label: 'PNG (Lossless)' }] : [])
                      ] : [
                        ...(file.type !== 'audio/mpeg' && file.type !== 'audio/mp3' ? [{ value: 'mp3', label: 'MP3 (Compressed)' }] : []),
                        ...(file.type !== 'audio/opus' ? [{ value: 'opus', label: 'Opus (Web-ready)' }] : []),
                        ...(!isLossy(file) ? [
                          ...(file.type !== 'audio/flac' ? [{ value: 'flac', label: 'FLAC (Lossless)' }] : []),
                          ...(file.type !== 'audio/wav' && file.type !== 'audio/x-wav' ? [{ value: 'wav', label: 'WAV (Uncompressed)' }] : [])
                        ] : [])
                      ]
                    }
                  />
                </div>
              )}
              
              <button 
                onClick={handleCompress} 
                disabled={!file || isProcessing}
                className={`group relative w-full font-bold py-4 px-6 border-2 shadow-[6px_6px_0px_0px_var(--theme-shadow)] transition-all overflow-hidden
                  ${(!file || isProcessing) 
                    ? "bg-stone-200 text-stone-500 cursor-not-allowed shadow-none translate-x-[2px] translate-y-[2px] border-[var(--theme-border)]" 
                    : "bg-[var(--theme-secondary)] text-[var(--theme-text)] border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-accent-text)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px]"}`}
              >
                {/* Progress Fill Layer */}
                {isProcessing && (
                  <div 
                    className="absolute top-0 left-0 h-full bg-[var(--theme-accent)] transition-all duration-300 ease-out opacity-20"
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
                      {t.processing} {progress}%
                    </>
                  ) : t.startCompress}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Results / Preview Section (Spans 7 cols) */}
        <div className="md:col-span-7 relative z-10 flex flex-col justify-center" style={{ viewTransitionName: 'preview-section' }}>
          {(!file && !compressedUrl) && (
            <div style={{ viewTransitionName: 'empty-state-quote' }} className="h-full min-h-[400px] border-4 border-dashed flex items-center justify-center transform rotate-1 p-8 text-center transition-all duration-500 border-[var(--theme-secondary)]/50 bg-[var(--theme-card-bg)]/40">
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              <p className="text-2xl font-bold rotate-[-2deg] transition-colors text-[var(--theme-text)] opacity-80 relative z-10">
                <span className="italic">"{t.quote.split('-')[0].replace(/"/g, '').trim()}"</span><br/>
                <span className="text-lg opacity-70 block mt-4">- {t.quote.split('-').slice(1).join('-').trim()}</span>
              </p>
            </div>
          )}

          {(file || compressedUrl) && (
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
              {originalUrl && (
                <div style={{ viewTransitionName: 'original-card' }} className="border-4 p-4 flex flex-col transition-all duration-500 bg-[var(--theme-card-bg)] border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)]">
                  <div className="font-bold uppercase tracking-wider py-1 px-3 inline-block self-start mb-4 border-2 bg-[var(--theme-secondary)] text-[var(--theme-text)] border-[var(--theme-border)]">
                    {t.original}
                  </div>
                  <div className="flex-grow flex items-center justify-center border-2 overflow-hidden relative group transition-colors bg-[var(--theme-bg)] border-[var(--theme-border)]">
                    {file?.type.startsWith('image/') ? (
                      <img src={originalUrl} alt="Original" className={`max-h-64 object-contain group-hover:scale-105 transition-transform ${activeTheme.colors.filter}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col justify-center items-center p-4">
                        <CustomAudioPlayer src={originalUrl} isMuted={isMuted} />
                      </div>
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
                    {t.masterpiece}
                  </div>
                  <div className="flex-grow flex items-center justify-center border-2 overflow-hidden relative transition-colors bg-[var(--theme-bg)]/10 border-[var(--theme-border)]">
                    {file?.type.startsWith('image/') ? (
                      <img src={compressedUrl} alt="Compressed" className={`max-h-64 object-contain ${activeTheme.colors.filter}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col justify-center items-center p-4">
                        <CustomAudioPlayer src={compressedUrl} isCompressed isMuted={isMuted} />
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t-2 border-dashed pt-4 border-[var(--theme-border)] opacity-80">
                    <div>
                      <span className="text-xs font-bold uppercase block opacity-70">{t.newSize}</span>
                      <span className="text-xl font-black text-[var(--theme-accent)]">{formatSize(stats.newSize)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold uppercase block opacity-70">{t.time}</span>
                      <span className="text-xl font-black text-[var(--theme-secondary)]">{stats.time}ms</span>
                    </div>
                  </div>
                  <a 
                    href={compressedUrl} 
                    download={`compressed-${file?.name.split('.').slice(0, -1).join('.') || 'file'}.${stats.format}`}
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
    </div>
  );
}

export default App;
