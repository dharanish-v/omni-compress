import { useState, useRef, useEffect } from "react";
import { triggerFeedback } from "../utils/feedback";

const AUDIO_PLAY_EVENT = 'omni-compress:audio-play';

interface CustomAudioPlayerProps {
  src: string;
  isCompressed?: boolean;
  isMuted?: boolean;
}

export function CustomAudioPlayer({ src, isCompressed = false, isMuted = false }: CustomAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const instanceId = useRef(Math.random().toString(36).slice(2));

  // Pause this player when another player starts (#10)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as any).detail;
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
