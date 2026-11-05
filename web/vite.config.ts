import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: false,
        // keep SSE streaming un-buffered
        configure: (proxy) => {
          proxy.on('proxyRes', (res) => {
            if (res.headers['content-type']?.includes('text/event-stream')) res.headers['cache-control'] = 'no-cache';
          });
        },
      },
    },
  },
});
