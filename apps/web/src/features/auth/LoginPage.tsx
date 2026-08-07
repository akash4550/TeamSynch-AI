import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FolderKanban, Sparkles, Users } from 'lucide-react';
import axios from 'axios';

import { useAuth } from '../../providers/AuthProvider';

interface LoginErrors {
  organizationId?: string;
  email?: string;
  password?: string;
}

interface LoginLocationState {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const intendedDestination = (state: LoginLocationState | null): string => {
  const pathname = state?.from?.pathname;
  if (!pathname?.startsWith('/') || pathname.startsWith('//')) {
    return '/dashboard';
  }

  return `${pathname}${state?.from?.search ?? ''}${state?.from?.hash ?? ''}`;
};

export const LoginPage = () => {
  const { status, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const destination = intendedDestination(location.state as LoginLocationState | null);
  const [organizationId, setOrganizationId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [authenticationError, setAuthenticationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (status === 'initializing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-700 dark:bg-slate-900 dark:text-gray-200" role="status">
        Restoring your session…
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to={destination} replace />;
  }

  // --- Existing validation logic: untouched ---
  const validate = (): LoginErrors => {
    const nextErrors: LoginErrors = {};
    if (!uuidPattern.test(organizationId.trim())) {
      nextErrors.organizationId = 'Enter a valid workspace identifier.';
    }
    if (!emailPattern.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }
    return nextErrors;
  };

  // --- Existing submit handler: untouched ---
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setAuthenticationError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login({
        organizationId: organizationId.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      navigate(destination, { replace: true });
    } catch (error: unknown) {
      /*
       * BUG FIX (#102, 2026-08-06 — every login failure blamed the
       * password): this catch claimed "Invalid credentials" for ANY
       * rejection, so a rate-limited user (429 from the dedicated auth
       * limiter — reachable while typing the CORRECT password), a locked
       * window, or a plain service outage (5xx/network down) was told
       * their credentials were wrong — sending people into needless
       * password resets and retry storms. The API already keeps 401
       * deliberately vague (wrong password, deactivated account and
       * lockout are indistinguishable on purpose — enumeration safety
       * preserved below); the failure CLASS is not a secret. Split:
       *   401 → the existing vague credential message (unchanged);
       *   429 → the truth: too many attempts, wait;
       *   else (5xx/network/unknown) → the truth: service unavailable.
       */
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401) {
        setAuthenticationError('Invalid credentials. Check your workspace, email, and password.');
      } else if (status === 429) {
        setAuthenticationError('Too many sign-in attempts. Please wait a few minutes and try again.');
      } else {
        setAuthenticationError('We could not sign you in right now — the service may be temporarily unavailable. Please try again in a moment.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * Shared input styling — visual only. Error state gets a red border/ring.
   * The id / name / htmlFor wiring is identical to the original component.
   */
  const inputClass = (hasError?: string) =>
    `w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:ring-2 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500 ${
      hasError
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 dark:border-slate-600'
    }`;

  return (
    /* RESPONSIVE LAYOUT: single centered column on mobile, 50/50 split on lg+ */
    <main className="grid min-h-screen bg-white dark:bg-slate-900 lg:grid-cols-2">
      {/* ---- Brand panel (desktop only) — gradient showcase, purely presentational ---- */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 p-12 text-white lg:flex">
        {/* Decorative ambient glow blobs */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-primary-400/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-sm font-bold backdrop-blur">
            TS
          </span>
          <span className="text-lg font-bold tracking-tight">TeamSynch AI</span>
        </div>

        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            Your team&apos;s work,
            <br />
            synced in one place.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-primary-100">
            Projects, tasks, CRM, documents and an AI assistant — unified in a
            single workspace built for modern teams.
          </p>

          <ul className="mt-8 space-y-4 text-sm">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                <FolderKanban className="h-4 w-4" />
              </span>
              Project & task tracking with live updates
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                <Users className="h-4 w-4" />
              </span>
              Built-in CRM for clients, leads and pipeline
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                <Sparkles className="h-4 w-4" />
              </span>
              AI assistant grounded in your workspace data
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-primary-200">
          © {new Date().getFullYear()} TeamSynch AI. Secure multi-tenant workspace.
        </p>
      </div>

      {/* ---- Form column ---- */}
      <div className="flex items-center justify-center bg-gray-50 px-4 py-10 sm:px-8 dark:bg-slate-900">
        <div className="w-full max-w-md">
          {/* Compact brand header — visible on mobile/tablet only */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-bold text-white shadow-md shadow-primary-600/25">
              TS
            </span>
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
              TeamSynch <span className="text-primary-600 dark:text-primary-400">AI</span>
            </span>
          </div>

          {/* Login card — same <form>, ids, labels and handlers as the original */}
          <form
            className="w-full rounded-2xl border border-gray-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] sm:p-8 dark:border-slate-700/80 dark:bg-slate-800"
            onSubmit={handleSubmit}
            noValidate
          >
            <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Sign in to TeamSynch AI
            </h1>
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
              Use the identifier supplied by your workspace administrator.
            </p>

            {/* Field group — consistent vertical rhythm via space-y + mb on errors */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="organizationId">
                Workspace or organization identifier
              </label>
              <input
                id="organizationId"
                name="organizationId"
                type="text"
                autoComplete="organization"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                aria-invalid={Boolean(errors.organizationId)}
                aria-describedby={errors.organizationId ? 'organizationId-error' : undefined}
                className={inputClass(errors.organizationId)}
              />
              {errors.organizationId && (
                <p id="organizationId-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {errors.organizationId}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={inputClass(errors.email)}
              />
              {errors.email && (
                <p id="email-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
                className={inputClass(errors.password)}
              />
              {errors.password && (
                <p id="password-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {errors.password}
                </p>
              )}
            </div>

            {authenticationError && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
                {authenticationError}
              </p>
            )}

            {/* Submit — same accessible name ('Sign in' / 'Signing in…') */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-800"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
            Protected by role-based access control and tenant isolation.
          </p>
        </div>
      </div>
    </main>
  );
};
