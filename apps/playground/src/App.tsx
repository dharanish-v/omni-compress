import { useState, useEffect, useRef } from 'react';
import { WorkerConfig, isImageFile, isAudioFile, isVideoFile, MT_SUPPORTED } from 'omni-compress';
import { triggerFeedback } from './utils/feedback';

// Hooks
import { usePersistentMute } from './hooks/usePersistentMute';
import { useTheme } from './hooks/useTheme';
import { useFileHandling } from './hooks/useFileHandling';
import { useCompression } from './hooks/useCompression';
import { usePWA } from './hooks/usePWA';

// Components
import { ThemeControls } from './components/ThemeControls';
import { MTStatus } from './components/MTStatus';
import { ErrorBanner } from './components/ErrorBanner';
import { UploadZone } from './components/UploadZone';
import { CompressionControls } from './components/CompressionControls';
import { ComparisonSection } from './components/ComparisonSection';

// Workers
import ImageWorkerUrl from '../../../packages/omni-compress/src/workers/image.worker.ts?worker&url';
import AudioWorkerUrl from '../../../packages/omni-compress/src/workers/audio.worker.ts?worker&url';
import VideoWorkerUrl from '../../../packages/omni-compress/src/workers/video.worker.ts?worker&url';

// Initialize workers
WorkerConfig.imageWorkerUrl = ImageWorkerUrl;
WorkerConfig.audioWorkerUrl = AudioWorkerUrl;
WorkerConfig.videoWorkerUrl = VideoWorkerUrl;

interface AppProps {
  initialTheme?: string;
}

