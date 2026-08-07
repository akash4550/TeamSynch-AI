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
    },
  };
});
