import { useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'raizes.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

const readMode = (): ThemeMode => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

export function applyTheme(mode: ThemeMode = readMode()) {
  const dark = mode === 'dark' || (mode === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1c1917' : '#9a3412');
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  useEffect(() => {
    applyTheme(mode);
    try {
      mode === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, mode);
    } catch {
      /* sem storage: vale só nesta sessão */
    }
    if (mode !== 'system') return;
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);
  return [mode, setMode] as const;
}
