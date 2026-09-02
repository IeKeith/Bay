import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8086',
        changeOrigin: true,
      },
      '/satay_bg.jpg': {
        target: 'http://localhost:8086',
      },
      '/satay_dish.jpg': {
        target: 'http://localhost:8086',
      },
      '/prata_dish.jpg': {
        target: 'http://localhost:8086',
      },
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: false,
  },
});
