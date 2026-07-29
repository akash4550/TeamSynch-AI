import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
      
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'teamsynch-ai-ui-storage', // local storage key
      partialize: (state) => ({ theme: state.theme, isSidebarOpen: state.isSidebarOpen }),
    }
  )
);
