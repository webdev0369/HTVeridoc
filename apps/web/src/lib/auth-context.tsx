'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiFetch, clearTokens, setTokens } from './api';
import {
  authUserFromEditorToken,
  clearEmbedSession,
  isEditorLinkToken,
  markEmbedSession,
  parseEditorLinkToken,
} from './editor-session';
import type { AuthResponse, AuthUser, MeResponse } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** True when this tab is a partner iframe /editor link session. */
  isEmbed: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    organizationName: string;
    organizationSlug: string;
    email: string;
    name: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /**
   * Partner handoff: store editor JWT + hydrate user immediately (no login).
   * Returns the document id from the token.
   */
  acceptEditorSession: (token: string) => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmbed, setIsEmbed] = useState(false);

  const applyAuth = useCallback((data: AuthResponse) => {
    clearEmbedSession();
    setIsEmbed(false);
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await apiFetch<MeResponse>('/auth/me');
    setUser({
      userId: me.id,
      email: me.email,
      name: me.name,
      organizationId: me.organizationId,
      role: me.role,
      permissions: me.permissions,
    });
  }, []);

  const acceptEditorSession = useCallback((token: string) => {
    const payload = parseEditorLinkToken(token);
    const editorUser = authUserFromEditorToken(token);
    if (!payload?.documentId || !editorUser) {
      throw new Error('Invalid or expired editor link');
    }
    setTokens(token, token);
    markEmbedSession(payload.documentId);
    setIsEmbed(true);
    setUser(editorUser);
    setLoading(false);
    return payload.documentId;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    if (isEditorLinkToken(token)) {
      const editorUser = authUserFromEditorToken(token);
      const payload = parseEditorLinkToken(token);
      if (editorUser && payload?.documentId) {
        markEmbedSession(payload.documentId);
        setIsEmbed(true);
        setUser(editorUser);
        setLoading(false);
        return;
      }
      clearTokens();
      clearEmbedSession();
      setLoading(false);
      return;
    }

    refreshMe()
      .catch(() => {
        clearTokens();
        clearEmbedSession();
        setUser(null);
        setIsEmbed(false);
      })
      .finally(() => setLoading(false));
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      applyAuth(data);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (payload: {
      organizationName: string;
      organizationSlug: string;
      email: string;
      name: string;
      password: string;
    }) => {
      const data = await apiFetch<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      applyAuth(data);
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    const accessToken = localStorage.getItem('accessToken');
    if (refreshToken && !isEditorLinkToken(accessToken)) {
      try {
        await apiFetch('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        /* ignore */
      }
    }
    clearTokens();
    clearEmbedSession();
    setIsEmbed(false);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isEmbed,
      login,
      register,
      logout,
      refreshMe,
      acceptEditorSession,
    }),
    [
      user,
      loading,
      isEmbed,
      login,
      register,
      logout,
      refreshMe,
      acceptEditorSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
