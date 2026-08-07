import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(() => {
  const developmentApiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: developmentApiTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: developmentApiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
                return 'vendor-react';
              }
              if (id.includes('@tanstack/react-query') || id.includes('@tanstack/react-virtual')) {
                return 'vendor-tanstack';
              }
              if (id.includes('lucide-react') || id.includes('@heroicons/react')) {
                return 'vendor-icons';
              }
              if (id.includes('yjs') || id.includes('y-websocket') || id.includes('@tiptap')) {
                return 'vendor-crdt';
              }
              if (id.includes('@tremor/react')) {
                return 'vendor-ui';
              }
              return 'vendor-misc';
            }
          },
        },
      },
    },
  };
});
