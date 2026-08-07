/*
 * BUG FIX (#102, 2026-08-06) pins — login failure-class honesty:
 *   401 → vague credential message (API's enumeration-safe contract);
 *   429 → honest rate-limit truth;
 *   5xx / network → honest service-unavailable truth.
 * Previously ALL of these claimed "Invalid credentials".
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';

import { LoginPage } from '../LoginPage';

const loginMock = vi.fn();

vi.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({
    status: 'unauthenticated',
    login: loginMock,
  }),
}));

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  );

const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(
    screen.getByLabelText(/workspace or organization identifier/i),
    '123e4567-e89b-42d3-a456-426614174000',
  );
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
};

const axiosError = (status?: number) => {
  const error = new Error('Request failed') as Error & {
    isAxiosError: boolean;
    response?: { status: number };
  };
  (error as any).isAxiosError = true;
  if (status !== undefined) {
    (error as any).response = { status };
  }
  return error;
};

describe('LoginPage — failure-class honesty (Bug #102)', () => {
  test('a 401 keeps the deliberately vague credential message (enumeration-safe)', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValueOnce(axiosError(401));
    renderLogin();

    await fillAndSubmit(user);

    expect(
      await screen.findByText('Invalid credentials. Check your workspace, email, and password.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('a 429 rate limit tells the truth instead of calling the password wrong', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValueOnce(axiosError(429));
    renderLogin();

    await fillAndSubmit(user);

    expect(
      await screen.findByText('Too many sign-in attempts. Please wait a few minutes and try again.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/invalid credentials/i),
    ).not.toBeInTheDocument();
  });

  test('a service outage (500 / no response) says unavailable, not "invalid credentials"', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValueOnce(axiosError(500));
    renderLogin();

    await fillAndSubmit(user);

    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/invalid credentials/i),
    ).not.toBeInTheDocument();
  });
});
