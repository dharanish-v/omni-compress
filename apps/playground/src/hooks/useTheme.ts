import { useState, useEffect } from 'react';
import { themes } from '../themes';
import { triggerFeedback } from '../utils/feedback';
import type { Theme } from '../types';
import { navigate } from "astro:transitions/client";

export function useTheme(initialThemeId: string, isMuted: boolean) {
  const [activeThemeId, setActiveThemeId] = useState(initialThemeId);
  const activeTheme = (themes.find(t => t.id === activeThemeId) || themes[0]) as Theme;

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(activeTheme.colors).forEach(([key, value]) => {
      if (key !== 'filter' && key !== 'pattern') {
        const cssVarName = `--theme-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`;
        root.style.setProperty(cssVarName, value as string);
      }
    });

    document.body.classList.forEach(className => {
      if (className.startsWith('pattern-')) {
        document.body.classList.remove(className);
      }
    });
    
    // @ts-ignore - pattern is dynamically added to colors object
    const pattern = activeTheme.colors.pattern || 'grid';
    document.body.classList.add(`pattern-${pattern}`);
  }, [activeTheme]);

  const handleThemeChange = (nextThemeId: string) => {
    triggerFeedback('shift', isMuted);
    setActiveThemeId(nextThemeId);
    navigate(`/omni-compress/${nextThemeId === 'en' ? '' : nextThemeId}`);
  };

  return { activeTheme, activeThemeId, handleThemeChange };
}
