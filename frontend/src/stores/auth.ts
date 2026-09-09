import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, SessionUser } from '../types';

interface AuthState {
  user: SessionUser | null;
  tokens: AuthTokens | null;
  setSession: (user: SessionUser, tokens: AuthTokens) => void;
  setTokens: (tokens: AuthTokens) => void;
  setUser: (user: SessionUser) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      setSession: (user, tokens) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, tokens: null }),
    }),
    { name: 'tato.auth' },
  ),
);

export const authStore = useAuth;
