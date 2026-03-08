import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// proxy target is only used in dev; in production VITE_API_URL is baked in at build time
const DEV_BACKEND = 'http://127.0.0.1:8000';

const backendProxy = {
  target: DEV_BACKEND,
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all backend API routes — eliminates CORS preflight in dev
      '/predict':      backendProxy,
      '/recall-curve': backendProxy,
      '/audit':        backendProxy,
      '/upload':       backendProxy,
      '/chat':         backendProxy,
      '/health':       backendProxy,
    },
  },
})
