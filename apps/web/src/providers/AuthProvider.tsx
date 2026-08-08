import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type {
  AuthOrganization,
  AuthSession,
  AuthStatus,
  AuthUser,
  LoginCredentials,
} from '../features/auth/auth.types';
import {
  currentSessionRequest,
  loginRequest,
  logoutRequest,
  refreshSessionRequest,
  registerAuthCoordinator,
} from '../lib/api';
import { useRealtimeStore } from '../stores/useRealtimeStore';

interface AuthContextValue {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  organization: AuthOrganization | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
  /*
   * BUG FIX (#75): exposed so SocketProvider can trigger the same deduped
   * session refresh the axios 401 interceptor uses when the realtime
   * handshake is rejected for an expired access token (see SocketProvider).
   * The runtime value below already provided this — the interface simply
   * makes it part of the public contract.
   */
  refreshSession: () => Promise<string>;
  updateOrganization: (patch: Partial<AuthOrganization>) => void;
}

// Exported (ledger #3) so embeddable widgets can OPTIONALLY read auth
// state without the throwing useAuth guard (they must also render
// provider-less in lightweight harnesses).
export const AuthContext = createContext<AuthContextValue | null>(null);
const obsoleteAuthStorageKeys = ['mock_admin_id', 'aiworkspace_token'];

const removeObsoleteAuthStorage = (): void => {
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageName];
      for (const key of obsoleteAuthStorageKeys) {
        storage.removeItem(key);
      }
    } catch {
      // Unavailable browser storage must not prevent cookie-based authentication.
    }
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const refreshSessionRef = useRef<Promise<string> | null>(null);
  const sessionGenerationRef = useRef(0);

  const clearTenantState = useCallback(() => {
    queryClient.clear();
    useRealtimeStore.getState().reset();
  }, [queryClient]);

  const clearSession = useCallback(() => {
    sessionGenerationRef.current += 1;
    accessTokenRef.current = null;
    sessionRef.current = null;
    setAccessToken(null);
    setSession(null);
    setStatus('unauthenticated');
    clearTenantState();
    removeObsoleteAuthStorage();
  }, [clearTenantState]);

  const establishSession = useCallback((nextSession: AuthSession, token: string) => {
    const previousSession = sessionRef.current;
    const identityChanged = previousSession !== null && (
      previousSession.user.id !== nextSession.user.id ||
      previousSession.organization.id !== nextSession.organization.id
    );

    if (identityChanged) {
      clearTenantState();
    }

    accessTokenRef.current = token;
    sessionRef.current = nextSession;
    setAccessToken(token);
    setSession(nextSession);
    setStatus('authenticated');
  }, [clearTenantState]);

  const refreshSession = useCallback((): Promise<string> => {
    if (!refreshSessionRef.current) {
      const sessionGeneration = sessionGenerationRef.current;
      refreshSessionRef.current = (async () => {
        const refreshed = await refreshSessionRequest();
        const authoritativeSession = await currentSessionRequest(refreshed.accessToken);
        if (sessionGeneration !== sessionGenerationRef.current) {
          throw new Error('Session changed during refresh');
        }
        establishSession(authoritativeSession, refreshed.accessToken);
        return refreshed.accessToken;
      })().finally(() => {
        refreshSessionRef.current = null;
      });
    }

    return refreshSessionRef.current;
  }, [establishSession]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    const result = await loginRequest({
      ...credentials,
      email: credentials.email.trim().toLowerCase(),
    });
    const authoritativeSession = await currentSessionRequest(result.accessToken);
    clearTenantState();
    establishSession(authoritativeSession, result.accessToken);
  }, [clearTenantState, establishSession]);

  const logout = useCallback(async (): Promise<void> => {
    clearSession();
    await logoutRequest();
  }, [clearSession]);

  const updateOrganization = useCallback((patch: Partial<AuthOrganization>) => {
    setSession((current) => {
      if (!current) return current;
      const nextSession = {
        ...current,
        organization: { ...current.organization, ...patch },
      };
      sessionRef.current = nextSession;
      return nextSession;
    });
  }, []);

  useEffect(() => registerAuthCoordinator({
    getAccessToken: () => accessTokenRef.current,
    refreshSession,
    clearSession,
  }), [clearSession, refreshSession]);

  useEffect(() => {
    removeObsoleteAuthStorage();
    void refreshSession().catch(() => {
      clearSession();
    });
  }, [clearSession, refreshSession]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    accessToken,
    user: session?.user ?? null,
    organization: session?.organization ?? null,
    login,
    logout,
    clearSession,
    refreshSession, // BUG FIX (#75): see interface note above
    updateOrganization,
  }), [accessToken, clearSession, login, logout, refreshSession, session, status, updateOrganization]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

// Settings widgets also render in isolated component tests and embeddable
// shells. They may synchronize session identity when a provider is present
// without making that provider mandatory.
export const useOptionalAuth = (): AuthContextValue | null =>
  useContext(AuthContext);
