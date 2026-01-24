import { supabase } from './client';
import { projectId, publicAnonKey } from './info';

const readStoredSession = () => {
  if (typeof window === 'undefined') return null;
  const storageKey = `sb-${projectId}-auth-token`;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

export const getAccessToken = async (fallback?: string) => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (session?.access_token) {
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAt && Date.now() > expiresAt - 60_000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session?.access_token) {
        return refreshed.session.access_token;
      }
    } else {
      return session.access_token;
    }
  }

  const stored = readStoredSession();
  if (stored?.refresh_token) {
    const { data: refreshed } = await supabase.auth.refreshSession({
      refresh_token: stored.refresh_token
    });
    if (refreshed.session?.access_token) {
      return refreshed.session.access_token;
    }
  }
  if (stored?.access_token) return stored.access_token;
  return fallback || '';
};

export const getAuthHeaders = async (fallbackToken?: string) => {
  const token = await getAccessToken(fallbackToken);
  const headers: Record<string, string> = { apikey: publicAnonKey };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return { headers, token };
};
