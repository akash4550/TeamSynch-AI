import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { TeamDetailsPage } from '../TeamDetailsPage';
import { api } from '../../../lib/api';

/*
 * Regression tests for the TeamDetailsPage invite modal.
 *
 * The API error envelope is `{ success: false, error: { message } }` — the
 * modal previously stored the whole `error` OBJECT in state and rendered it
 * as a React child, throwing and unmounting the whole page on any failed
 * invite. These tests prove the nested message string is rendered as text
 * (and the app survives), plus the success path still closes the modal.
 */
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: 'team-1' }),
    useNavigate: () => routerMocks.navigate,
  };
});

vi.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'ADMIN' } }),
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);
const mockedPatch = vi.mocked(api.patch);
const mockedDelete = vi.mocked(api.delete);

const TEAM_MEMBERS = [
  {
    id: 'm1',
    role: 'OWNER',
    joinedAt: '2026-01-01T00:00:00Z',
    user: {
      id: 'u-owner',
      firstName: 'Olivia',
      lastName: 'Owner',
      email: 'olivia@example.com',
      avatar: null,
    },
  },
  {
    id: 'm2',
    role: 'MEMBER',
    joinedAt: '2026-01-02T00:00:00Z',
    user: {
      id: 'u-member',
      firstName: 'Mike',
      lastName: 'Member',
      email: 'mike@example.com',
      avatar: null,
    },
  },
];

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TeamDetailsPage />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/teams/team-1') {
      return Promise.resolve({
        data: {
          data: {
            id: 'team-1',
            name: 'Alpha Team',
            description: 'Core squad',
            color: '#3b82f6',
          },
        },
      });
    }
    if (url === '/teams/team-1/members') {
      return Promise.resolve({ data: { data: TEAM_MEMBERS } });
    }
    // invitations
    return Promise.resolve({ data: { data: [] } });
  });
});

/*
 * Regression tests for the TeamDetailsPage read-failure surfaces (Bug #33).
 *
 * The page used to gate ONLY on `teamLoading`, so a rejected GET /teams/:id
 * (500/network) rendered a blank shell — empty avatar, empty heading,
 * "Members (0)" — and a 404 (deleted team / stale deep-link) showed the
 * same shell instead of "not found". The members/invitations tab reads
 * failed into empty tables with fabricated "(0)" counts. These tests pin
 * the three new honest surfaces: the page-level error panel (+Retry),
 * the 404 panel (+Back to Teams), and the tab-level alert rows with the
 * "—" unknown-count badge.
 */
