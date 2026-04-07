import React from 'react';
import { CustomSelect } from './CustomSelect';
import { isImageFile, isAudioFile, isVideoFile } from '@dharanish/omni-compress';
import type { ThemeStrings, FeedbackType } from '../types';

interface CompressionControlsProps {
  files: File[];
  selectedFormat: string;
  setSelectedFormat: (format: string) => void;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  quality: number;
  setQuality: (quality: number) => void;
  maxWidth: string;
  setMaxWidth: (width: string) => void;
  maxHeight: string;
  setMaxHeight: (height: string) => void;
  preserveMetadata: boolean;
  setPreserveMetadata: (preserve: boolean) => void;
  audioBitrate: string;
  setAudioBitrate: (bitrate: string) => void;
  audioChannels: string;
  setAudioChannels: (channels: string) => void;
  audioSampleRate: string;
  setAudioSampleRate: (rate: string) => void;
  videoBitrate: string;
  setVideoBitrate: (bitrate: string) => void;
  videoFps: string;
  setVideoFps: (fps: string) => void;
  smartOptimize: boolean;
  setSmartOptimize: (optimize: boolean) => void;
  archiveLevel: string;
  setArchiveLevel: (level: string) => void;
  isBatch: boolean;
  isAllImages: boolean;
  isAllAudio: boolean;
  isAllVideos: boolean;
  isMixedOrGeneric: boolean;
  isMuted: boolean;
  onProgress: (p: number) => void;
  triggerFeedback: (type: FeedbackType, muted: boolean) => void;
  t: ThemeStrings;
}

export function CompressionControls({
  files,
  selectedFormat,
  setSelectedFormat,
  showAdvanced,
  setShowAdvanced,
  quality,
  setQuality,
  maxWidth,
  setMaxWidth,
  maxHeight,
  setMaxHeight,
  preserveMetadata,
  setPreserveMetadata,
  audioBitrate,
  setAudioBitrate,
  audioChannels,
  setAudioChannels,
  audioSampleRate,
  setAudioSampleRate,
  videoBitrate,
  setVideoBitrate,
  videoFps,
  setVideoFps,
  smartOptimize,
  setSmartOptimize,
  archiveLevel,
  setArchiveLevel,
  isBatch,
  isAllImages,
  isAllAudio,
  isAllVideos,
  isMixedOrGeneric,
  isMuted,
  triggerFeedback,
  t
}: CompressionControlsProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-bold uppercase text-[var(--theme-text)]">
            {t.outputFormat} {isBatch && "(Batch)"}
          </label>
        </div>
        
        <CustomSelect
          value={selectedFormat}
          onChange={setSelectedFormat}
          isMuted={isMuted}
          options={
            isMixedOrGeneric ? [
              { value: 'zip', label: 'ZIP Archive' }
            ] : isAllImages ? [
              ...(files[0].type !== 'image/webp' ? [{ value: 'webp', label: 'WebP (Optimized)' }] : []),
              ...(files[0].type !== 'image/avif' ? [{ value: 'avif', label: 'AVIF (High Quality)' }] : []),
              ...(!(files[0].type === 'image/jpeg' || files[0].type === 'image/jpg') ? [{ value: 'jpeg', label: 'JPEG (Standard)' }] : []),
              ...(isImageFile(files[0]) && files[0].type !== 'image/png' ? [{ value: 'png', label: 'PNG (Lossless)' }] : []),
              ...(isBatch ? [] : [{ value: 'zip', label: 'ZIP Archive' }])
            ] : isAllAudio ? [
              ...(files[0].type !== 'audio/mpeg' && files[0].type !== 'audio/mp3' ? [{ value: 'mp3', label: 'MP3 (Compressed)' }] : []),
              ...(files[0].type !== 'audio/opus' ? [{ value: 'opus', label: 'Opus (Web-ready)' }] : []),
              ...(isAudioFile(files[0]) ? [
                ...(files[0].type !== 'audio/flac' ? [{ value: 'flac', label: 'FLAC (Lossless)' }] : []),
                ...(files[0].type !== 'audio/wav' && files[0].type !== 'audio/x-wav' ? [{ value: 'wav', label: 'WAV (Uncompressed)' }] : [])
              ] : []),
              ...(isBatch ? [] : [{ value: 'zip', label: 'ZIP Archive' }])
            ] : isAllVideos ? [
              { value: 'mp4', label: 'MP4 (H.264 - Universal)' },
              { value: 'webm', label: 'WebM (VP9 - Modern)' },
              ...(isBatch ? [] : [{ value: 'zip', label: 'ZIP Archive' }])
            ] : [
              { value: 'zip', label: 'ZIP Archive' }
            ]
          }
        />
      </div>

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
          {selectedFormat === 'zip' ? "Archive Options" : isAllImages ? "Advanced Image Options" : isAllAudio ? "Advanced Audio Options" : isAllVideos ? "Advanced Video Options" : "Advanced Options"}
        </button>
        
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
                <div className="grid grid-cols-2 gap-4 text-[var(--theme-text)]">
                  <div>
                    <label className="text-xs font-bold uppercase mb-1 block">Max Width (px)</label>
                    <input 
                      type="number" 
                      placeholder="Auto"
                      value={maxWidth}
                      onChange={e => setMaxWidth(e.target.value)}
                      className="w-full border-2 p-2 font-mono text-sm bg-[var(--theme-card-bg)] text-[var(--theme-text)] border-[var(--theme-border)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase mb-1 block">Max Height (px)</label>
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
    </div>
  );
}