export default function App({ initialTheme = 'en' }: AppProps) {
  const { isMuted, toggleMute } = usePersistentMute();
  const { activeTheme, activeThemeId, handleThemeChange } = useTheme(initialTheme, isMuted);
  const { deferredPrompt, handleInstallClick } = usePWA(isMuted);

  const {
    files,
    originalUrl,
    fileSizeError,
    setFileSizeError,
    isDragging,
    fileInputRef,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleClear,
    removeFile,
  } = useFileHandling(isMuted);

  const { isProcessing, progress, stats, compressedUrl, handleCompress, handleCancel } =
    useCompression(isMuted);

  // UI State
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState('');
  const [maxHeight, setMaxHeight] = useState('');
  const [preserveMetadata, setPreserveMetadata] = useState(false);
  const [audioBitrate, setAudioBitrate] = useState('128k');
  const [audioChannels, setAudioChannels] = useState('auto');
  const [audioSampleRate, setAudioSampleRate] = useState('auto');
  const [videoBitrate, setVideoBitrate] = useState('1M');
  const [videoFps, setVideoFps] = useState('auto');
  const [smartOptimize, setSmartOptimize] = useState(true);
  const [archiveLevel, setArchiveLevel] = useState('6');

  const resultsRef = useRef<HTMLDivElement>(null);
  const t = activeTheme.strings;

  const isBatch = files.length > 1;
  const isAllImages = files.length > 0 && files.every((f) => isImageFile(f));
  const isAllAudio = files.length > 0 && files.every((f) => isAudioFile(f));
  const isAllVideos = files.length > 0 && files.every((f) => isVideoFile(f));
  const isMixedOrGeneric = files.length > 0 && !isAllImages && !isAllAudio && !isAllVideos;

  // Auto-select format based on files
  useEffect(() => {
    if (files.length > 0) {
      if (isMixedOrGeneric) {
        setSelectedFormat('zip');
      } else if (isAllImages) {
        const firstFile = files[0];
        if (firstFile.type === 'image/avif') setSelectedFormat('webp');
        else setSelectedFormat('webp');
      } else if (isAllAudio) {
        const firstFile = files[0];
        if (firstFile.type === 'audio/mpeg' || firstFile.type === 'audio/mp3')
          setSelectedFormat('opus');
        else setSelectedFormat('mp3');
      } else if (isAllVideos) {
        setSelectedFormat('mp4');
      }
    }
  }, [files, isAllImages, isAllAudio, isAllVideos, isMixedOrGeneric]);

  // Auto-scroll to results
  useEffect(() => {
    if (compressedUrl && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [compressedUrl]);

  const onCompress = () => {
    handleCompress(files, selectedFormat, {
      quality,
      maxWidth,
      maxHeight,
      preserveMetadata,
      audioBitrate,
      audioChannels,
      audioSampleRate,
      videoBitrate,
      videoFps,
      smartOptimize,
      archiveLevel,
    });
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
            <svg
              className="w-24 h-24 text-[var(--theme-accent)] mx-auto mb-6 animate-bounce"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <h2 className="text-4xl font-black uppercase tracking-tighter text-[var(--theme-text)]">
              Drop files anywhere
            </h2>
            <p className="text-lg font-bold text-[var(--theme-text)] mt-2 opacity-70 italic">
              to compress or archive instantly
            </p>
          </div>
        </div>
      )}

      <ThemeControls
        activeThemeId={activeThemeId}
        onThemeChange={handleThemeChange}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        deferredPrompt={deferredPrompt}
        onInstallClick={handleInstallClick}
      />

      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 relative">
        {/* Decorative background shapes */}
        <div
          style={{ viewTransitionName: 'shape-1' }}
          className="absolute -top-10 -left-10 w-48 h-48 rounded-full mix-blend-multiply opacity-50 blur-xl transition-colors duration-700 bg-[var(--theme-shape1)]"
        ></div>
        <div
          style={{ viewTransitionName: 'shape-2' }}
          className="absolute -bottom-10 -right-10 w-72 h-72 mix-blend-multiply opacity-30 blur-2xl transform rotate-12 transition-colors duration-700 bg-[var(--theme-shape2)]"
        ></div>
        <div
          style={{ viewTransitionName: 'shape-3' }}
          className="absolute top-1/2 left-1/4 w-64 h-64 mix-blend-multiply opacity-40 blur-2xl transform -translate-y-1/2 transition-colors duration-700 bg-[var(--theme-shape3)]"
        ></div>

        <ErrorBanner error={fileSizeError} onDismiss={() => setFileSizeError(null)} />
        <MTStatus isMTActive={MT_SUPPORTED} />

        {/* Header / Intro Section (Spans 5 cols) */}
        <div
          className="md:col-span-5 flex flex-col justify-center relative z-10"
          style={{ viewTransitionName: 'intro-section' }}
        >
          <div className="border-4 p-8 shadow-[12px_12px_0px_0px_var(--theme-shadow)] transform -rotate-1 hover:rotate-0 transition-all duration-300 bg-[var(--theme-card-bg)] border-[var(--theme-border)]">
            <h1
              style={{ viewTransitionName: 'main-title' }}
              className="text-5xl font-black tracking-tighter uppercase leading-none mb-4 transition-colors text-[var(--theme-text)]"
            >
              Omni
              <br />
              <span className="text-[var(--theme-accent)] italic normal-case block mt-1">
                {t.titleSuffix}
              </span>
            </h1>
            <p
              style={{ viewTransitionName: 'main-desc' }}
              className="text-lg font-medium leading-relaxed mb-6 border-l-4 pl-4 transition-colors text-[var(--theme-text)] border-[var(--theme-primary)] opacity-90"
            >
              {t.desc}
            </p>

            <div className="space-y-4" style={{ viewTransitionName: 'controls-area' }}>
              <UploadZone
                files={files}
                isDragging={isDragging}
                onFileClick={() => fileInputRef.current?.click()}
                onClear={handleClear}
                onRemoveFile={removeFile}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                fileInputRef={fileInputRef}
                onFileChange={handleFileChange}
              />

              <CompressionControls
                files={files}
                selectedFormat={selectedFormat}
                setSelectedFormat={setSelectedFormat}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
                quality={quality}
                setQuality={setQuality}
                maxWidth={maxWidth}
                setMaxWidth={setMaxWidth}
                maxHeight={maxHeight}
                setMaxHeight={setMaxHeight}
                preserveMetadata={preserveMetadata}
                setPreserveMetadata={setPreserveMetadata}
                audioBitrate={audioBitrate}
                setAudioBitrate={setAudioBitrate}
                audioChannels={audioChannels}
                setAudioChannels={setAudioChannels}
                audioSampleRate={audioSampleRate}
                setAudioSampleRate={setAudioSampleRate}
                videoBitrate={videoBitrate}
                setVideoBitrate={setVideoBitrate}
                videoFps={videoFps}
                setVideoFps={setVideoFps}
                smartOptimize={smartOptimize}
                setSmartOptimize={setSmartOptimize}
                archiveLevel={archiveLevel}
                setArchiveLevel={setArchiveLevel}
                isBatch={isBatch}
                isAllImages={isAllImages}
                isAllAudio={isAllAudio}
                isAllVideos={isAllVideos}
                isMixedOrGeneric={isMixedOrGeneric}
                isMuted={isMuted}
                onProgress={() => {}}
                triggerFeedback={triggerFeedback}
                t={t}
              />

              <button
                onClick={isProcessing ? handleCancel : onCompress}
                disabled={files.length === 0 && !isProcessing}
                className={`group relative w-full font-bold py-4 px-6 border-2 shadow-[6px_6px_0px_0px_var(--theme-shadow)] transition-all overflow-hidden
                  ${
                    files.length === 0 && !isProcessing
                      ? 'bg-stone-200 text-stone-500 cursor-not-allowed shadow-none translate-x-[2px] translate-y-[2px] border-[var(--theme-border)]'
                      : isProcessing
                        ? 'bg-red-600 text-white border-[var(--theme-border)] hover:bg-red-700 hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] cursor-pointer'
                        : 'bg-[var(--theme-secondary)] text-[var(--theme-text)] border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-accent-text)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px]'
                  }`}
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
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-current"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      {t.processing} {progress}% — Click to Cancel
                    </>
                  ) : selectedFormat === 'zip' ? (
                    'Archive'
                  ) : isBatch ? (
                    'Compress & Zip'
                  ) : (
                    t.startCompress
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Results / Preview Section (Spans 7 cols) */}
        <div
          ref={resultsRef}
          className="md:col-span-7 relative z-10 flex flex-col justify-center"
          style={{ viewTransitionName: 'preview-section' }}
        >
          <ComparisonSection
            files={files}
            originalUrl={originalUrl}
            compressedUrl={compressedUrl}
            stats={stats}
            isBatch={isBatch}
            isMuted={isMuted}
            activeTheme={activeTheme}
            triggerFeedback={triggerFeedback}
            t={t}
          />
        </div>
      </div>

      {/* Footer / Copyright */}
      <footer className="fixed bottom-0 left-0 w-full p-2 border-t-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text)] z-50 flex justify-center items-center">
        <div className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
          <span>&copy; {new Date().getFullYear()} Dharanish V</span>
          <span className="w-1 h-1 bg-[var(--theme-accent)] rounded-full"></span>
          <a
            href="/omni-compress/benchmark"
            className="hover:text-[var(--theme-primary)] transition-colors underline decoration-2 underline-offset-4"
          >
            Benchmark
          </a>
          <span className="w-1 h-1 bg-[var(--theme-accent)] rounded-full"></span>
          <a
            href="/omni-compress/why"
            className="hover:text-[var(--theme-primary)] transition-colors underline decoration-2 underline-offset-4"
          >
            Why?
          </a>
          <span className="w-1 h-1 bg-[var(--theme-accent)] rounded-full"></span>
          <a
            href="https://github.com/dharanish-v/omni-compress#migration-from-compressorjs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--theme-primary)] transition-colors underline decoration-2 underline-offset-4"
          >
            Migration
          </a>
          <span className="w-1 h-1 bg-[var(--theme-accent)] rounded-full"></span>
          <a
            href="https://github.com/dharanish-v/omni-compress"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--theme-primary)] transition-colors underline decoration-2 underline-offset-4"
          >
            Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}