describe('TeamDetailsPage read-failure surfaces', () => {
  test('a failed team fetch renders the full-page panel instead of the blank shell, and recovers on Retry', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/teams/team-1') {
        return Promise.reject({
          response: { data: { success: false, error: { message: 'Database error' } } },
        });
      }
      if (url === '/teams/team-1/members') {
        return Promise.resolve({ data: { data: TEAM_MEMBERS } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("We couldn't load this team"),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Database error')).toBeInTheDocument();

    // The blank shell must NOT render: no team header, no tabs.
    expect(screen.queryByText('Core squad')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Members/ })).not.toBeInTheDocument();

    // Server recovers — Retry repaints the real page.
    mockedGet.mockImplementation((url: string) => {
      if (url === '/teams/team-1') {
        return Promise.resolve({
          data: {
            data: {
              id: 'team-1',
              name: 'Alpha Team',
              description: 'Core squad',
              color: '#3b82f6',
            },
          },
        });
      }
      if (url === '/teams/team-1/members') {
        return Promise.resolve({ data: { data: TEAM_MEMBERS } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        screen.queryByText("We couldn't load this team"),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Alpha Team')).toBeInTheDocument();
  });

  test('a 404 renders "Team not found" and Back to Teams navigates to the teams list', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/teams/team-1') {
        return Promise.reject({
          response: {
            status: 404,
            data: { success: false, error: { message: 'Team not found' } },
          },
        });
      }
      if (url === '/teams/team-1/members') {
        return Promise.resolve({ data: { data: TEAM_MEMBERS } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Team not found' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to Teams' }));
    expect(routerMocks.navigate).toHaveBeenCalledWith('/teams');
  });

  test('a failed members fetch shows the tab alert row and the honest "—" count instead of "(0)"', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/teams/team-1') {
        return Promise.resolve({
          data: {
            data: {
              id: 'team-1',
              name: 'Alpha Team',
              description: 'Core squad',
              color: '#3b82f6',
            },
          },
        });
      }
      if (url === '/teams/team-1/members') {
        return Promise.reject({
          response: {
            data: { success: false, error: { message: 'Members query exploded' } },
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    renderPage();

    expect(
      await screen.findByText("We couldn't load this team's members"),
    ).toBeInTheDocument();
    expect(screen.getByText('Members query exploded')).toBeInTheDocument();

    // The count badge must honestly read "—" (unknown), never "(0)".
    expect(
      screen.getByRole('button', { name: /Members \(—\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Members \(0\)/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('TeamDetailsPage invite modal error handling', () => {
  test('renders the API error message as text without crashing the page', async () => {
    // Duplicate-invite rejection in the real API envelope shape:
    // the `error` field is an OBJECT, not a string.
    mockedPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'An invitation has already been sent to this email' },
        },
      },
    });

    const user = userEvent.setup();
    renderPage();

    // Wait for the page to hydrate, then open the invite modal.
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /invite member/i }));

    await user.type(
      screen.getByPlaceholderText('teammate@company.com'),
      'teammate@company.com',
    );
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    // The nested message string renders as text — no "Objects are not valid
    // as a React child" crash, and the modal (and page) stay mounted.
    expect(
      await screen.findByText(
        'An invitation has already been sent to this email',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Invite Team Member')).toBeInTheDocument();
    expect(screen.getByText('Alpha Team')).toBeInTheDocument();
  });

  test('falls back to a safe string when the error payload has no message', async () => {
    mockedPost.mockRejectedValue(new Error('Network Error'));

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /invite member/i }));
    await user.type(
      screen.getByPlaceholderText('teammate@company.com'),
      'teammate@company.com',
    );
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(
      await screen.findByText(
        'Failed to send the invitation. Please check the email and try again.',
      ),
    ).toBeInTheDocument();
  });

  test('closes the modal and stays mounted on a successful invite', async () => {
    mockedPost.mockResolvedValue({ data: { success: true, data: {} } });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: /invite member/i }));
    await user.type(
      screen.getByPlaceholderText('teammate@company.com'),
      'newbie@company.com',
    );
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => {
      expect(screen.queryByText('Invite Team Member')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Alpha Team')).toBeInTheDocument();
  });
});

describe('TeamDetailsPage member role editing', () => {
  test('patches the member role and closes the modal on success', async () => {
    mockedPatch.mockResolvedValue({ data: { success: true, data: {} } });

    const user = userEvent.setup();
    renderPage();

    // Members tab renders by default; rows are [owner, member].
    await screen.findByText('Alpha Team');
    const editButtons = screen.getAllByRole('button', { name: 'Edit Role' });
    await user.click(editButtons[1]); // Mike Member's row

    await user.selectOptions(screen.getByRole('combobox'), 'LEAD');
    await user.click(screen.getByRole('button', { name: /save role/i }));

    expect(mockedPatch).toHaveBeenCalledWith(
      '/teams/team-1/members/u-member',
      { role: 'LEAD' },
    );
    await waitFor(() => {
      expect(screen.queryByText('Edit Member Role')).not.toBeInTheDocument();
    });
  });

  test('renders the API error message as text without crashing', async () => {
    mockedPatch.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'User is not a member of this team' },
        },
      },
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Alpha Team');
    const editButtons = screen.getAllByRole('button', { name: 'Edit Role' });
    await user.click(editButtons[1]);

    await user.selectOptions(screen.getByRole('combobox'), 'LEAD');
    await user.click(screen.getByRole('button', { name: /save role/i }));

    expect(
      await screen.findByText('User is not a member of this team'),
    ).toBeInTheDocument();
    expect(screen.getByText('Edit Member Role')).toBeInTheDocument();
  });

  test("disables the Edit Role button for the team owner (server rejects those changes)", async () => {
    renderPage();

    await screen.findByText('Alpha Team');
    const editButtons = screen.getAllByRole('button', { name: 'Edit Role' });
    expect(editButtons).toHaveLength(2);
    expect(editButtons[0]).toBeDisabled(); // Olivia Owner's row
    expect(editButtons[1]).toBeEnabled(); // Mike Member's row
  });
});

describe('TeamDetailsPage team deletion', () => {
  const openDeleteDialog = async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha Team');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Delete Team' }));
    return user;
  };

  test('requires the exact team name before the delete button enables', async () => {
    const user = await openDeleteDialog();

    const confirmButton = screen.getByRole('button', { name: /delete permanently/i });
    expect(confirmButton).toBeDisabled();

    await user.type(
      screen.getByLabelText(/type the team name to confirm/i),
      'Wrong Name',
    );
    expect(confirmButton).toBeDisabled();
    expect(mockedDelete).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/type the team name to confirm/i));
    await user.type(
      screen.getByLabelText(/type the team name to confirm/i),
      'Alpha Team',
    );
    expect(confirmButton).toBeEnabled();
  });

  test('deletes the team and navigates back to /teams on success', async () => {
    mockedDelete.mockResolvedValue({
      data: { success: true, message: 'Team deleted successfully' },
    });

    const user = await openDeleteDialog();
    await user.type(
      screen.getByLabelText(/type the team name to confirm/i),
      'Alpha Team',
    );
    await user.click(screen.getByRole('button', { name: /delete permanently/i }));

    expect(mockedDelete).toHaveBeenCalledWith('/teams/team-1');
    await waitFor(() => {
      expect(routerMocks.navigate).toHaveBeenCalledWith('/teams');
    });
  });

  test('renders the API error as text and stays put when deletion fails', async () => {
    mockedDelete.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: { message: 'Team not found' },
        },
      },
    });

    const user = await openDeleteDialog();
    await user.type(
      screen.getByLabelText(/type the team name to confirm/i),
      'Alpha Team',
    );
    await user.click(screen.getByRole('button', { name: /delete permanently/i }));

    expect(await screen.findByText('Team not found')).toBeInTheDocument();
    expect(routerMocks.navigate).not.toHaveBeenCalledWith('/teams');
    // The dialog stays open so the admin can see the failure.
    expect(screen.getByLabelText(/type the team name to confirm/i)).toBeInTheDocument();
  });
});
