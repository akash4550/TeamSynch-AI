import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AuthUser } from '../../features/auth/auth.types';
import { LoginPage } from '../../features/auth/LoginPage';
import { useAuth } from '../../providers/AuthProvider';
import { ProtectedRoute } from '../ProtectedRoute';

vi.mock('../../providers/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const user: AuthUser = {
  id: 'user-1',
  organizationId: 'organization-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  role: 'MANAGER',
  avatar: null,
  emailVerified: true,
  lastLogin: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const defaultAuth = (): ReturnType<typeof useAuth> => ({
  status: 'unauthenticated',
  accessToken: null,
  user: null,
  organization: null,
  login: vi.fn(),
  logout: vi.fn(),
  clearSession: vi.fn(),
  // BUG FIX (#75): required by the widened AuthContextValue contract.
  refreshSession: vi.fn().mockResolvedValue('refreshed-access-token'),
});

const LocationProbe = () => {
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from;
  return (
    <span data-testid="redirect-state">
      {from ? `${from.pathname}${from.search}${from.hash}` : 'none'}
    </span>
  );
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue(defaultAuth());
});

describe('ProtectedRoute', () => {
  test('waits during authentication initialization without rendering protected content', () => {
    vi.mocked(useAuth).mockReturnValue({
      ...defaultAuth(),
      status: 'initializing',
    });

    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/private" element={<div>Protected content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Restoring your session');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  test('redirects unauthenticated users and preserves the full intended destination', () => {
    render(
      <MemoryRouter initialEntries={['/private?view=mine#details']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/private" element={<div>Protected content</div>} />
          </Route>
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('redirect-state')).toHaveTextContent(
      '/private?view=mine#details',
    );
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  test('uses the authoritative role for allowed and forbidden routes', () => {
    vi.mocked(useAuth).mockReturnValue({
      ...defaultAuth(),
      status: 'authenticated',
      accessToken: 'access-token',
      user,
    });

    const { rerender } = render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['MANAGER']} />}>
            <Route path="/private" element={<div>Manager content</div>} />
          </Route>
          <Route path="/403" element={<div>Forbidden</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Manager content')).toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
            <Route path="/private" element={<div>Manager content</div>} />
          </Route>
          <Route path="/403" element={<div>Forbidden</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  test('validates every required field before submitting', async () => {
    const browserUser = userEvent.setup();
    const login = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth(), login });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await browserUser.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid workspace identifier.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  test('submits normalized tenant-qualified credentials and navigates to the intended route', async () => {
    const browserUser = userEvent.setup();
    const login = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth(), login });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/login',
            state: {
              from: {
                pathname: '/projects',
                search: '?view=mine',
                hash: '#active',
              },
            },
          },
        ]}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/projects"
            element={(
              <>
                <span>Projects destination</span>
                <Outlet />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    await browserUser.type(
      screen.getByLabelText('Workspace or organization identifier'),
      ' 00000000-0000-4000-8000-000000000001 ',
    );
    await browserUser.type(screen.getByLabelText('Email'), ' Ada@Example.COM ');
    await browserUser.type(screen.getByLabelText('Password'), 'password123');
    await browserUser.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(login).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000001',
      email: 'ada@example.com',
      password: 'password123',
    });
    expect(await screen.findByText('Projects destination')).toBeInTheDocument();
  });

  test('shows one generic message for authentication failures', async () => {
    const browserUser = userEvent.setup();
    /*
     * REPIN (#102, 2026-08-06): this test's rejection simulated the
     * credential failure class (a deactivated account), which the API
     * deliberately maps to the same vague 401 as a wrong password — so
     * shape it that way. The assertion's intent survives: no server-side
     * reason ('Inactive user') may leak. Non-401 failures (429/5xx) are a
     * different class — covered by LoginPageErrors.test.tsx.
     */
    const credentialFailure = Object.assign(new Error('Inactive user'), {
      isAxiosError: true,
      response: { status: 401 },
    });
    const login = vi.fn().mockRejectedValue(credentialFailure);
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth(), login });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await browserUser.type(
      screen.getByLabelText('Workspace or organization identifier'),
      '00000000-0000-4000-8000-000000000001',
    );
    await browserUser.type(screen.getByLabelText('Email'), 'ada@example.com');
    await browserUser.type(screen.getByLabelText('Password'), 'password123');
    await browserUser.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid credentials. Check your workspace, email, and password.',
    );
    expect(screen.queryByText('Inactive user')).not.toBeInTheDocument();
  });
});
