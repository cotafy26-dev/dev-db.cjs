import axios, { AxiosError } from 'axios';
import { authStore } from '../stores/auth';

// Em dev: '/api' (proxy do Vite). Em producao com frontend estatico em outro
// dominio: defina VITE_API_URL=https://sua-api no build.
const RAW = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';
export const API_BASE = RAW ? `${RAW}/api` : '/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = authStore.getState().tokens?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { tokens, setTokens, clear } = authStore.getState();
  if (!tokens?.refreshToken) return null;
  try {
    const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken: tokens.refreshToken });
    const next = res.data.data.tokens;
    setTokens(next);
    return next.accessToken as string;
  } catch {
    clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (
      (err.response?.data as { error?: { message?: string } })?.error?.message ||
      err.message ||
      'Erro de rede'
    );
  }
  return err instanceof Error ? err.message : 'Erro desconhecido';
}
