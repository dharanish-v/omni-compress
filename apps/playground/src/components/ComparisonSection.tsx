import React from 'react';
import { isImageFile, isAudioFile, isVideoFile } from 'omni-compress';
import { CustomAudioPlayer } from './CustomAudioPlayer';
import type { Theme, ThemeStrings, FeedbackType, CompressionStats } from '../types';

interface ComparisonSectionProps {
  files: File[];
  originalUrl: string | null;
  compressedUrl: string | null;
  stats: CompressionStats | null;
  isBatch: boolean;
  isMuted: boolean;
  activeTheme: Theme;
  triggerFeedback: (type: FeedbackType, muted: boolean) => void;
  t: ThemeStrings;
}

const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";

export function ComparisonSection({
  files,
  originalUrl,
  compressedUrl,
  stats,
  isBatch,
  isMuted,
  activeTheme,
  triggerFeedback,
  t
}: ComparisonSectionProps) {
  if (files.length === 0 && !compressedUrl) {
    return (
      <div style={{ viewTransitionName: 'empty-state-quote' }} className="h-full min-h-[400px] border-4 border-dashed flex items-center justify-center transform rotate-1 p-8 text-center transition-all duration-500 border-[var(--theme-secondary)]/50 bg-[var(--theme-card-bg)]/40">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <p className="text-2xl font-bold rotate-[-2deg] transition-colors text-[var(--theme-text)] opacity-80 relative z-10">
          <span className="italic">"{t.quote.split('-')[0].replace(/"/g, '').trim()}"</span><br/>
          <span className="text-lg opacity-70 block mt-4">- {t.quote.split('-').slice(1).join('-').trim()}</span>
        </p>
      </div>
    );
  }

  return (
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
      {(originalUrl || isBatch || (files[0] && !isImageFile(files[0]) && !isAudioFile(files[0]) && !isVideoFile(files[0]))) && (
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
              files[0] && isImageFile(files[0]) && originalUrl ? (
                <img src={originalUrl} alt="Original" className={`max-h-64 object-contain group-hover:scale-105 transition-transform ${activeTheme.colors.filter}`} />
              ) : files[0] && isAudioFile(files[0]) && originalUrl ? (
                <div className="w-full h-full flex flex-col justify-center items-center p-4">
                  <CustomAudioPlayer src={originalUrl} isMuted={isMuted} />
                </div>
              ) : files[0] && isVideoFile(files[0]) && originalUrl ? (
                <video src={originalUrl} controls className="max-h-64 w-full" muted={isMuted} />
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
              files[0] && isImageFile(files[0]) ? (
                <img src={compressedUrl} alt="Compressed" className={`max-h-64 object-contain ${activeTheme.colors.filter}`} />
              ) : files[0] && isAudioFile(files[0]) ? (
                <div className="w-full h-full flex flex-col justify-center items-center p-4">
                  <CustomAudioPlayer src={compressedUrl} isCompressed isMuted={isMuted} />
                </div>
              ) : (
                <video src={compressedUrl} controls className="max-h-64 w-full" muted={isMuted} />
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
  );
}
