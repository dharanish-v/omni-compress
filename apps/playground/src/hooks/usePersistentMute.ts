import { useState, useEffect, useRef } from 'react';
import { triggerFeedback } from '../utils/feedback';

export function usePersistentMute() {
  const [isMuted, setIsMuted] = useState(false);
  const hasMuteRestoredRef = useRef(false);

  // Restore from sessionStorage after hydration
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('omni-compress:muted');
      if (stored === 'true') setIsMuted(true);
    } catch (e) {
      console.error('Failed to restore mute state', e);
    }
  }, []);

  // Persist to sessionStorage
  useEffect(() => {
    if (!hasMuteRestoredRef.current) {
      hasMuteRestoredRef.current = true;
      return;
    }
    try {
      sessionStorage.setItem('omni-compress:muted', String(isMuted));
    } catch (e) {
      console.error('Failed to save mute state', e);
    }
  }, [isMuted]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    triggerFeedback('click', false); // Always play click sound when toggling mute (or not)
  };

  return { isMuted, setIsMuted, toggleMute };
}
