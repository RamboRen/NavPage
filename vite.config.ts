import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    open: false,
    // 开发时把 /api 转发到本地后端，前后端同源，免去跨域配置
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
