import axios, { type InternalAxiosRequestConfig } from 'axios';

import type {
  ApiEnvelope,
  AuthPayload,
  AuthSession,
  LoginCredentials,
} from '../features/auth/auth.types';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiBaseUrl = baseURL;

/*
 * FEATURE (ledger #8 — public logo rendering): <img> elements cannot attach
 * Authorization headers, so the API serves logos through the public route
 * GET /organizations/:id/logo (local: streamed bytes; S3: 302 to a fresh
 * presign — never an expiring stored blob). The optional `versionSeed` (the
 * stored logo reference, which changes on every upload) rides along as a
 * cache-busting query param so replacing a logo never shows the previous
 * image for the route's 5-minute browser-cache window; the server ignores it.
 */
export const organizationLogoUrl = (
  organizationId: string,
  versionSeed?: string | null,
): string =>
  `${apiBaseUrl}/organizations/${organizationId}/logo${
    versionSeed ? `?v=${encodeURIComponent(versionSeed)}` : ''
  }`;

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const authTransport = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface AuthCoordinator {
  getAccessToken: () => string | null;
  refreshSession: () => Promise<string>;
  clearSession: () => void;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
}

let authCoordinator: AuthCoordinator | null = null;
let refreshInFlight: Promise<string> | null = null;

export const registerAuthCoordinator = (
  coordinator: AuthCoordinator,
): (() => void) => {
  authCoordinator = coordinator;

  return () => {
    if (authCoordinator === coordinator) {
      authCoordinator = null;
      refreshInFlight = null;
    }
  };
};

const isRefreshExcludedRequest = (url?: string): boolean => {
  if (!url) return false;

  const path = url.split('?')[0]?.replace(/\/$/, '') ?? '';
  return ['/auth/login', '/auth/refresh', '/auth/logout'].some(
    (authPath) => path.endsWith(authPath),
  );
};

api.interceptors.request.use((config) => {
  const accessToken = authCoordinator?.getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const coordinator = authCoordinator;
    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._authRetry ||
      isRefreshExcludedRequest(originalRequest.url) ||
      !coordinator?.getAccessToken()
    ) {
      return Promise.reject(error);
    }

    originalRequest._authRetry = true;

    try {
      refreshInFlight ??= coordinator.refreshSession().finally(() => {
        refreshInFlight = null;
      });
      const accessToken = await refreshInFlight;
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api.request(originalRequest);
    } catch (refreshError) {
      coordinator.clearSession();
      return Promise.reject(refreshError);
    }
  },
);

export const loginRequest = async (
  credentials: LoginCredentials,
): Promise<AuthPayload> => {
  const response = await authTransport.post<ApiEnvelope<AuthPayload>>(
    '/auth/login',
    credentials,
  );
  return response.data.data;
};

export const refreshSessionRequest = async (): Promise<AuthPayload> => {
  const response = await authTransport.post<ApiEnvelope<AuthPayload>>(
    '/auth/refresh',
    {},
  );
  return response.data.data;
};

export const currentSessionRequest = async (
  accessToken: string,
): Promise<AuthSession> => {
  const response = await authTransport.get<ApiEnvelope<AuthSession>>('/auth/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return response.data.data;
};

export const logoutRequest = async (): Promise<void> => {
  await authTransport.post('/auth/logout', {});
};
