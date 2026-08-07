import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { UserManagement } from '../UserManagement';
import { api } from '../../../lib/api';

/*
 * Regression tests for the "Add User" modal error handling.
 *
 * createUserMutation previously had no onError at all, so duplicate-email
 * conflicts (409), short passwords (400), and invalid payloads were
 * completely invisible — admins saw the modal do nothing. These tests pin
 * the inline feedback: server message rendered as text, stale errors
 * cleared when the modal closes, and the success path posting the right
 * payload and closing the modal.
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UserManagement />
    </QueryClientProvider>,
  );
};

const openModalAndFill = async () => {
  const user = userEvent.setup();
  await screen.findByText('User Management');
  await user.click(screen.getByRole('button', { name: /add user/i }));
  await user.type(screen.getByLabelText(/first name/i), 'Jane');
  await user.type(screen.getByLabelText(/last name/i), 'Doe');
  await user.type(screen.getByPlaceholderText(/employee@company.com/i), 'dup@company.com');
  // BUG FIX (#89): password is honestly required now (the old "optional /
  // auto-generated" copy always 400'd server-side) — the form cannot
  // submit without it, so the happy-path fixture must type one.
  await user.type(screen.getByLabelText(/password/i), 'supersecret1');
  return user;
};

// With the modal open, two buttons read "Add User": the page header CTA and
// the form's submit. The submit is the second one in DOM order.
const clickSubmitAddUser = async (user: ReturnType<typeof userEvent.setup>) => {
  const addUserButtons = screen.getAllByRole('button', { name: /^add user$/i });
  await user.click(addUserButtons[addUserButtons.length - 1]);
};

beforeEach(() => {
  mockedGet.mockResolvedValue({
    data: {
      data: {
        users: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      },
    },
  });
});

describe('UserManagement create-user feedback', () => {
  test('renders the server error message as text when creation is rejected', async () => {
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Duplicate record' },
        },
      },
    });

    const user = await (async () => {
      renderPage();
      return openModalAndFill();
    })();

    await clickSubmitAddUser(user);

    expect(await screen.findByText('Duplicate record')).toBeInTheDocument();
    // The modal stays open so the admin sees the failure.
    expect(screen.getByText('Add New User')).toBeInTheDocument();
  });

  test('clears the stale error when the modal is closed and reopened', async () => {
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Duplicate record' },
        },
      },
    });

    const user = await (async () => {
      renderPage();
      return openModalAndFill();
    })();

    await clickSubmitAddUser(user);
    expect(await screen.findByText('Duplicate record')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Add New User')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add user/i }));
    expect(screen.getByText('Add New User')).toBeInTheDocument();
    expect(screen.queryByText('Duplicate record')).not.toBeInTheDocument();
  });

  test('posts the expected payload and closes the modal on success', async () => {
    mockedPost.mockResolvedValue({ data: { success: true, data: {} } });

    const user = await (async () => {
      renderPage();
      return openModalAndFill();
    })();

    await clickSubmitAddUser(user);

    expect(mockedPost).toHaveBeenCalledWith(
      '/users',
      expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'dup@company.com',
        role: 'EMPLOYEE',
        // BUG FIX (#89): the real credential is posted — never `undefined`
        // (the old pin locked in the "optional password" lie that the
        // server always rejected with 400 'Password is required').
        password: 'supersecret1',
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText('Add New User')).not.toBeInTheDocument();
    });
  });
});
