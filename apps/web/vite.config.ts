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
  host: 'localhost',
  port: 5173,
  strictPort: true,
  proxy: {
    '/api': {
      target: developmentApiTarget,
      changeOrigin: false,
    },
    '/socket.io': {
      target: developmentApiTarget,
      changeOrigin: false,
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
