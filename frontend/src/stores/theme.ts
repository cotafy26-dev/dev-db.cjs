import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Mode = 'light' | 'dark';

interface ThemeState {
  mode: Mode;
  toggle: () => void;
  set: (m: Mode) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light') as Mode,
      toggle: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),
      set: (m) => set({ mode: m }),
    }),
    { name: 'tato.theme' },
  ),
);

export function useApplyTheme() {
  const mode = useTheme((s) => s.mode);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
  }, [mode]);
}
