/**
 * feedback.ts
 * Synthesized mechanical sound effects and haptic vibration for Neo-Brutalist UI.
 */

let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};

export const triggerHaptic = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

export const triggerSound = (type: 'click' | 'shift' | 'success' | 'tick') => {
  initAudio();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  switch (type) {
    case 'click':
      // Short, high-pitched mechanical click
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.05);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
      break;

    case 'shift':
      // Frequency sweep for theme transitions
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      break;

    case 'success':
      // Two-tone rising chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;

    case 'tick':
      // Ultra-short noise burst for slider
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
      osc.start(now);
      osc.stop(now + 0.01);
      break;
  }
};

export const triggerFeedback = (type: 'click' | 'shift' | 'success' | 'tick', isMuted: boolean) => {
  if (isMuted) return;

  triggerSound(type);

  switch (type) {
    case 'click':
      triggerHaptic(10);
      break;
    case 'shift':
      triggerHaptic(20);
      break;
    case 'success':
      triggerHaptic([50, 30, 50]);
      break;
    case 'tick':
      // No haptic for fast ticks to avoid battery drain/annoyance
      break;
  }
};
