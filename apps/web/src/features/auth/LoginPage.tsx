import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

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
    } catch {
      setAuthenticationError('Invalid credentials. Check your workspace, email, and password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-slate-900">
      <form
        className="w-full max-w-md rounded-lg bg-white p-8 shadow-md dark:bg-slate-800"
        onSubmit={handleSubmit}
        noValidate
      >
        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Sign in to TeamSynch AI</h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Use the identifier supplied by your workspace administrator.
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="organizationId">
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
          {errors.organizationId && (
            <p id="organizationId-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.organizationId}
            </p>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="email">
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.email}
            </p>
          )}
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="password">
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
          {errors.password && (
            <p id="password-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.password}
            </p>
          )}
        </div>

        {authenticationError && (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
            {authenticationError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
};
