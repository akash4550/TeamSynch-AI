import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { NotificationBell } from '../NotificationBell';
import { useRealtimeStore } from '../../../stores/useRealtimeStore';
import { api } from '../../../lib/api';

// The bell now hydrates from the notification ledger on mount and syncs
// read-state back to it — stub the HTTP layer for every test in this file.
vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    patch: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}));

const renderBell = () =>
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );

const openDropdown = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Notifications' }));
};

beforeEach(() => {
  useRealtimeStore.getState().reset();
});

describe('NotificationBell dropdown dismissal', () => {
  test('opens via the bell button and closes when pressing outside the dropdown', async () => {
    renderBell();
    await openDropdown();
    expect(screen.getByText('No notifications')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
  });

  test('closes when Escape is pressed', async () => {
    renderBell();
    await openDropdown();
    expect(screen.getByText('No notifications')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
  });

  test('clicking INSIDE the dropdown (Mark all as read) does not close it', async () => {
    useRealtimeStore.getState().addNotification({
      id: 'n1',
      title: 'New task assigned',
      message: 'You were assigned to a task.',
      read: false,
      createdAt: new Date('2026-08-03T10:00:00.000Z'),
    });

    renderBell();
    await openDropdown();

    const user = userEvent.setup();
    await user.click(screen.getByText('Mark all as read'));

    // Panel is still open…
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    // …and the store action ran (badge would now be 0)
    expect(useRealtimeStore.getState().unreadCount).toBe(0);
  });

  test('bell button still toggles the dropdown closed (previous behavior preserved)', async () => {
    renderBell();
    const user = userEvent.setup();
    const bell = screen.getByRole('button', { name: 'Notifications' });

    await user.click(bell);
    expect(screen.getByText('No notifications')).toBeInTheDocument();

    await user.click(bell);
    expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
  });
});

describe('NotificationBell ledger integration', () => {
  test('hydrates the store from GET /notifications on mount', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'row-1',
            title: 'Persisted alert',
            message: 'You were assigned to task: Write tests',
            read: false,
            createdAt: '2026-08-03T10:00:00.000Z',
          },
        ],
      },
    } as any);

    renderBell();

    await waitFor(() => expect(useRealtimeStore.getState().unreadCount).toBe(1));
    expect(useRealtimeStore.getState().notifications[0]?.id).toBe('row-1');

    await openDropdown();
    expect(screen.getByText('Persisted alert')).toBeInTheDocument();
  });

  test('marking all as read also syncs the ledger via PATCH /notifications/read-all', async () => {
    useRealtimeStore.getState().addNotification({
      id: 'n1',
      title: 'New task assigned',
      message: 'You were assigned to a task.',
      read: false,
      createdAt: new Date('2026-08-03T10:00:00.000Z'),
    });

    renderBell();
    await openDropdown();

    const user = userEvent.setup();
    await user.click(screen.getByText('Mark all as read'));

    expect(useRealtimeStore.getState().unreadCount).toBe(0);
    expect(api.patch).toHaveBeenCalledWith('/notifications/read-all');
  });
});
