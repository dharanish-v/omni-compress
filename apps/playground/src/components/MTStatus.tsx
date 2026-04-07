interface MTStatusProps {
  isMTActive: boolean;
}

export function MTStatus({ isMTActive }: MTStatusProps) {
  if (!isMTActive && !import.meta.env.DEV) {
    return (
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
    );
  }

  if (isMTActive) {
    return (
      <div className="col-span-1 md:col-span-12 mb-4 flex justify-end">
        <div className="inline-flex items-center gap-2 px-3 py-1 border-2 border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[10px] font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--theme-shadow)] text-[var(--theme-text)]">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Neural Multi-threading Active
        </div>
      </div>
    );
  }

  return null;
}
