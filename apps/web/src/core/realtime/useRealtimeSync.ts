import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { PIPELINE_BOARD_QUERY_KEY } from '../../modules/crm/api/usePipeline';

let socket: Socket | null = null;

export const useRealtimeSync = (token: string | null, organizationId?: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token || !organizationId) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      return;
    }

    // Connect Socket.IO client with handshake auth token
    const socketUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    // Real-Time Event Handlers for Query Cache Invalidation
    socket.on('crm.opportunity.moved', () => {
      queryClient.invalidateQueries({ queryKey: PIPELINE_BOARD_QUERY_KEY });
    });

    socket.on('task.created', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socket.on('task.updated', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socket.on('task.assigned', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socket.on('project.created', () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    });

    socket.on('notification.new', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      if (socket) {
        socket.off('crm.opportunity.moved');
        socket.off('task.created');
        socket.off('task.updated');
        socket.off('task.assigned');
        socket.off('project.created');
        socket.off('notification.new');
        socket.disconnect();
        socket = null;
      }
    };
  }, [token, organizationId, queryClient]);
};
