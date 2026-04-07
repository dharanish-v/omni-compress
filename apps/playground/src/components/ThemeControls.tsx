import { themes } from '../themes';
import { CustomSelect } from './CustomSelect';

// Define a type for the BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface ThemeControlsProps {
  activeThemeId: string;
  onThemeChange: (id: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  deferredPrompt: BeforeInstallPromptEvent | null;
  onInstallClick: () => void;
}

export function ThemeControls({
  activeThemeId,
  onThemeChange,
  isMuted,
  onToggleMute,
  deferredPrompt,
  onInstallClick
}: ThemeControlsProps) {
  return (
    <div className="fixed top-6 right-6 z-[200] flex items-center gap-4">
      {/* PWA Install Button */}
      {deferredPrompt && (
        <button 
          onClick={onInstallClick}
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
        onClick={onToggleMute}
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
        onChange={onThemeChange}
        options={themes.map(t => ({ value: t.id, label: `${t.person} (${t.language})` }))}
        className="min-w-[240px]"
        isMuted={isMuted}
      />
    </div>
  );
}
