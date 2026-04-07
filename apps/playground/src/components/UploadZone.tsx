import React from 'react';

interface UploadZoneProps {
  files: File[];
  isDragging: boolean;
  onFileClick: () => void;
  onClear: () => void;
  onRemoveFile: (index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";

export function UploadZone({
  files,
  isDragging,
  onFileClick,
  onClear,
  onRemoveFile,
  onDragOver,
  onDrop,
  fileInputRef,
  onFileChange
}: UploadZoneProps) {
  return (
    <div className="space-y-4">
      <div 
        onClick={onFileClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
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
        onChange={onFileChange}
        className="hidden"
      />

      {files.length > 0 && (
        <div className="border-4 p-4 bg-[var(--theme-bg)] border-[var(--theme-border)] max-h-48 overflow-y-auto scrollbar-thin">
          <div className="flex justify-between items-center mb-2 sticky top-0 bg-[var(--theme-bg)] pb-2 border-b-2 border-[var(--theme-border)]/20">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Selection Manifest</span>
            <button onClick={onClear} className="text-[10px] font-black uppercase text-red-600 hover:underline">Clear Selection</button>
          </div>
          <div className="space-y-2 text-[var(--theme-text)]">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-4 p-2 bg-[var(--theme-card-bg)] border-2 border-[var(--theme-border)] text-xs font-bold group">
                <span className="truncate flex-grow">{f.name}</span>
                <span className="opacity-50 flex-shrink-0">{formatSize(f.size)}</span>
                <button onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }} className="text-red-600 hover:scale-125 transition-transform">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
