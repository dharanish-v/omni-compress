interface ErrorBannerProps {
  error: string | null;
  onDismiss: () => void;
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="col-span-1 md:col-span-12 mb-2 border-4 border-[var(--theme-border)] bg-red-100 text-red-900 p-6 shadow-[8px_8px_0px_0px_var(--theme-shadow)] relative z-10">
      <button
        onClick={onDismiss}
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
          <p className="font-bold text-sm">{error}</p>
        </div>
      </div>
    </div>
  );
}
